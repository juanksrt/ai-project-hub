import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { indexProject } from '@/lib/embeddings';
import { getPrisma } from '@/lib/prisma';
import { createProjectSchema } from '@/lib/project-schema';

/** Cuerpo de respuesta cuando la creacion termina bien. */
interface CreateProjectSuccessResponse {
  project: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    ownerId: string;
    createdAt: Date;
  };
  /** `true` si el embedding del proyecto quedo guardado en pgvector. */
  indexed: boolean;
}

/** Cuerpo de respuesta cuando la peticion es invalida o falla. */
interface ProjectErrorResponse {
  error: string;
}

/**
 * `POST /api/projects` — crea un proyecto y lo indexa en pgvector.
 *
 * Flujo:
 * 1. `auth()` de NextAuth; sin sesion -> 401.
 * 2. Payload validado con `createProjectSchema` (Zod) -> 400 si no cumple.
 * 3. El propietario es siempre `session.user.id`; el cliente no puede
 *    asignar el proyecto a otro usuario.
 * 4. `indexProject` genera el embedding con el Vercel AI SDK y lo guarda en la
 *    tabla `Embedding`. Nunca lanza: si el proveedor de IA falla, la creacion
 *    sigue siendo un 201 y `indexed` devuelve `false`.
 *
 * @param request - Peticion con `{ name, description? }`.
 * @returns 201 con el proyecto y el estado de indexacion, o el error.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json<ProjectErrorResponse>({ error: 'No autenticado' }, { status: 401 });
    }

    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return NextResponse.json<ProjectErrorResponse>(
        { error: 'Cuerpo JSON invalido' },
        { status: 400 },
      );
    }

    const parsed = createProjectSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json<ProjectErrorResponse>(
        { error: 'Datos del proyecto invalidos' },
        { status: 400 },
      );
    }

    const project = await getPrisma().project.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        ownerId: session.user.id,
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

    const indexed = await indexProject(project);

    return NextResponse.json<CreateProjectSuccessResponse>({ project, indexed }, { status: 201 });
  } catch (error) {
    console.error('Error en POST /api/projects:', error);

    return NextResponse.json<ProjectErrorResponse>(
      { error: 'Error interno al crear el proyecto' },
      { status: 500 },
    );
  }
}
