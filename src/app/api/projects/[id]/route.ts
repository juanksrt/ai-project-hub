import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { indexProject } from '@/lib/embeddings';
import { getPrisma } from '@/lib/prisma';
import { updateProjectSchema } from '@/lib/project-schema';

/** Cuerpo de respuesta cuando la actualizacion termina bien. */
interface UpdateProjectSuccessResponse {
  project: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    ownerId: string;
    updatedAt: Date;
  };
  /** `true` si el embedding se volvio a generar y guardar en pgvector. */
  indexed: boolean;
}

/** Cuerpo de respuesta cuando la peticion es invalida o falla. */
interface ProjectErrorResponse {
  error: string;
}

/** Parametros de la ruta dinamica `/api/projects/[id]`. */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * `PATCH /api/projects/[id]` — actualiza un proyecto y re-genera su embedding.
 *
 * Flujo:
 * 1. `auth()` de NextAuth; sin sesion -> 401.
 * 2. Payload validado con `updateProjectSchema` (Zod) -> 400 si no cumple.
 * 3. El proyecto debe existir (404) y ser del usuario de la sesion o de un
 *    ADMIN (403), para que nadie pueda reescribir proyectos ajenos.
 * 4. Se persiste el cambio y se re-indexa: el embedding anterior se
 *    sobrescribe con `ON CONFLICT`, sin duplicados.
 *
 * @param request - Peticion con `{ name?, description? }`.
 * @param context - Contexto de la ruta con el `id` del proyecto.
 * @returns 201 con el proyecto actualizado y el estado de indexacion.
 */
export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json<ProjectErrorResponse>({ error: 'No autenticado' }, { status: 401 });
    }

    const { id } = await context.params;

    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return NextResponse.json<ProjectErrorResponse>(
        { error: 'Cuerpo JSON invalido' },
        { status: 400 },
      );
    }

    const parsed = updateProjectSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json<ProjectErrorResponse>(
        { error: 'Datos del proyecto invalidos' },
        { status: 400 },
      );
    }

    const prisma = getPrisma();
    const existing = await prisma.project.findUnique({
      where: { id },
      select: { id: true, ownerId: true },
    });

    if (!existing) {
      return NextResponse.json<ProjectErrorResponse>({ error: 'Proyecto no encontrado' }, { status: 404 });
    }

    if (existing.ownerId !== session.user.id && session.user.role !== 'ADMIN') {
      return NextResponse.json<ProjectErrorResponse>(
        { error: 'No tienes permiso para editar este proyecto' },
        { status: 403 },
      );
    }

    const data: { name?: string; description?: string | null } = {};

    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.description !== undefined) data.description = parsed.data.description;

    if (Object.keys(data).length === 0) {
      return NextResponse.json<ProjectErrorResponse>(
        { error: 'Datos del proyecto invalidos' },
        { status: 400 },
      );
    }

    const project = await prisma.project.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        ownerId: true,
        updatedAt: true,
      },
    });

    const indexed = await indexProject(project);

    return NextResponse.json<UpdateProjectSuccessResponse>({ project, indexed });
  } catch (error) {
    console.error('Error en PATCH /api/projects/[id]:', error);

    return NextResponse.json<ProjectErrorResponse>(
      { error: 'Error interno al actualizar el proyecto' },
      { status: 500 },
    );
  }
}
