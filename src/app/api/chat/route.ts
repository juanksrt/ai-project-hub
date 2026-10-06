import { openai } from '@ai-sdk/openai';
import { createTextStreamResponse, streamText } from 'ai';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { chatRequestSchema } from '@/lib/chat-schema';
import {
  DEFAULT_TOP_K,
  EmbeddingUnavailableError,
  hasOpenAiCredentials,
  lexicalSearch,
  similaritySearch,
  type SimilarityHit,
} from '@/lib/embeddings';
import { getPrisma } from '@/lib/prisma';
import {
  RAG_MODE_HEADER,
  RAG_RETRIEVAL_HEADER,
  RAG_SOURCES_HEADER,
  type RagAnswerMode,
  type RagRetrievalMode,
  type RagSource,
} from '@/lib/rag-contract';

/** Modelo que redacta la respuesta. Requiere `OPENAI_API_KEY`. */
const CHAT_MODEL_ID = 'gpt-4o-mini';

/** Numero maximo de fragmentos de documentos que se anaden al contexto. */
const DOCUMENT_CHUNK_LIMIT = 3;

/** Cuerpo de respuesta cuando la peticion es invalida o falla. */
interface ChatErrorResponse {
  error: string;
}

/** Fragmento de documento indexado que se anade al contexto. */
interface DocumentContext {
  id: string;
  title: string;
  content: string;
}

/** Instrucciones inamovibles del asistente (Guardrail of Truth). */
const SYSTEM_INSTRUCTIONS = `Eres el Asistente RAG oficial de AI Project Hub.
Responde las preguntas utilizando EXCLUSIVAMENTE el contexto recuperado de la base de datos que aparece mas abajo.
Reglas:
- Cita la fuente entre corchetes con el titulo exacto, por ejemplo [Lanzamiento SaaS IA].
- Si la respuesta no esta en el contexto, declaralo explicitamente: no inventes datos, nombres ni fechas.
- Responde en el mismo idioma en el que esta escrita la pregunta.`;

/**
 * `POST /api/chat` — pregunta al asistente RAG del proyecto.
 *
 * Flujo:
 * 1. `auth()` de NextAuth; sin sesion -> 401. El chat devuelve contenido de
 *    proyectos y tareas, asi que no puede ser publico.
 * 2. El cuerpo se valida con `chatRequestSchema` (Zod) -> 400 si no cumple.
 * 3. La ultima pregunta se embede con el Vercel AI SDK y se busca por
 *    similitud coseno (`<=>`) en la tabla `Embedding` con pgvector. Si falta
 *    `OPENAI_API_KEY` se cae a busqueda lexica (`ILIKE`) para no dejar el
 *    chat muerto; cualquier otro fallo de base de datos -> 500.
 * 4. Los fragmentos de `DocumentChunk` del proyecto se anaden al contexto.
 * 5. Con credencial de IA se genera la respuesta con `streamText` y se
 *    devuelve como stream de texto plano; sin ella se devuelve el contexto
 *    recuperado (modo `context`).
 * 6. Las fuentes viajan en las cabeceras `X-RAG-*` porque el cuerpo es un
 *    stream: se envian antes de que empiece a generarse la respuesta.
 *
 * @param request - Peticion con `{ messages, projectId? }`.
 * @returns Stream de texto con las cabeceras RAG, o el error correspondiente.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json<ChatErrorResponse>({ error: 'No autenticado' }, { status: 401 });
    }

    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return NextResponse.json<ChatErrorResponse>(
        { error: 'Cuerpo JSON invalido' },
        { status: 400 },
      );
    }

    const parsed = chatRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json<ChatErrorResponse>(
        { error: 'Peticion de chat invalida' },
        { status: 400 },
      );
    }

    const question = parsed.data.messages[parsed.data.messages.length - 1]?.content ?? '';

    if (!question) {
      return NextResponse.json<ChatErrorResponse>({ error: 'Mensaje requerido' }, { status: 400 });
    }

    const { hits, retrieval } = await retrieveContext(question, parsed.data.projectId);
    const documents = await findDocumentChunks(parsed.data.projectId);
    const sources = collectSources(hits, documents);
    const llmEnabled = hasOpenAiCredentials();
    const headers = buildHeaders(sources, retrieval, llmEnabled ? 'llm' : 'context');

    // Sin credencial no hay LLM: se responde con el contexto recuperado para
    // que el chat siga siendo util en local y en CI.
    if (!llmEnabled) {
      return new Response(buildContextAnswer(question, hits, documents), { status: 200, headers });
    }

    const result = streamText({
      model: openai.chat(CHAT_MODEL_ID),
      system: buildSystemPrompt(formatContext(hits, documents)),
      messages: parsed.data.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      onError: ({ error }) => {
        console.error('[chat] Fallo al generar la respuesta con el LLM:', error);
      },
    });

    return createTextStreamResponse({ headers, stream: result.textStream });
  } catch (error) {
    console.error('Error en POST /api/chat:', error);

    return NextResponse.json<ChatErrorResponse>(
      { error: 'Error interno en la API RAG' },
      { status: 500 },
    );
  }
}

/**
 * Recupera las fuentes del contexto: vectorial con respaldo lexico.
 *
 * @param question - Pregunta del usuario.
 * @param projectId - Proyecto opcional que acota la busqueda.
 * @returns Hits de `Embedding` y modo de recuperacion usado.
 * @throws {Error} Si falla la base de datos (se propaga al catch del handler).
 */
async function retrieveContext(
  question: string,
  projectId?: string,
): Promise<{ hits: SimilarityHit[]; retrieval: RagRetrievalMode }> {
  try {
    const hits = await similaritySearch(question, { projectId, topK: DEFAULT_TOP_K });
    return { hits, retrieval: 'vector' };
  } catch (error) {
    // Falta la credencial de IA -> no se puede embedir la pregunta, pero la
    // base de datos sigue siendo consultable por texto.
    if (!(error instanceof EmbeddingUnavailableError)) throw error;

    const hits = await lexicalSearch(question, { projectId, topK: DEFAULT_TOP_K });
    return { hits, retrieval: 'lexical' };
  }
}

/**
 * Lee los fragmentos de documentos indexados del proyecto.
 *
 * @param projectId - Proyecto opcional que acota la busqueda.
 * @returns Hasta `DOCUMENT_CHUNK_LIMIT` fragmentos con su documento.
 * @throws {Error} Si la consulta a PostgreSQL falla.
 */
async function findDocumentChunks(projectId?: string): Promise<DocumentContext[]> {
  const chunks = await getPrisma().documentChunk.findMany({
    where: projectId ? { document: { projectId } } : {},
    take: DOCUMENT_CHUNK_LIMIT,
    include: { document: { select: { id: true, title: true } } },
  });

  return chunks.map((chunk) => ({
    id: chunk.document.id,
    title: chunk.document.title,
    content: chunk.content,
  }));
}

/**
 * Compone el contexto anclado al prompt.
 *
 * @param hits - Resultados de la busqueda vectorial o lexica.
 * @param documents - Fragmentos de documentos del proyecto.
 * @returns Texto concatenado con una etiqueta `[Fuente: ...]` por fragmento.
 */
function formatContext(hits: ReadonlyArray<SimilarityHit>, documents: ReadonlyArray<DocumentContext>): string {
  const parts = [
    ...hits.map((hit) => `[Fuente: ${hit.title}]\n${hit.content}`),
    ...documents.map((document) => `[Fuente: ${document.title}]\n${document.content}`),
  ];

  return parts.join('\n\n');
}

/**
 * Construye el system prompt con el contexto recuperado.
 *
 * @param contextText - Contexto anclado; puede venir vacio.
 * @returns Instrucciones + contexto.
 */
function buildSystemPrompt(contextText: string): string {
  return `${SYSTEM_INSTRUCTIONS}

Contexto recuperado de la base de datos:
${contextText || 'No hay ningun contexto indexado para responder esta pregunta.'}`;
}

/**
 * Respuesta del modo degradado (sin credencial de IA).
 *
 * @param question - Pregunta del usuario.
 * @param hits - Fuentes vectoriales o lexicas recuperadas.
 * @param documents - Fragmentos de documentos recuperados.
 * @returns Contexto recuperado explicando por que no hay respuesta redactada.
 */
function buildContextAnswer(
  question: string,
  hits: ReadonlyArray<SimilarityHit>,
  documents: ReadonlyArray<DocumentContext>,
): string {
  const contextText = formatContext(hits, documents);

  if (!contextText) {
    return (
      `No encontre nada indexado sobre "${question}". ` +
      'Indexa proyectos o tareas (o sube documentacion) para que el asistente pueda responder.'
    );
  }

  return [
    `No hay credencial de IA configurada, asi que no puedo redactar la respuesta. ` +
      `Esto es lo que encontre indexado sobre "${question}":`,
    '',
    contextText,
  ].join('\n');
}

/**
 * Agrupa las fuentes citadas, eliminando repetidos y quedandose con el mejor
 * score de cada titulo.
 *
 * @param hits - Resultados de similitud/lexica.
 * @param documents - Fragmentos de documentos.
 * @returns Fuentes unicas listas para la cabecera `X-RAG-Sources`.
 */
function collectSources(
  hits: ReadonlyArray<SimilarityHit>,
  documents: ReadonlyArray<DocumentContext>,
): RagSource[] {
  const sources = new Map<string, RagSource>();

  for (const hit of hits) {
    const key = `${hit.entityType}:${hit.title}`;
    const existing = sources.get(key);

    if (!existing || (hit.score > (existing.score ?? 0))) {
      sources.set(key, {
        type: hit.entityType,
        id: hit.entityId,
        title: hit.title,
        score: hit.score,
      });
    }
  }

  for (const document of documents) {
    const key = `DOCUMENT:${document.title}`;

    if (!sources.has(key)) {
      sources.set(key, { type: 'DOCUMENT', id: document.id, title: document.title });
    }
  }

  return [...sources.values()];
}

/**
 * Cabeceras de la respuesta: fuentes, modo de respuesta y modo de busqueda.
 *
 * @param sources - Fuentes citadas.
 * @param retrieval - Como se recuperaron.
 * @param answerMode - Como se produjo la respuesta.
 * @returns Cabeceras listas para la `Response`.
 */
function buildHeaders(
  sources: RagSource[],
  retrieval: RagRetrievalMode,
  answerMode: RagAnswerMode = 'llm',
): Headers {
  const headers = new Headers();

  headers.set('Content-Type', 'text/plain; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set(RAG_MODE_HEADER, answerMode);
  headers.set(RAG_RETRIEVAL_HEADER, retrieval);
  headers.set(RAG_SOURCES_HEADER, encodeURIComponent(JSON.stringify(sources)));

  return headers;
}
