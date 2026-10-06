/**
 * Embeddings vectoriales con pgvector para el asistente RAG.
 *
 * ## Por que el acceso al vector es SQL crudo
 *
 * Prisma 5 no expone un tipo `vector` nativo, por lo que la columna se declara
 * como `Unsupported("vector(1536)")` en `prisma/schema.prisma`. Prisma Client
 * por tanto NUNCA lee ni escribe esa columna: aqui se usa `$executeRaw` y
 * `$queryRaw`, que parametrizan los valores (`$1`, `$2`, ...) y eliminan el
 * riesgo de inyeccion SQL.
 *
 * ## Flujo de indexado
 *
 * 1. `generateEmbedding(texto)` llama al modelo `gemini-embedding-2`
 *    (Google Gemini, capa gratuita) a traves del Vercel AI SDK.
 * 2. `upsertEmbedding(...)` serializa el vector como `[0.1,0.2,...]` y lo
 *    persiste con `ON CONFLICT ("entityType","entityId")`, de modo que
 *    re-indexar una entidad sobrescribe el embedding anterior en vez de
 *    duplicarlo.
 * 3. `similaritySearch(...)` ordena por distancia coseno (`<=>`) y devuelve
 *    `1 - distancia` como score de similitud (0 = ajeno, 1 = identico).
 *
 * ## Por que `outputDimensionality`
 *
 * `gemini-embedding-2` genera vectores de 3072 dimensiones por defecto, pero
 * esta entrenado con Matryoshka Representation Learning (MRL) y admite
 * truncarlos a 128-3072. Se piden explicitamente **1536** para conservar la
 * columna `vector(1536)` del esquema: asi la migracion de OpenAI a Gemini no
 * exige ALTER TABLE ni recrear el indice HNSW. Google recomienda 768, 1536 o
 * 3072; a 1536 el MTEB (68.17) es practicamente identico al de 3072.
 *
 * Si falta `GOOGLE_GENERATIVE_AI_API_KEY` las funciones de generacion lanzan
 * `EmbeddingUnavailableError`; las funciones de escritura (`indexEntity`,
 * `indexProject`, `indexTask`) capturan el error y devuelven `false` para que
 * crear o actualizar un proyecto/tarea nunca falle por un problema de
 * indexacion.
 */
import { google } from '@ai-sdk/google';
import { embed } from 'ai';

import { getPrisma } from '@/lib/prisma';

/**
 * Modelo de embeddings de Google Gemini.
 *
 * Sustituye a `text-embedding-004`, apagado por Google el 14/01/2026.
 * Requiere `vector(1536)` en el esquema (ver `EMBEDDING_DIMENSIONS`).
 */
export const EMBEDDING_MODEL_ID = 'gemini-embedding-2';

/**
 * Dimensiones del vector; debe coincidir con `vector(1536)`.
 *
 * El valor no lo decide el modelo sino `outputDimensionality`, que se envia
 * en cada llamada desde `generateEmbedding`.
 */
export const EMBEDDING_DIMENSIONS = 1536;

/** Numero de resultados que devuelve la busqueda por defecto. */
export const DEFAULT_TOP_K = 5;

/** Tope maximo de resultados para evitar consultas excesivamente amplias. */
export const MAX_TOP_K = 20;

/**
 * Variable de entorno requerida para generar embeddings.
 *
 * Es la que el provider `@ai-sdk/google` lee por defecto; se puede
 * sobreescribir con `createGoogle({ apiKey })` si hiciera falta.
 */
export const GOOGLE_CREDENTIAL_ENV = 'GOOGLE_GENERATIVE_AI_API_KEY';

/** Entidades que pueden tener embedding vectorial. Espejo del enum de Prisma. */
export type EmbeddingEntityType = 'PROJECT' | 'TASK';

/** Texto listo para indexar y citar en la respuesta del asistente. */
export interface IndexableEntity {
  entityType: EmbeddingEntityType;
  /** Id de `Project` o `Task`. */
  entityId: string;
  /** Id del proyecto al que pertenece (denormalizado para el filtro coseno). */
  projectId: string;
  /** Titulo legible usado como fuente en la respuesta. */
  title: string;
  /** Texto que se envia al modelo de embeddings. */
  content: string;
}

/** Subconjunto de un proyecto necesario para indexarlo. */
export interface ProjectForIndexing {
  id: string;
  name: string;
  description?: string | null;
}

/** Subconjunto de una tarea necesario para indexarla. */
export interface TaskForIndexing {
  id: string;
  title: string;
  description?: string | null;
  projectId: string;
  status?: string | null;
  priority?: string | null;
}

/** Resultado de una busqueda de similitud o lexica. */
export interface SimilarityHit {
  entityType: EmbeddingEntityType;
  entityId: string;
  projectId: string;
  title: string;
  content: string;
  /** Similitud en el rango [0, 1]. En la busqueda lexica es `0`. */
  score: number;
}

/** Opciones comunes de busqueda. */
export interface SearchOptions {
  /** Restringe los resultados a un proyecto concreto. */
  projectId?: string;
  /** Numero de resultados (entre 1 y `MAX_TOP_K`). */
  topK?: number;
}

/**
 * Error lanzado cuando falta la credencial del proveedor de IA.
 *
 * Se distingue del resto para que `/api/chat` pueda caer a busqueda lexica
 * en vez de devolver un 500.
 */
export class EmbeddingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingUnavailableError';
  }
}

/** Fila cruda devuelta por la consulta coseno o lexica. */
interface SimilarityRow {
  entityType: string;
  entityId: string;
  projectId: string;
  title: string;
  content: string;
  /** `1 - distancia coseno` calculada por PostgreSQL. */
  score: number | string;
}

/**
 * Comprueba que la credencial de Google este definida.
 *
 * Se usa tanto para embeddings como para generar la respuesta del LLM en
 * `/api/chat`: ambos flujos comparten `GOOGLE_GENERATIVE_AI_API_KEY`.
 *
 * @param env - Objeto de entorno; por defecto `process.env`.
 * @returns `true` si `GOOGLE_GENERATIVE_AI_API_KEY` existe y no esta vacia.
 */
export function hasGoogleCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env[GOOGLE_CREDENTIAL_ENV]?.trim());
}

/**
 * Serializa un vector al formato textual que entiende pgvector.
 *
 * @param embedding - Array de numeros ya generado por el modelo.
 * @returns Cadena con formato `[0.1,0.2,...]`.
 * @throws {Error} Si la dimension no es `EMBEDDING_DIMENSIONS` o algun valor
 * no es finito: un vector de otra longitud haria que PostgreSQL rechazara
 * toda la escritura (`1536` datos en una columna `vector(1536)`).
 */
export function toVectorParam(embedding: ReadonlyArray<number>): string {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Dimension de embedding invalida: se esperaban ${EMBEDDING_DIMENSIONS} y llegaron ${embedding.length}.`,
    );
  }

  for (const value of embedding) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error('El vector contiene valores no numericos o no finitos.');
    }
  }

  return `[${embedding.join(',')}]`;
}

/**
 * Limita un score al rango [0, 1].
 *
 * La distancia coseno de pgvector va de 0 a 2, por lo que `1 - distancia`
 * puede ser negativo; se recorta para que el cliente pueda pintar un
 * porcentaje confiable.
 *
 * @param score - Score crudo devuelto por PostgreSQL.
 * @returns Score recortado; `0` si el valor no es numerico.
 */
export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(1, Math.max(0, score));
}

/**
 * Normaliza el `topK` pedido por el caller.
 *
 * @param topK - Valor opcional del cliente.
 * @returns Entero entre 1 y `MAX_TOP_K`.
 */
export function normalizeTopK(topK?: number): number {
  if (typeof topK !== 'number' || !Number.isFinite(topK)) return DEFAULT_TOP_K;
  return Math.min(MAX_TOP_K, Math.max(1, Math.floor(topK)));
}

/**
 * Genera el embedding de un texto con el Vercel AI SDK.
 *
 * @param text - Texto a embedir (se recorta antes de enviarlo).
 * @returns Vector de `EMBEDDING_DIMENSIONS` dimensiones.
 * @throws {Error} Si el texto esta vacio o el proveedor devuelve algo inesperado.
 * @throws {EmbeddingUnavailableError} Si falta `GOOGLE_GENERATIVE_AI_API_KEY`.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const value = text.trim();

  if (!value) {
    throw new Error('generateEmbedding: el texto a indexar no puede estar vacio.');
  }

  if (!hasGoogleCredentials()) {
    throw new EmbeddingUnavailableError(
      `Falta la variable de entorno ${GOOGLE_CREDENTIAL_ENV}: no se pueden generar embeddings.`,
    );
  }

  try {
    const result = await embed({
      model: google.embeddingModel(EMBEDDING_MODEL_ID),
      value,
      // Gemini devuelve 3072 por defecto; se trunca a 1536 para respetar la
      // columna `vector(1536)` sin necesidad de migrar el esquema.
      providerOptions: {
        google: { outputDimensionality: EMBEDDING_DIMENSIONS },
      },
    });
    const embedding = result.embedding;

    // toVectorParam valida tanto la dimension como la finitud de los valores.
    toVectorParam(embedding);

    return [...embedding];
  } catch (error) {
    if (error instanceof EmbeddingUnavailableError) throw error;

    console.error(`[embeddings] Fallo al generar embedding con ${EMBEDDING_MODEL_ID}:`, error);
    throw new Error(
      `No se pudo generar el embedding: ${error instanceof Error ? error.message : 'error desconocido'}`,
    );
  }
}

/**
 * Crea o sobrescribe el embedding de una entidad (upsert idempotente).
 *
 * @param entity - Metadatos y texto de la entidad.
 * @param embedding - Vector devuelto por `generateEmbedding`.
 * @throws {Error} Si la escritura en PostgreSQL falla.
 */
export async function upsertEmbedding(
  entity: IndexableEntity,
  embedding: ReadonlyArray<number>,
): Promise<void> {
  const vector = toVectorParam(embedding);
  const id = globalThis.crypto.randomUUID();

  try {
    await getPrisma().$executeRaw`
      INSERT INTO "Embedding" (
        "id", "entityType", "entityId", "projectId", "title", "content",
        "embedding", "createdAt", "updatedAt"
      )
      VALUES (
        ${id},
        CAST(${entity.entityType} AS "EmbeddingEntityType"),
        ${entity.entityId},
        ${entity.projectId},
        ${entity.title},
        ${entity.content},
        CAST(${vector} AS vector),
        NOW(),
        NOW()
      )
      ON CONFLICT ("entityType", "entityId")
      DO UPDATE SET
        "projectId" = EXCLUDED."projectId",
        "title" = EXCLUDED."title",
        "content" = EXCLUDED."content",
        "embedding" = EXCLUDED."embedding",
        "updatedAt" = NOW()
    `;
  } catch (error) {
    console.error(
      `[embeddings] Fallo al guardar el embedding de ${entity.entityType}:${entity.entityId}:`,
      error,
    );
    throw new Error(
      `No se pudo persistir el embedding en PostgreSQL: ${error instanceof Error ? error.message : 'error desconocido'}`,
    );
  }
}

/**
 * Genera y guarda el embedding de una entidad.
 *
 * Nunca lanza: el error se captura aqui para que crear o actualizar un
 * proyecto/tarea no falle si el proveedor de IA esta caido.
 *
 * @param entity - Entidad a indexar.
 * @returns `true` si la indexacion termino bien, `false` en caso contrario.
 */
export async function indexEntity(entity: IndexableEntity): Promise<boolean> {
  try {
    const embedding = await generateEmbedding(entity.content);
    await upsertEmbedding(entity, embedding);
    return true;
  } catch (error) {
    console.error(
      `[embeddings] Indexacion omitida para ${entity.entityType}:${entity.entityId}:`,
      error,
    );
    return false;
  }
}

/**
 * Compone el texto que representa a un proyecto.
 *
 * @param project - Proyecto a indexar.
 * @returns Texto legible para el modelo de embeddings.
 */
export function buildProjectContent(project: ProjectForIndexing): string {
  return joinLines([`Proyecto: ${project.name}`, project.description]);
}

/**
 * Compone el texto que representa a una tarea, con su estado y prioridad.
 *
 * @param task - Tarea a indexar.
 * @returns Texto legible para el modelo de embeddings.
 */
export function buildTaskContent(task: TaskForIndexing): string {
  return joinLines([
    `Tarea: ${task.title}`,
    task.description,
    task.status ? `Estado: ${task.status}` : undefined,
    task.priority ? `Prioridad: ${task.priority}` : undefined,
  ]);
}

/**
 * Indexa (o re-indexa) un proyecto.
 *
 * @param project - Proyecto creado o actualizado.
 * @returns `true` si se guardo el embedding.
 */
export async function indexProject(project: ProjectForIndexing): Promise<boolean> {
  return indexEntity({
    entityType: 'PROJECT',
    entityId: project.id,
    projectId: project.id,
    title: project.name,
    content: buildProjectContent(project),
  });
}

/**
 * Indexa (o re-indexa) una tarea.
 *
 * @param task - Tarea creada o actualizada.
 * @returns `true` si se guardo el embedding.
 */
export async function indexTask(task: TaskForIndexing): Promise<boolean> {
  return indexEntity({
    entityType: 'TASK',
    entityId: task.id,
    projectId: task.projectId,
    title: task.title,
    content: buildTaskContent(task),
  });
}

/**
 * Busqueda por similitud coseno sobre `Embedding`.
 *
 * @param query - Pregunta del usuario.
 * @param options - `projectId` opcional y numero de resultados.
 * @returns Los `topK` resultados mas similares, ordenados de mayor a menor.
 * @throws {EmbeddingUnavailableError} Si falta `GOOGLE_GENERATIVE_AI_API_KEY`.
 * @throws {Error} Si la consulta a PostgreSQL falla.
 */
export async function similaritySearch(
  query: string,
  options: SearchOptions = {},
): Promise<SimilarityHit[]> {
  const value = query.trim();

  if (!value) {
    throw new Error('similaritySearch: la pregunta no puede estar vacia.');
  }

  const topK = normalizeTopK(options.topK);
  // Lanza EmbeddingUnavailableError sin llegar a tocar la base de datos.
  const vector = toVectorParam(await generateEmbedding(value));
  const projectId = options.projectId;
  let rows: SimilarityRow[];

  try {
    rows = projectId
      ? await getPrisma().$queryRaw<SimilarityRow[]>`
          SELECT "entityType", "entityId", "projectId", "title", "content",
                 1 - ("embedding" <=> CAST(${vector} AS vector)) AS "score"
          FROM "Embedding"
          WHERE "embedding" IS NOT NULL AND "projectId" = ${projectId}
          ORDER BY "embedding" <=> CAST(${vector} AS vector) ASC
          LIMIT ${topK}
        `
      : await getPrisma().$queryRaw<SimilarityRow[]>`
          SELECT "entityType", "entityId", "projectId", "title", "content",
                 1 - ("embedding" <=> CAST(${vector} AS vector)) AS "score"
          FROM "Embedding"
          WHERE "embedding" IS NOT NULL
          ORDER BY "embedding" <=> CAST(${vector} AS vector) ASC
          LIMIT ${topK}
        `;
  } catch (error) {
    console.error('[embeddings] Fallo la busqueda vectorial:', error);
    throw new Error(
      `La busqueda por similitud coseno fallo: ${error instanceof Error ? error.message : 'error desconocido'}`,
    );
  }

  return rows.map(toSimilarityHit);
}

/**
 * Busqueda lexica de respaldo cuando no hay credencial de IA.
 *
 * Usa `ILIKE` sobre el texto indexado: no ordena por similitud, pero permite
 * que `/api/chat` siga respondiendo con contexto real en local o en CI.
 *
 * @param query - Pregunta del usuario.
 * @param options - `projectId` opcional y numero de resultados.
 * @returns Resultados con `score = 0`, ordenados por novedad.
 * @throws {Error} Si la consulta a PostgreSQL falla.
 */
export async function lexicalSearch(
  query: string,
  options: SearchOptions = {},
): Promise<SimilarityHit[]> {
  const value = query.trim();

  if (!value) {
    throw new Error('lexicalSearch: la pregunta no puede estar vacia.');
  }

  const topK = normalizeTopK(options.topK);
  // Se escapan `%`, `_` y `\`; en LIKE, `\` ya es el caracter de escape por
  // defecto en PostgreSQL, asi que no hace falta una clausula ESCAPE.
  const pattern = `%${value.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
  const projectId = options.projectId;
  let rows: SimilarityRow[];

  try {
    rows = projectId
      ? await getPrisma().$queryRaw<SimilarityRow[]>`
          SELECT "entityType", "entityId", "projectId", "title", "content", 0 AS "score"
          FROM "Embedding"
          WHERE "projectId" = ${projectId}
            AND ("title" ILIKE ${pattern} OR "content" ILIKE ${pattern})
          ORDER BY "createdAt" DESC
          LIMIT ${topK}
        `
      : await getPrisma().$queryRaw<SimilarityRow[]>`
          SELECT "entityType", "entityId", "projectId", "title", "content", 0 AS "score"
          FROM "Embedding"
          WHERE "title" ILIKE ${pattern} OR "content" ILIKE ${pattern}
          ORDER BY "createdAt" DESC
          LIMIT ${topK}
        `;
  } catch (error) {
    console.error('[embeddings] Fallo la busqueda lexica:', error);
    throw new Error(
      `La busqueda lexica fallo: ${error instanceof Error ? error.message : 'error desconocido'}`,
    );
  }

  return rows.map(toSimilarityHit);
}

/**
 * Elimina el embedding de una entidad.
 *
 * @param entityType - `PROJECT` o `TASK`.
 * @param entityId - Id de la entidad.
 * @returns Numero de filas eliminadas.
 */
export async function deleteEmbedding(
  entityType: EmbeddingEntityType,
  entityId: string,
): Promise<number> {
  try {
    return await getPrisma().$executeRaw`
      DELETE FROM "Embedding"
      WHERE "entityType" = CAST(${entityType} AS "EmbeddingEntityType") AND "entityId" = ${entityId}
    `;
  } catch (error) {
    console.error(`[embeddings] Fallo al eliminar el embedding de ${entityType}:${entityId}:`, error);
    throw new Error('No se pudo eliminar el embedding de la base de datos.');
  }
}

/**
 * Elimina todos los embeddings de un proyecto (proyecto + sus tareas).
 *
 * @param projectId - Id del proyecto.
 * @returns Numero de filas eliminadas.
 */
export async function deleteProjectEmbeddings(projectId: string): Promise<number> {
  try {
    return await getPrisma().$executeRaw`
      DELETE FROM "Embedding" WHERE "projectId" = ${projectId}
    `;
  } catch (error) {
    console.error(`[embeddings] Fallo al eliminar los embeddings del proyecto ${projectId}:`, error);
    throw new Error('No se pudieron eliminar los embeddings del proyecto.');
  }
}

/** Une lineas ignorando las que lleguen vacias o sin definir. */
function joinLines(parts: ReadonlyArray<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join('\n');
}

/** Convierte la columna enum devuelta por PostgreSQL en un tipo tipado. */
function toEntityType(value: string): EmbeddingEntityType {
  if (value !== 'PROJECT' && value !== 'TASK') {
    throw new Error(`Tipo de entidad desconocido: ${value}`);
  }
  return value;
}

/** Mapea una fila cruda al dominio, recortando el score a [0, 1]. */
function toSimilarityHit(row: SimilarityRow): SimilarityHit {
  return {
    entityType: toEntityType(row.entityType),
    entityId: row.entityId,
    projectId: row.projectId,
    title: row.title,
    content: row.content,
    score: clampScore(Number(row.score)),
  };
}
