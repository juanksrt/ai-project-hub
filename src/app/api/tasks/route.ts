import type { Session } from 'next-auth';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { indexTask } from '@/lib/embeddings';
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
  /** `true` si el embedding de la tarea quedo guardado en pgvector. */
  indexed: boolean;
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
 * 1. `auth()` lee la sesion activa de NextAuth (JWT) dentro de su propio
 *    `try/catch`: sin sesion -> 401, y si NextAuth lanza -> tambien 401 con
 *    mensaje claro (nunca un 500 generico).
 * 2. El cuerpo se valida con `createTaskSchema` (Zod). Payload invalido -> 400
 *    con `fieldErrors` por campo para que el formulario marque los inputs.
 * 3. Se comprueba que el proyecto existe en la base de datos -> 404 si no.
 * 4. Se persiste con Prisma (Neon) usando `session.user.id` como `assigneeId`,
 *    de modo que el cliente jamas puede asignar una tarea a otro usuario.
 * 5. Se genera el embedding de la tarea con el Vercel AI SDK y se guarda en la
 *    tabla `Embedding` (pgvector) para la busqueda por similitud del chat.
 *
 * @param request - Peticion con el JSON de la tarea.
 * @returns 201 con la tarea creada, o el error correspondiente.
 */
export async function POST(
  request: Request,
): Promise<NextResponse<CreateTaskSuccessResponse | CreateTaskErrorResponse>> {
  try {
    // Si `auth()` lanza (cookie corrupta, AUTH_SECRET mal configurado...), se
    // responde 401 con un mensaje claro: sin este try/catch el error caeria en
    // el catch general y la persona veria un 500 sin saber que es la sesion.
    let session: Session | null = null;

    try {
      session = await auth();
    } catch (error) {
      console.error('No se pudo leer la sesión en POST /api/tasks:', error);

      return NextResponse.json<CreateTaskErrorResponse>(
        { error: 'No pudimos verificar tu sesión. Inicia sesión de nuevo.' },
        { status: 401 },
      );
    }

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

    // Indexa la tarea en pgvector para que el asistente RAG pueda encontrarla
    // por similitud coseno. `indexTask` nunca lanza: si el proveedor de IA
    // falla, la tarea se crea igualmente y `indexed` informa del fallo.
    const indexed = await indexTask(task);

    return NextResponse.json<CreateTaskSuccessResponse>({ task, indexed }, { status: 201 });
  } catch (error) {
    console.error('Error en POST /api/tasks:', error);

    return NextResponse.json<CreateTaskErrorResponse>(
      { error: 'Error interno al crear la tarea' },
      { status: 500 },
    );
  }
}
