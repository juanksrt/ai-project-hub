import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/tasks/route';

// Los dobles se declaran con vi.hoisted para que esten disponibles dentro de
// los factories de vi.mock, que Vitest eleva por encima de los imports.
const { authMock, findUniqueMock, createMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  findUniqueMock: vi.fn(),
  createMock: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: authMock }));

vi.mock('@/lib/prisma', () => ({
  getPrisma: () => ({
    project: { findUnique: findUniqueMock },
    task: { create: createMock },
  }),
}));

const SESSION_USER_ID = 'user-session-1';
const PROJECT_ID = 'project-1';

/** Cuerpo que acepta un exito o un error de la ruta API. */
interface RouteResponseBody {
  task?: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    projectId: string;
    assigneeId: string | null;
  };
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

const VALID_BODY = {
  title: 'Configurar pipeline RAG',
  description: 'Indexar la documentacion tecnica.',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  projectId: PROJECT_ID,
};

function makeRequest(body: string): Request {
  return new Request('http://localhost:3000/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

function makeJsonRequest(body: unknown): Request {
  return makeRequest(JSON.stringify(body));
}

const CREATED_TASK = {
  id: 'task-1',
  title: VALID_BODY.title,
  description: VALID_BODY.description,
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  projectId: PROJECT_ID,
  assigneeId: SESSION_USER_ID,
};

describe('POST /api/tasks', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    authMock.mockResolvedValue({ user: { id: SESSION_USER_ID } });
    findUniqueMock.mockResolvedValue({ id: PROJECT_ID });
    createMock.mockResolvedValue(CREATED_TASK);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('responde 401 si no hay sesion activa', async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(makeJsonRequest(VALID_BODY));
    const body = (await response.json()) as RouteResponseBody;

    expect(response.status).toBe(401);
    expect(body.error).toBe('No autenticado');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('responde 401 con mensaje claro si la sesion caida lanza, en vez de 500', async () => {
    authMock.mockRejectedValue(new Error('jwt malformed'));

    const response = await POST(makeJsonRequest(VALID_BODY));
    const body = (await response.json()) as RouteResponseBody;

    expect(response.status).toBe(401);
    expect(body.error).toBe('No pudimos verificar tu sesión. Inicia sesión de nuevo.');
    expect(createMock).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('responde 400 con fieldErrors cuando el payload no pasa la validacion de Zod', async () => {
    const response = await POST(
      makeJsonRequest({ ...VALID_BODY, title: '   ', status: 'IN_REVISION' }),
    );
    const body = (await response.json()) as RouteResponseBody;

    expect(response.status).toBe(400);
    expect(Object.keys(body.fieldErrors ?? {})).toEqual(
      expect.arrayContaining(['title', 'status']),
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it('responde 400 si el cuerpo no es JSON valido', async () => {
    const response = await POST(makeRequest('esto no es json'));
    const body = (await response.json()) as RouteResponseBody;

    expect(response.status).toBe(400);
    expect(body.error).toBe('Cuerpo JSON invalido');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('responde 404 si el proyecto no existe en la base de datos', async () => {
    findUniqueMock.mockResolvedValue(null);

    const response = await POST(makeJsonRequest(VALID_BODY));
    const body = (await response.json()) as RouteResponseBody;

    expect(response.status).toBe(404);
    expect(body.fieldErrors?.projectId).toEqual(['Proyecto no encontrado']);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('crea la tarea con 201 y la asigna al usuario de la sesion', async () => {
    const response = await POST(makeJsonRequest(VALID_BODY));
    const body = (await response.json()) as RouteResponseBody;

    expect(response.status).toBe(201);
    expect(body.task?.id).toBe('task-1');
    expect(body.task?.assigneeId).toBe(SESSION_USER_ID);

    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: PROJECT_ID },
      select: { id: true },
    });

    expect(createMock).toHaveBeenCalledWith({
      data: {
        title: VALID_BODY.title,
        description: VALID_BODY.description,
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        projectId: PROJECT_ID,
        // El assignee SIEMPRE viene de la sesion: el cliente no lo envia.
        assigneeId: SESSION_USER_ID,
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        projectId: true,
        assigneeId: true,
      },
    });
  });

  it('ignora el assigneeId que intente enviar el cliente', async () => {
    const response = await POST(
      makeJsonRequest({ ...VALID_BODY, assigneeId: 'otro-usuario', id: 'id-falso' }),
    );

    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assigneeId: SESSION_USER_ID }),
      }),
    );
  });

  it('guarda description como null cuando el formulario no la envia', async () => {
    const { description: _description, ...withoutDescription } = VALID_BODY;

    await POST(makeJsonRequest(withoutDescription));

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: null }),
      }),
    );
  });

  it('responde 500 y no filtra el error si la base de datos falla', async () => {
    createMock.mockRejectedValue(new Error('conexion rechazada'));

    const response = await POST(makeJsonRequest(VALID_BODY));
    const body = (await response.json()) as RouteResponseBody;

    expect(response.status).toBe(500);
    expect(body.error).toBe('Error interno al crear la tarea');
    expect(body.task).toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
