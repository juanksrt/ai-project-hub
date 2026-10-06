import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Los dobles se declaran con vi.hoisted para que esten disponibles dentro de
// los factories de vi.mock, que Vitest eleva por encima de los imports.
const {
  authMock,
  streamTextMock,
  createTextStreamResponseMock,
  similaritySearchMock,
  lexicalSearchMock,
  hasGoogleCredentialsMock,
  findManyMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  streamTextMock: vi.fn(),
  createTextStreamResponseMock: vi.fn(),
  similaritySearchMock: vi.fn(),
  lexicalSearchMock: vi.fn(),
  hasGoogleCredentialsMock: vi.fn(() => true),
  findManyMock: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: authMock }));

vi.mock('ai', () => ({
  embed: vi.fn(),
  streamText: streamTextMock,
  createTextStreamResponse: createTextStreamResponseMock,
}));

vi.mock('@ai-sdk/google', () => ({
  google: Object.assign(vi.fn(() => 'chat-model'), { embeddingModel: vi.fn() }),
}));

vi.mock('@/lib/prisma', () => ({
  getPrisma: () => ({ documentChunk: { findMany: findManyMock } }),
}));

// Se reemplazan solo las funciones de recuperacion; el resto (clases de error,
// cabeceras, etc.) es el codigo real para que `instanceof` funcione.
vi.mock('@/lib/embeddings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/embeddings')>();

  return {
    ...actual,
    similaritySearch: similaritySearchMock,
    lexicalSearch: lexicalSearchMock,
    hasGoogleCredentials: hasGoogleCredentialsMock,
  };
});

import { POST } from '@/app/api/chat/route';
import { EmbeddingUnavailableError, type SimilarityHit } from '@/lib/embeddings';
import {
  RAG_MODE_HEADER,
  RAG_RETRIEVAL_HEADER,
  RAG_SOURCES_HEADER,
  type RagSource,
} from '@/lib/rag-contract';

/** Cuerpo de error devuelto por la ruta. */
interface ChatErrorResponse {
  error: string;
}

const PROJECT_ID = 'project-1';

const HIT: SimilarityHit = {
  entityType: 'TASK',
  entityId: 'task-1',
  projectId: PROJECT_ID,
  title: 'Crear pipeline de RAG',
  content: 'Tarea: Crear pipeline de RAG\nIndexar la documentacion',
  score: 0.91,
};

const DOCUMENT_CHUNK = {
  id: 'chunk-1',
  content: 'El asistente usa pgvector para la busqueda coseno.',
  document: { id: 'doc-1', title: 'Manual RAG' },
};

const VALID_MESSAGES = [{ role: 'user', content: '¿Como funciona el RAG?' }];

function makeRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** Decodifica la cabecera `X-RAG-Sources` como lo haria el navegador. */
function readSources(response: Response): RagSource[] {
  const raw = response.headers.get(RAG_SOURCES_HEADER);
  if (!raw) return [];
  return JSON.parse(decodeURIComponent(raw)) as RagSource[];
}

/** Opciones con las que la ruta llamo a `streamText`. */
interface StreamTextCall {
  model: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
}

/** Devuelve las opciones de la ultima llamada a `streamText`. */
function lastStreamTextCall(): StreamTextCall {
  const call = streamTextMock.mock.calls[streamTextMock.mock.calls.length - 1];
  return (call?.[0] ?? {}) as StreamTextCall;
}

describe('POST /api/chat', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    hasGoogleCredentialsMock.mockReturnValue(true);
    similaritySearchMock.mockResolvedValue([HIT]);
    lexicalSearchMock.mockResolvedValue([HIT]);
    findManyMock.mockResolvedValue([DOCUMENT_CHUNK]);
    createTextStreamResponseMock.mockImplementation(
      ({ headers, stream }: { headers: HeadersInit; stream: ReadableStream<string> }) =>
        new Response(stream.pipeThrough(new TextEncoderStream()), { status: 200, headers }),
    );
    streamTextMock.mockImplementation(() => ({
      textStream: new ReadableStream<string>({
        start(controller) {
          controller.enqueue('El asistente indexa proyectos y tareas. ');
          controller.enqueue('Fuente: Crear pipeline de RAG.');
          controller.close();
        },
      }),
    }));
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('responde 401 si no hay sesion activa', async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(makeRequest({ messages: VALID_MESSAGES }));
    const body = (await response.json()) as ChatErrorResponse;

    expect(response.status).toBe(401);
    expect(body.error).toBe('No autenticado');
    expect(similaritySearchMock).not.toHaveBeenCalled();
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it('responde 400 si el cuerpo no es JSON valido', async () => {
    const response = await POST(makeRequest('esto no es json'));
    const body = (await response.json()) as ChatErrorResponse;

    expect(response.status).toBe(400);
    expect(body.error).toBe('Cuerpo JSON invalido');
    expect(similaritySearchMock).not.toHaveBeenCalled();
  });

  it('responde 400 si no llegan mensajes', async () => {
    const response = await POST(makeRequest({}));
    const body = (await response.json()) as ChatErrorResponse;

    expect(response.status).toBe(400);
    expect(body.error).toBe('Peticion de chat invalida');
  });

  it('responde 400 si el mensaje esta vacio', async () => {
    const response = await POST(makeRequest({ messages: [{ role: 'user', content: '   ' }] }));
    const body = (await response.json()) as ChatErrorResponse;

    expect(response.status).toBe(400);
    expect(body.error).toBe('Peticion de chat invalida');
    expect(similaritySearchMock).not.toHaveBeenCalled();
  });

  it('responde 400 si el rol o el projectId no son validos', async () => {
    const badRole = await POST(makeRequest({ messages: [{ role: 'robot', content: 'hola' }] }));
    const badProject = await POST(
      makeRequest({ messages: VALID_MESSAGES, projectId: 42 }),
    );

    expect(badRole.status).toBe(400);
    expect(badProject.status).toBe(400);
  });

  it('responde 500 si la busqueda vectorial falla', async () => {
    similaritySearchMock.mockRejectedValue(new Error('conexion rechazada'));

    const response = await POST(makeRequest({ messages: VALID_MESSAGES }));
    const body = (await response.json()) as ChatErrorResponse;

    expect(response.status).toBe(500);
    expect(body.error).toBe('Error interno en la API RAG');
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it('recupera las fuentes por similitud coseno y las anade al contexto del LLM', async () => {
    const response = await POST(
      makeRequest({ messages: VALID_MESSAGES, projectId: PROJECT_ID }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get(RAG_MODE_HEADER)).toBe('llm');
    expect(response.headers.get(RAG_RETRIEVAL_HEADER)).toBe('vector');

    // El LLM solo recibe la respuesta generada en streaming.
    await expect(response.text()).resolves.toBe(
      'El asistente indexa proyectos y tareas. Fuente: Crear pipeline de RAG.',
    );

    expect(similaritySearchMock).toHaveBeenCalledWith('¿Como funciona el RAG?', {
      projectId: PROJECT_ID,
      topK: 5,
    });
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { document: { projectId: PROJECT_ID } } }),
    );

    const streamTextOptions = lastStreamTextCall();

    expect(streamTextOptions.model).toBe('chat-model');
    expect(streamTextOptions.system).toContain('[Fuente: Crear pipeline de RAG]');
    expect(streamTextOptions.system).toContain('[Fuente: Manual RAG]');
    expect(streamTextOptions.system).toContain('no inventes datos');
    expect(streamTextOptions.messages).toEqual(VALID_MESSAGES);

    // Fuentes: el hit vectorial y el documento, sin repetidos.
    expect(readSources(response)).toEqual([
      { type: 'TASK', id: 'task-1', title: 'Crear pipeline de RAG', score: 0.91 },
      { type: 'DOCUMENT', id: 'doc-1', title: 'Manual RAG' },
    ]);
  });

  it('responde con modo context y busqueda lexica si falta la credencial de IA', async () => {
    hasGoogleCredentialsMock.mockReturnValue(false);
    similaritySearchMock.mockRejectedValue(
      new EmbeddingUnavailableError('Falta GOOGLE_GENERATIVE_AI_API_KEY'),
    );

    const response = await POST(makeRequest({ messages: VALID_MESSAGES }));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get(RAG_MODE_HEADER)).toBe('context');
    expect(response.headers.get(RAG_RETRIEVAL_HEADER)).toBe('lexical');
    expect(lexicalSearchMock).toHaveBeenCalledWith('¿Como funciona el RAG?', {
      projectId: undefined,
      topK: 5,
    });
    expect(streamTextMock).not.toHaveBeenCalled();

    // Se devuelve el contexto recuperado para que el chat siga siendo util.
    expect(text).toContain('Tarea: Crear pipeline de RAG');
    expect(text).toContain('Manual RAG');
    expect(readSources(response)).toHaveLength(2);
  });

  it('aplica el guardrail de verdad cuando no hay ningun contexto indexado', async () => {
    similaritySearchMock.mockResolvedValue([]);
    findManyMock.mockResolvedValue([]);

    const response = await POST(makeRequest({ messages: VALID_MESSAGES }));

    expect(response.status).toBe(200);

    const streamTextOptions = lastStreamTextCall();

    expect(streamTextOptions.system).toContain(
      'No hay ningun contexto indexado para responder esta pregunta.',
    );
    expect(readSources(response)).toEqual([]);
  });

  it('deduplica las fuentes con el mismo titulo', async () => {
    similaritySearchMock.mockResolvedValue([
      HIT,
      { ...HIT, entityId: 'task-2', score: 0.7 },
    ]);
    findManyMock.mockResolvedValue([
      { ...DOCUMENT_CHUNK, id: 'chunk-2' },
      { ...DOCUMENT_CHUNK, id: 'chunk-3' },
    ]);

    const response = await POST(makeRequest({ messages: VALID_MESSAGES }));

    expect(readSources(response)).toEqual([
      { type: 'TASK', id: 'task-1', title: 'Crear pipeline de RAG', score: 0.91 },
      { type: 'DOCUMENT', id: 'doc-1', title: 'Manual RAG' },
    ]);
  });
});
