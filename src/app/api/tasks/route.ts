import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { getPrisma } from '@/lib/prisma';
import { createTaskSchema, toTaskFieldErrors } from '@/lib/task-schema';

/** Cuerpo de respuesta cuando la creacion termina bien. */
interface CreateTaskSuccessResponse {
  task: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    projectId: string;
    assigneeId: string | null;
  };
}

/** Cuerpo de respuesta cuando la peticion es invalida o falla. */
interface CreateTaskErrorResponse {
  error: string;
  fieldErrors?: Record<string, string[]>;
}

/**
 * `POST /api/tasks` — crea una tarea asignada al usuario autenticado.
 *
 * Flujo:
 * 1. `auth()` lee la sesion activa de NextAuth (JWT). Sin sesion -> 401.
 * 2. El cuerpo se valida con `createTaskSchema` (Zod). Payload invalido -> 400
 *    con `fieldErrors` por campo para que el formulario marque los inputs.
 * 3. Se comprueba que el proyecto existe en la base de datos -> 404 si no.
 * 4. Se persiste con Prisma (Neon) usando `session.user.id` como `assigneeId`,
 *    de modo que el cliente jamas puede asignar una tarea a otro usuario.
 *
 * @param request - Peticion con el JSON de la tarea.
 * @returns 201 con la tarea creada, o el error correspondiente.
 */
export async function POST(
  request: Request,
): Promise<NextResponse<CreateTaskSuccessResponse | CreateTaskErrorResponse>> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json<CreateTaskErrorResponse>(
        { error: 'No autenticado' },
        { status: 401 },
      );
    }

    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return NextResponse.json<CreateTaskErrorResponse>(
        { error: 'Cuerpo JSON invalido' },
        { status: 400 },
      );
    }

    const parsed = createTaskSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json<CreateTaskErrorResponse>(
        {
          error: 'Datos de la tarea invalidos',
          fieldErrors: toTaskFieldErrors(parsed.error.issues),
        },
        { status: 400 },
      );
    }

    const { title, description, status, priority, projectId } = parsed.data;
    const prisma = getPrisma();

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json<CreateTaskErrorResponse>(
        { error: 'El proyecto indicado no existe', fieldErrors: { projectId: ['Proyecto no encontrado'] } },
        { status: 404 },
      );
    }

    const task = await prisma.task.create({
      data: {
        title,
        description: description ?? null,
        status,
        priority,
        projectId,
        assigneeId: session.user.id,
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

    return NextResponse.json<CreateTaskSuccessResponse>({ task }, { status: 201 });
  } catch (error) {
    console.error('Error en POST /api/tasks:', error);

    return NextResponse.json<CreateTaskErrorResponse>(
      { error: 'Error interno al crear la tarea' },
      { status: 500 },
    );
  }
}
