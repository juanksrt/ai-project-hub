import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Los dobles se declaran con vi.hoisted para que esten disponibles dentro de
// los factories de vi.mock, que Vitest eleva por encima de los imports.
const { embedMock, googleMock, executeRawMock, queryRawMock, projectFindUniqueMock, taskFindManyMock } =
  vi.hoisted(() => ({
    embedMock: vi.fn(),
    googleMock: Object.assign(vi.fn(), { embeddingModel: vi.fn(() => 'embedding-model') }),
    executeRawMock: vi.fn(),
    queryRawMock: vi.fn(),
    projectFindUniqueMock: vi.fn(),
    taskFindManyMock: vi.fn(),
  }));

vi.mock('ai', () => ({ embed: embedMock }));
vi.mock('@ai-sdk/google', () => ({ google: googleMock }));
vi.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    $executeRaw: executeRawMock,
    $queryRaw: queryRawMock,
    project: { findUnique: projectFindUniqueMock },
    task: { findMany: taskFindManyMock },
  }),
}));

import {
  DEFAULT_TOP_K,
  EMBEDDING_DIMENSIONS,
  EmbeddingUnavailableError,
  MAX_TOP_K,
  buildTaskContent,
  clampScore,
  deleteOrphanEmbeddings,
  deleteProjectEmbeddings,
  generateEmbedding,
  hasGoogleCredentials,
  indexProject,
  indexTask,
  lexicalSearch,
  normalizeTopK,
  reindexProject,
  similaritySearch,
  toVectorParam,
  upsertEmbedding,
} from '@/lib/embeddings';

/** Vector de 1536 dimensiones valido para `vector(1536)`. */
const VALID_VECTOR = Array.from(
  { length: EMBEDDING_DIMENSIONS },
  (_, index) => index / EMBEDDING_DIMENSIONS,
);

const PROJECT_ID = 'project-1';
const TASK_ID = 'task-1';

/** Interfaz minima de un mock de Vitest que registra sus llamadas. */
interface RecordedMock {
  readonly mock: { readonly calls: unknown[][] };
}

/** Extrae el SQL crudo de una llamada etiquetada (`$executeRaw` / `$queryRaw`). */
function callSql(mock: RecordedMock, index?: number): string {
  const position = index ?? mock.mock.calls.length - 1;
  const call = mock.mock.calls[position] ?? [];
  const strings = call[0] as TemplateStringsArray;
  return Array.from(strings).join(' ? ');
}

/** Extrae los parametros interpolados de una llamada etiquetada. */
function callValues(mock: RecordedMock, index?: number): unknown[] {
  const position = index ?? mock.mock.calls.length - 1;
  const call = mock.mock.calls[position] ?? [];
  return call.slice(1);
}

describe('utilidades de embedding', () => {
  it('toVectorParam serializa el vector al formato de pgvector', () => {
    const param = toVectorParam(VALID_VECTOR);

    expect(param.startsWith('[')).toBe(true);
    expect(param.endsWith(']')).toBe(true);

    const parts = param.slice(1, -1).split(',');
    expect(parts).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(parts.every((part) => Number.isFinite(Number(part)))).toBe(true);
  });

  it('toVectorParam rechaza una dimension distinta de 1536', () => {
    expect(() => toVectorParam([0.1, 0.2])).toThrow('Dimension de embedding invalida');
  });

  it('toVectorParam rechaza valores no finitos', () => {
    const vector = [...VALID_VECTOR];
    vector[0] = Number.NaN;

    expect(() => toVectorParam(vector)).toThrow('no numericos o no finitos');
  });

  it('clampScore recorta al rango [0, 1]', () => {
    expect(clampScore(1.4)).toBe(1);
    expect(clampScore(-0.2)).toBe(0);
    expect(clampScore(0.42)).toBeCloseTo(0.42);
    expect(clampScore(Number.NaN)).toBe(0);
  });

  it('normalizeTopK limita el numero de resultados', () => {
    expect(normalizeTopK()).toBe(DEFAULT_TOP_K);
    expect(normalizeTopK(999)).toBe(MAX_TOP_K);
    expect(normalizeTopK(0)).toBe(1);
    expect(normalizeTopK(Number.NaN)).toBe(DEFAULT_TOP_K);
  });
});

describe('generateEmbedding', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'sk-test';
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    embedMock.mockResolvedValue({ embedding: VALID_VECTOR });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  });

  it('llama al modelo con el texto recortado y 1536 dimensiones', async () => {
    const embedding = await generateEmbedding('  Configurar pgvector  ');

    expect(embedding).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(googleMock.embeddingModel).toHaveBeenCalledWith('gemini-embedding-2');
    expect(embedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'embedding-model',
        value: 'Configurar pgvector',
        // Pide 1536 a Gemini para respetar la columna `vector(1536)`.
        providerOptions: {
          google: { outputDimensionality: EMBEDDING_DIMENSIONS },
        },
      }),
    );
  });

  it('rechaza un texto vacio sin llamar al proveedor', async () => {
    await expect(generateEmbedding('   ')).rejects.toThrow('no puede estar vacio');
    expect(embedMock).not.toHaveBeenCalled();
  });

  it('lanza EmbeddingUnavailableError si falta GOOGLE_GENERATIVE_AI_API_KEY', async () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    expect(hasGoogleCredentials()).toBe(false);
    await expect(generateEmbedding('pregunta')).rejects.toBeInstanceOf(EmbeddingUnavailableError);
    expect(embedMock).not.toHaveBeenCalled();
  });

  it('envuelve el error del proveedor y lo registra', async () => {
    embedMock.mockRejectedValue(new Error('rate limit'));

    await expect(generateEmbedding('pregunta')).rejects.toThrow('No se pudo generar el embedding');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

describe('upsertEmbedding', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    executeRawMock.mockResolvedValue(1);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('inserta con ON CONFLICT para que re-indexar no duplique', async () => {
    await upsertEmbedding(
      {
        entityType: 'PROJECT',
        entityId: PROJECT_ID,
        projectId: PROJECT_ID,
        title: 'Lanzamiento SaaS',
        content: 'Proyecto: Lanzamiento SaaS',
      },
      VALID_VECTOR,
    );

    const sql = callSql(executeRawMock);

    expect(sql).toContain('INSERT INTO "Embedding"');
    expect(sql).toContain('ON CONFLICT ("entityType", "entityId")');
    expect(sql).toContain('DO UPDATE SET');

    const values = callValues(executeRawMock);
    expect(values).toEqual(
      expect.arrayContaining([PROJECT_ID, 'Lanzamiento SaaS', 'Proyecto: Lanzamiento SaaS']),
    );
    // El vector viaja serializado como texto y se castea a `vector` en SQL.
    expect(values.some((value) => typeof value === 'string' && value.startsWith('['))).toBe(true);
  });

  it('no toca la base de datos si el vector tiene dimension invalida', async () => {
    await expect(
      upsertEmbedding(
        {
          entityType: 'TASK',
          entityId: TASK_ID,
          projectId: PROJECT_ID,
          title: 'Tarea',
          content: 'Tarea',
        },
        [0.1, 0.2],
      ),
    ).rejects.toThrow('Dimension de embedding invalida');

    expect(executeRawMock).not.toHaveBeenCalled();
  });
});

describe('indexProject / indexTask', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'sk-test';
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    embedMock.mockResolvedValue({ embedding: VALID_VECTOR });
    executeRawMock.mockResolvedValue(1);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  });

  it('indexProject guarda el embedding del proyecto', async () => {
    const indexed = await indexProject({
      id: PROJECT_ID,
      name: 'Lanzamiento SaaS IA',
      description: 'Plataforma con RAG',
    });

    expect(indexed).toBe(true);

    const values = callValues(executeRawMock);
    expect(values).toEqual(
      expect.arrayContaining(['PROJECT', PROJECT_ID, 'Lanzamiento SaaS IA']),
    );
    expect(values).toContain('Proyecto: Lanzamiento SaaS IA\nPlataforma con RAG');
  });

  it('indexTask incluye titulo, descripcion, estado y prioridad', async () => {
    const indexed = await indexTask({
      id: TASK_ID,
      title: 'Crear pipeline de RAG',
      description: 'Indexar la documentacion',
      projectId: PROJECT_ID,
      status: 'IN_PROGRESS',
      priority: 'HIGH',
    });

    expect(indexed).toBe(true);
    expect(buildTaskContent({
      id: TASK_ID,
      title: 'Crear pipeline de RAG',
      description: 'Indexar la documentacion',
      projectId: PROJECT_ID,
      status: 'IN_PROGRESS',
      priority: 'HIGH',
    })).toBe(
      'Tarea: Crear pipeline de RAG\nIndexar la documentacion\nEstado: IN_PROGRESS\nPrioridad: HIGH',
    );

    const values = callValues(executeRawMock);
    expect(values).toEqual(expect.arrayContaining(['TASK', TASK_ID, PROJECT_ID]));
  });

  it('devuelve false si el proveedor de IA falla y no lanza', async () => {
    embedMock.mockRejectedValue(new Error('provider down'));

    await expect(indexTask({ id: TASK_ID, title: 'Tarea', projectId: PROJECT_ID })).resolves.toBe(
      false,
    );

    expect(executeRawMock).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('devuelve false si falta la credencial, sin romper la creacion', async () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    await expect(indexProject({ id: PROJECT_ID, name: 'Proyecto' })).resolves.toBe(false);
    expect(executeRawMock).not.toHaveBeenCalled();
  });
});

describe('similaritySearch', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  const DB_ROW = {
    entityType: 'TASK',
    entityId: TASK_ID,
    projectId: PROJECT_ID,
    title: 'Crear pipeline de RAG',
    content: 'Tarea: Crear pipeline de RAG',
    score: 0.87,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'sk-test';
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    embedMock.mockResolvedValue({ embedding: VALID_VECTOR });
    queryRawMock.mockResolvedValue([DB_ROW]);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  });

  it('consulta por distancia coseno, ordena y limita resultados', async () => {
    const hits = await similaritySearch('como funciona el RAG?', {
      projectId: PROJECT_ID,
      topK: 3,
    });

    const sql = callSql(queryRawMock);

    expect(sql).toContain('1 - ("embedding" <=>');
    expect(sql).toContain('ORDER BY "embedding" <=>');
    expect(sql).toContain('LIMIT');

    const values = callValues(queryRawMock);
    expect(values).toEqual(expect.arrayContaining([PROJECT_ID, 3]));
    // El vector se repite en el SELECT y en el ORDER BY.
    expect(values.filter((value) => typeof value === 'string' && value.startsWith('['))).toHaveLength(2);

    expect(hits).toEqual([
      {
        entityType: 'TASK',
        entityId: TASK_ID,
        projectId: PROJECT_ID,
        title: 'Crear pipeline de RAG',
        content: 'Tarea: Crear pipeline de RAG',
        score: 0.87,
      },
    ]);
  });

  it('recorta el score de PostgreSQL al rango [0, 1]', async () => {
    queryRawMock.mockResolvedValue([{ ...DB_ROW, score: -0.4 }]);

    const [hit] = await similaritySearch('pregunta');

    expect(hit?.score).toBe(0);
  });

  it('no consulta la base de datos si falta la credencial de IA', async () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    await expect(similaritySearch('pregunta')).rejects.toBeInstanceOf(EmbeddingUnavailableError);
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it('propaga un error de base de datos con un mensaje claro', async () => {
    queryRawMock.mockRejectedValue(new Error('conexion rechazada'));

    await expect(similaritySearch('pregunta')).rejects.toThrow(
      'La busqueda por similitud coseno fallo',
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('rechaza una pregunta vacia', async () => {
    await expect(similaritySearch('   ')).rejects.toThrow('no puede estar vacia');
  });
});

describe('lexicalSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRawMock.mockResolvedValue([]);
  });

  it('busca con ILIKE sin generar embeddings', async () => {
    await lexicalSearch('pipeline RAG', { projectId: PROJECT_ID, topK: 2 });

    const sql = callSql(queryRawMock);

    expect(sql).toContain('ILIKE');
    expect(sql).toContain('ORDER BY "createdAt" DESC');
    expect(embedMock).not.toHaveBeenCalled();
    expect(callValues(queryRawMock)).toEqual(
      expect.arrayContaining([PROJECT_ID, '%pipeline RAG%', 2]),
    );
  });

  it('escapa los caracteres especiales de LIKE', async () => {
    await lexicalSearch('100% _ avance');

    expect(callValues(queryRawMock)).toEqual(expect.arrayContaining(['%100\\% \\_ avance%']));
  });
});

describe('deleteProjectEmbeddings', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    executeRawMock.mockResolvedValue(3);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('elimina todos los embeddings del proyecto', async () => {
    await expect(deleteProjectEmbeddings(PROJECT_ID)).resolves.toBe(3);

    expect(callSql(executeRawMock)).toContain('DELETE FROM "Embedding"');
    expect(callValues(executeRawMock)).toEqual([PROJECT_ID]);
  });

  it('lanza si la base de datos falla', async () => {
    executeRawMock.mockRejectedValue(new Error('timeout'));

    await expect(deleteProjectEmbeddings(PROJECT_ID)).rejects.toThrow(
      'No se pudieron eliminar los embeddings',
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

describe('deleteOrphanEmbeddings', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    executeRawMock.mockResolvedValue(2);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('sin alcance limpia proyectos y tareas que ya no existen', async () => {
    await expect(deleteOrphanEmbeddings()).resolves.toBe(2);

    const sql = callSql(executeRawMock);
    expect(sql).toContain('DELETE FROM "Embedding" e');
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM "Project"');
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM "Task"');
    // Sin parametros: no se interpola nada, asi que no hay riesgo de inyeccion.
    expect(callValues(executeRawMock)).toEqual([]);
  });

  it('con alcance se acota al proyecto y solo mira tareas', async () => {
    executeRawMock.mockResolvedValue(1);

    await expect(deleteOrphanEmbeddings(PROJECT_ID)).resolves.toBe(1);

    const sql = callSql(executeRawMock);
    expect(sql).toContain('DELETE FROM "Embedding" e');
    expect(sql).toContain('WHERE e."projectId" =');
    expect(sql).toContain('e."entityType" = \'TASK\'');
    expect(sql).not.toContain('"Project" p');
    expect(callValues(executeRawMock)).toEqual([PROJECT_ID]);
  });

  it('lanza si la base de datos falla', async () => {
    executeRawMock.mockRejectedValue(new Error('timeout'));

    await expect(deleteOrphanEmbeddings()).rejects.toThrow(
      'No se pudieron eliminar los embeddings huerfanos',
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

describe('reindexProject', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  const PROJECT = {
    id: PROJECT_ID,
    name: 'Lanzamiento SaaS IA',
    description: 'Plataforma con RAG',
  };

  const TASKS = [
    {
      id: TASK_ID,
      title: 'Crear pipeline de RAG',
      description: null,
      projectId: PROJECT_ID,
      status: 'PENDING',
      priority: 'MEDIUM',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    embedMock.mockResolvedValue({ embedding: VALID_VECTOR });
    executeRawMock.mockResolvedValue(1);
    projectFindUniqueMock.mockResolvedValue(PROJECT);
    taskFindManyMock.mockResolvedValue(TASKS);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  });

  it('limpia huerfanos y luego re-indexa el proyecto y sus tareas', async () => {
    const result = await reindexProject(PROJECT_ID);

    expect(result).toEqual({
      projectId: PROJECT_ID,
      project: true,
      tasksTotal: 1,
      tasksIndexed: 1,
      orphansRemoved: 1,
    });

    // Orden de llamadas: purga -> INSERT del proyecto -> INSERT de la tarea.
    expect(callSql(executeRawMock, 0)).toContain('DELETE FROM "Embedding" e');
    expect(callValues(executeRawMock, 0)).toEqual([PROJECT_ID]);
    expect(callSql(executeRawMock, 1)).toContain('INSERT INTO "Embedding"');
    expect(callValues(executeRawMock, 1)).toEqual(
      expect.arrayContaining(['PROJECT', PROJECT_ID, 'Lanzamiento SaaS IA']),
    );
    expect(callValues(executeRawMock, 2)).toEqual(
      expect.arrayContaining(['TASK', TASK_ID, PROJECT_ID]),
    );

    expect(projectFindUniqueMock).toHaveBeenCalledWith({
      where: { id: PROJECT_ID },
      select: { id: true, name: true, description: true },
    });
    expect(taskFindManyMock).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID },
      select: {
        id: true,
        title: true,
        description: true,
        projectId: true,
        status: true,
        priority: true,
      },
    });
  });

  it('lanza si el proyecto no existe', async () => {
    projectFindUniqueMock.mockResolvedValue(null);

    await expect(reindexProject('no-existe')).rejects.toThrow('No se pudo cargar el proyecto');
    expect(embedMock).not.toHaveBeenCalled();
  });

  it('propaga el error de base de datos con un mensaje claro', async () => {
    projectFindUniqueMock.mockRejectedValue(new Error('conexion rechazada'));

    await expect(reindexProject(PROJECT_ID)).rejects.toThrow('No se pudo cargar el proyecto');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('reporta los contadores aunque el proveedor de IA falle', async () => {
    embedMock.mockRejectedValue(new Error('rate limit'));

    const result = await reindexProject(PROJECT_ID);

    expect(result.project).toBe(false);
    expect(result.tasksTotal).toBe(1);
    expect(result.tasksIndexed).toBe(0);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('devuelve cero tareas cuando el proyecto no tiene ninguna', async () => {
    taskFindManyMock.mockResolvedValue([]);

    const result = await reindexProject(PROJECT_ID);

    expect(result).toEqual({
      projectId: PROJECT_ID,
      project: true,
      tasksTotal: 0,
      tasksIndexed: 0,
      orphansRemoved: 1,
    });
    // Solo la purga y el INSERT del proyecto: nada de tareas.
    expect(executeRawMock).toHaveBeenCalledTimes(2);
  });
});
