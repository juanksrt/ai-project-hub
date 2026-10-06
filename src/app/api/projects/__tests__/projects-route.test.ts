import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Los dobles se declaran con vi.hoisted para que esten disponibles dentro de
// los factories de vi.mock, que Vitest eleva por encima de los imports.
const { authMock, indexProjectMock, reindexProjectMock, createMock, findUniqueMock, updateMock } =
  vi.hoisted(() => ({
    authMock: vi.fn(),
    indexProjectMock: vi.fn(),
    reindexProjectMock: vi.fn(),
    createMock: vi.fn(),
    findUniqueMock: vi.fn(),
    updateMock: vi.fn(),
  }));

vi.mock('@/auth', () => ({ auth: authMock }));

vi.mock('@/lib/embeddings', () => ({
  indexProject: indexProjectMock,
  reindexProject: reindexProjectMock,
}));

vi.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    project: { create: createMock, findUnique: findUniqueMock, update: updateMock },
  }),
}));

import { POST } from '@/app/api/projects/route';
import { PATCH } from '@/app/api/projects/[id]/route';
import { POST as REINDEX_POST } from '@/app/api/projects/[id]/reindex/route';

/** Cuerpo de respuesta de los endpoints de proyectos. */
interface ProjectRouteResponse {
  project?: { id: string; name: string; description: string | null; ownerId: string };
  indexed?: boolean;
  result?: {
    projectId: string;
    project: boolean;
    tasksTotal: number;
    tasksIndexed: number;
    orphansRemoved: number;
  };
  error?: string;
}

const SESSION_USER_ID = 'user-session-1';
const PROJECT_ID = 'project-1';

const CREATED_PROJECT = {
  id: PROJECT_ID,
  name: 'Lanzamiento SaaS IA',
  description: 'Plataforma con RAG',
  status: 'ACTIVE',
  ownerId: SESSION_USER_ID,
  createdAt: new Date('2026-10-05'),
};

function makeRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function makePatchRequest(id: string, body: unknown): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost:3000/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  ];
}

/** El re-indexado no recibe cuerpo: solo importa el `id` de la ruta. */
function makeReindexRequest(id: string): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost:3000/api/projects/${id}/reindex`, { method: 'POST' }),
    { params: Promise.resolve({ id }) },
  ];
}

describe('POST /api/projects', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    authMock.mockResolvedValue({ user: { id: SESSION_USER_ID } });
    indexProjectMock.mockResolvedValue(true);
    createMock.mockResolvedValue(CREATED_PROJECT);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('responde 401 si no hay sesion activa', async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(makeRequest({ name: 'Proyecto' }));
    const body = (await response.json()) as ProjectRouteResponse;

    expect(response.status).toBe(401);
    expect(body.error).toBe('No autenticado');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('responde 400 si el cuerpo no es JSON valido', async () => {
    const response = await POST(makeRequest('no soy json'));
    const body = (await response.json()) as ProjectRouteResponse;

    expect(response.status).toBe(400);
    expect(body.error).toBe('Cuerpo JSON invalido');
  });

  it('responde 400 si el nombre del proyecto esta vacio', async () => {
    const response = await POST(makeRequest({ name: '   ' }));
    const body = (await response.json()) as ProjectRouteResponse;

    expect(response.status).toBe(400);
    expect(body.error).toBe('Datos del proyecto invalidos');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('crea el proyecto con el propietario de la sesion y lo indexa', async () => {
    const response = await POST(
      makeRequest({ name: 'Lanzamiento SaaS IA', description: 'Plataforma con RAG' }),
    );
    const body = (await response.json()) as ProjectRouteResponse;

    expect(response.status).toBe(201);
    expect(body.indexed).toBe(true);
    expect(body.project?.ownerId).toBe(SESSION_USER_ID);

    expect(createMock).toHaveBeenCalledWith({
      data: {
        name: 'Lanzamiento SaaS IA',
        description: 'Plataforma con RAG',
        ownerId: SESSION_USER_ID,
      },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        ownerId: true,
        createdAt: true,
      },
    });

    // El embedding se genera SIEMPRE a partir del proyecto persistido.
    expect(indexProjectMock).toHaveBeenCalledWith(CREATED_PROJECT);
  });

  it('crea el proyecto aunque la indexacion falle (indexed: false)', async () => {
    indexProjectMock.mockResolvedValue(false);

    const response = await POST(makeRequest({ name: 'Sin IA' }));
    const body = (await response.json()) as ProjectRouteResponse;

    expect(response.status).toBe(201);
    expect(body.indexed).toBe(false);
  });

  it('responde 500 si la base de datos falla', async () => {
    createMock.mockRejectedValue(new Error('conexion rechazada'));

    const response = await POST(makeRequest({ name: 'Proyecto' }));
    const body = (await response.json()) as ProjectRouteResponse;

    expect(response.status).toBe(500);
    expect(body.error).toBe('Error interno al crear el proyecto');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

describe('PATCH /api/projects/[id]', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    authMock.mockResolvedValue({ user: { id: SESSION_USER_ID, role: 'MEMBER' } });
    indexProjectMock.mockResolvedValue(true);
    findUniqueMock.mockResolvedValue({ id: PROJECT_ID, ownerId: SESSION_USER_ID });
    updateMock.mockResolvedValue({
      id: PROJECT_ID,
      name: 'Nombre nuevo',
      description: null,
      status: 'ACTIVE',
      ownerId: SESSION_USER_ID,
      updatedAt: new Date('2026-10-05'),
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('responde 401 si no hay sesion activa', async () => {
    authMock.mockResolvedValue(null);

    const [request, context] = makePatchRequest(PROJECT_ID, { name: 'Nombre nuevo' });
    const response = await PATCH(request, context);
    const body = (await response.json()) as ProjectRouteResponse;

    expect(response.status).toBe(401);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it('responde 404 si el proyecto no existe', async () => {
    findUniqueMock.mockResolvedValue(null);

    const [request, context] = makePatchRequest('no-existe', { name: 'Nombre nuevo' });
    const response = await PATCH(request, context);
    const body = (await response.json()) as ProjectRouteResponse;

    expect(response.status).toBe(404);
    expect(body.error).toBe('Proyecto no encontrado');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('responde 403 si el proyecto es de otro usuario', async () => {
    findUniqueMock.mockResolvedValue({ id: PROJECT_ID, ownerId: 'otro-usuario' });

    const [request, context] = makePatchRequest(PROJECT_ID, { name: 'Nombre nuevo' });
    const response = await PATCH(request, context);
    const body = (await response.json()) as ProjectRouteResponse;

    expect(response.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('permite a un ADMIN editar un proyecto ajeno', async () => {
    authMock.mockResolvedValue({ user: { id: SESSION_USER_ID, role: 'ADMIN' } });
    findUniqueMock.mockResolvedValue({ id: PROJECT_ID, ownerId: 'otro-usuario' });

    const [request, context] = makePatchRequest(PROJECT_ID, { name: 'Nombre nuevo' });
    const response = await PATCH(request, context);

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
  });

  it('actualiza el proyecto y vuelve a generar su embedding', async () => {
    const [request, context] = makePatchRequest(PROJECT_ID, { name: 'Nombre nuevo' });
    const response = await PATCH(request, context);
    const body = (await response.json()) as ProjectRouteResponse;

    expect(response.status).toBe(200);
    expect(body.indexed).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: PROJECT_ID },
      data: { name: 'Nombre nuevo' },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        ownerId: true,
        updatedAt: true,
      },
    });
    expect(indexProjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: PROJECT_ID, name: 'Nombre nuevo' }),
    );
  });

  it('responde 400 si no llega ningun campo que actualizar', async () => {
    const [request, context] = makePatchRequest(PROJECT_ID, { description: '' });
    const response = await PATCH(request, context);
    const body = (await response.json()) as ProjectRouteResponse;

    expect(response.status).toBe(400);
    expect(body.error).toBe('Datos del proyecto invalidos');
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/projects/[id]/reindex', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    authMock.mockResolvedValue({ user: { id: SESSION_USER_ID, role: 'MEMBER' } });
    findUniqueMock.mockResolvedValue({ id: PROJECT_ID, ownerId: SESSION_USER_ID });
    reindexProjectMock.mockResolvedValue({
      projectId: PROJECT_ID,
      project: true,
      tasksTotal: 4,
      tasksIndexed: 4,
      orphansRemoved: 0,
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('responde 401 si no hay sesion activa', async () => {
    authMock.mockResolvedValue(null);

    const [request, context] = makeReindexRequest(PROJECT_ID);
    const response = await REINDEX_POST(request, context);
    const body = (await response.json()) as ProjectRouteResponse;

    expect(response.status).toBe(401);
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(reindexProjectMock).not.toHaveBeenCalled();
  });

  it('responde 404 si el proyecto no existe', async () => {
    findUniqueMock.mockResolvedValue(null);

    const [request, context] = makeReindexRequest('no-existe');
    const response = await REINDEX_POST(request, context);
    const body = (await response.json()) as ProjectRouteResponse;

    expect(response.status).toBe(404);
    expect(body.error).toBe('Proyecto no encontrado');
    expect(reindexProjectMock).not.toHaveBeenCalled();
  });

  it('responde 403 si el proyecto es de otro usuario', async () => {
    findUniqueMock.mockResolvedValue({ id: PROJECT_ID, ownerId: 'otro-usuario' });

    const [request, context] = makeReindexRequest(PROJECT_ID);
    const response = await REINDEX_POST(request, context);
    const body = (await response.json()) as ProjectRouteResponse;

    expect(response.status).toBe(403);
    expect(body.error).toBe('No tienes permiso para re-indexar este proyecto');
    expect(reindexProjectMock).not.toHaveBeenCalled();
  });

  it('permite a un ADMIN re-indexar un proyecto ajeno', async () => {
    authMock.mockResolvedValue({ user: { id: SESSION_USER_ID, role: 'ADMIN' } });
    findUniqueMock.mockResolvedValue({ id: PROJECT_ID, ownerId: 'otro-usuario' });

    const [request, context] = makeReindexRequest(PROJECT_ID);
    const response = await REINDEX_POST(request, context);

    expect(response.status).toBe(200);
    expect(reindexProjectMock).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('re-indexa el proyecto y devuelve los contadores', async () => {
    const [request, context] = makeReindexRequest(PROJECT_ID);
    const response = await REINDEX_POST(request, context);
    const body = (await response.json()) as ProjectRouteResponse;

    expect(response.status).toBe(200);
    expect(body.result).toEqual({
      projectId: PROJECT_ID,
      project: true,
      tasksTotal: 4,
      tasksIndexed: 4,
      orphansRemoved: 0,
    });
    // La autorizacion se decide sobre el dueño del proyecto.
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: PROJECT_ID },
      select: { id: true, ownerId: true },
    });
    expect(reindexProjectMock).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('responde 500 si el re-indexado falla', async () => {
    reindexProjectMock.mockRejectedValue(new Error('rate limit'));

    const [request, context] = makeReindexRequest(PROJECT_ID);
    const response = await REINDEX_POST(request, context);
    const body = (await response.json()) as ProjectRouteResponse;

    expect(response.status).toBe(500);
    expect(body.error).toBe('Error interno al re-indexar el proyecto');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
