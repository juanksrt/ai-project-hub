/**
 * Contrato HTTP compartido entre `POST /api/chat` (servidor) y el componente
 * de Chat del Dashboard (cliente).
 *
 * Las fuentes viajan en cabeceras porque el cuerpo de la respuesta es un
 * stream de texto plano: las cabeceras se envian antes de que empiece el
 * streaming, de modo que el cliente sabe que citar mientras la respuesta se
 * genera.
 *
 * El JSON se codifica con `encodeURIComponent` porque los titulos pueden
 * contener acentos y la spec HTTP exige cabeceras ASCII.
 */

/** Fuente citada por el asistente RAG. */
export interface RagSource {
  /** De donde viene el fragmento: proyecto, tarea o documento indexado. */
  type: 'PROJECT' | 'TASK' | 'DOCUMENT';
  /** Id del registro fuente. */
  id: string;
  /** Titulo exacto que se muestra y se cita en la respuesta. */
  title: string;
  /** Similitud coseno en [0, 1]. Solo la llevan las fuentes vectoriales. */
  score?: number;
}

/** Como se ha producido la respuesta que viaja en el cuerpo. */
export type RagAnswerMode =
  /** Respuesta redactada por el LLM con el contexto recuperado. */
  | 'llm'
  /** Sin credencial de IA: se devuelve el contexto recuperado tal cual. */
  | 'context';

/** Como se han recuperado las fuentes. */
export type RagRetrievalMode =
  /** Busqueda por similitud coseno con pgvector. */
  | 'vector'
  /** Busqueda lexica (`ILIKE`) de respaldo cuando no hay credencial de IA. */
  | 'lexical';

/** Cabecera con el array de fuentes (JSON codificado con `encodeURIComponent`). */
export const RAG_SOURCES_HEADER = 'X-RAG-Sources';

/** Cabecera con el modo de respuesta: `llm` o `context`. */
export const RAG_MODE_HEADER = 'X-RAG-Mode';

/** Cabecera con el modo de recuperacion: `vector` o `lexical`. */
export const RAG_RETRIEVAL_HEADER = 'X-RAG-Retrieval';

/** Metadatos RAG leidos de la respuesta del servidor. */
export interface RagResponseMeta {
  sources: RagSource[];
  mode: RagAnswerMode;
  retrieval: RagRetrievalMode;
}

/** Tipos de fuente admitidos en la cabecera `X-RAG-Sources`. */
const RAG_SOURCE_TYPES = new Set<string>(['PROJECT', 'TASK', 'DOCUMENT']);

/**
 * Convierte un valor desconocido en `RagSource` si cumple el contrato.
 *
 * @param value - Elemento parseado del JSON de la cabecera.
 * @returns La fuente validada o `null` si no cumple el esquema.
 */
function toRagSource(value: unknown): RagSource | null {
  if (typeof value !== 'object' || value === null) return null;

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.title !== 'string' ||
    typeof candidate.type !== 'string' ||
    !RAG_SOURCE_TYPES.has(candidate.type)
  ) {
    return null;
  }

  return {
    type: candidate.type as RagSource['type'],
    id: candidate.id,
    title: candidate.title,
    ...(typeof candidate.score === 'number' ? { score: candidate.score } : {}),
  };
}

/**
 * Lee las cabeceras RAG de una respuesta de `/api/chat`.
 *
 * Cualquier valor ausente o corrupto degrada a valores por defecto en lugar de
 * lanzar: una cabecera malformada no debe romper la conversacion.
 *
 * @param headers - Cabeceras de la respuesta.
 * @returns Fuentes, modo de respuesta y modo de recuperacion.
 */
export function readRagMeta(headers: Headers): RagResponseMeta {
  const rawSources = headers.get(RAG_SOURCES_HEADER);
  let sources: RagSource[] = [];

  if (rawSources) {
    try {
      const parsed: unknown = JSON.parse(decodeURIComponent(rawSources));
      if (Array.isArray(parsed)) {
        sources = parsed.map(toRagSource).filter((source): source is RagSource => source !== null);
      }
    } catch {
      sources = [];
    }
  }

  return {
    sources,
    mode: headers.get(RAG_MODE_HEADER) === 'context' ? 'context' : 'llm',
    retrieval: headers.get(RAG_RETRIEVAL_HEADER) === 'lexical' ? 'lexical' : 'vector',
  };
}
