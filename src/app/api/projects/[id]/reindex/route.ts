import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { reindexProject, type ReindexResult } from '@/lib/embeddings';
import { getPrisma } from '@/lib/prisma';

/** Cuerpo de respuesta cuando el re-indexado termina bien. */
interface ReindexSuccessResponse {
  /** Contadores de lo que se re-indexo y de lo que se limpio. */
  result: ReindexResult;
}

/** Cuerpo de respuesta cuando la peticion es invalida o falla. */
interface ProjectErrorResponse {
  error: string;
}

/** Parametros de la ruta dinamica `/api/projects/[id]/reindex`. */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * `POST /api/projects/[id]/reindex` — re-genera los embeddings de un proyecto.
 *
 * Es la operacion de mantenimiento que permite cambiar de proveedor de IA (o
 * de modelo) sin re-crear cada entidad: primero se borran los vectores cuya
 * entidad ya no existe y despues se vuelven a generar los del proyecto y de
 * todas sus tareas con el modelo actual.
 *
 * Flujo:
 * 1. `auth()` de NextAuth; sin sesion -> 401.
 * 2. El proyecto debe existir (404).
 * 3. Solo el propietario o un ADMIN pueden re-indexarlo (403).
 * 4. `reindexProject()` -> 200 con los contadores. El upsert `ON CONFLICT`
 *    sobrescribe los vectores anteriores, asi que repetir la llamada es
 *    inocuo: no duplica filas.
 *
 * @param _request - Sin cuerpo: la operacion no recibe parametros.
 * @param context - Contexto de la ruta con el `id` del proyecto.
 * @returns 200 con los contadores, o el codigo de error correspondiente.
 */
export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json<ProjectErrorResponse>({ error: 'No autenticado' }, { status: 401 });
    }

    const { id } = await context.params;
    const existing = await getPrisma().project.findUnique({
      where: { id },
      select: { id: true, ownerId: true },
    });

    if (!existing) {
      return NextResponse.json<ProjectErrorResponse>({ error: 'Proyecto no encontrado' }, { status: 404 });
    }

    if (existing.ownerId !== session.user.id && session.user.role !== 'ADMIN') {
      return NextResponse.json<ProjectErrorResponse>(
        { error: 'No tienes permiso para re-indexar este proyecto' },
        { status: 403 },
      );
    }

    const result = await reindexProject(id);

    return NextResponse.json<ReindexSuccessResponse>({ result });
  } catch (error) {
    console.error('Error en POST /api/projects/[id]/reindex:', error);

    return NextResponse.json<ProjectErrorResponse>(
      { error: 'Error interno al re-indexar el proyecto' },
      { status: 500 },
    );
  }
}
