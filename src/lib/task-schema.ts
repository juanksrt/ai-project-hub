/**
 * Esquema de validacion (Zod) para la creacion de tareas.
 *
 * Es la fuente unica de verdad del contrato de `POST /api/tasks`: lo consumen
 * la ruta API en el servidor y el formulario del Dashboard en el cliente, de
 * modo que las constantes de estado/prioridad y los tipos solo existen una vez.
 *
 * Los enums son un espejo exacto de `TaskStatus` y `TaskPriority` en
 * `prisma/schema.prisma`; Prisma sigue siendo quien valida en la capa final
 * antes de persistir en PostgreSQL (Neon).
 */
import { z } from 'zod';

/** Estados posibles de una tarea. Espejo de `TaskStatus` (Prisma). */
export const TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED'] as const;

/** Prioridades posibles de una tarea. Espejo de `TaskPriority` (Prisma). */
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;

/** Tipo derivado del array de estados. */
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Tipo derivado del array de prioridades. */
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Longitud maxima aceptada para el titulo. */
export const TASK_TITLE_MAX = 120;

/** Longitud maxima aceptada para la descripcion. */
export const TASK_DESCRIPTION_MAX = 2000;

/**
 * Contrato de entrada para crear una tarea.
 *
 * - `title`: obligatorio, sin espacios sobrantes, maximo 120 caracteres.
 * - `description`: opcional; una cadena vacia se normaliza a `undefined` para
 *   no guardar un string vacio en la columna nullable de Prisma.
 * - `status` / `priority`: enums estrictos; cualquier otro valor se rechaza.
 * - `projectId`: obligatorio; la existencia real del proyecto se verifica en
 *   la ruta API contra la base de datos (devuelve 404 si no existe).
 */
export const createTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'El titulo es obligatorio')
    .max(TASK_TITLE_MAX, `El titulo no puede superar ${TASK_TITLE_MAX} caracteres`),
  description: z
    .string()
    .trim()
    .max(
      TASK_DESCRIPTION_MAX,
      `La descripcion no puede superar ${TASK_DESCRIPTION_MAX} caracteres`,
    )
    .optional()
    .transform((value) => (value ? value : undefined)),
  status: z.enum(TASK_STATUSES, { error: 'Estado no valido' }),
  priority: z.enum(TASK_PRIORITIES, { error: 'Prioridad no valida' }),
  projectId: z.string().trim().min(1, 'Selecciona un proyecto'),
});

/** Payload ya validado y normalizado que recibe la ruta API. */
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/** Errores por campo devueltos al cliente para pintar el formulario. */
export type TaskFieldErrors = Record<string, string[]>;

/**
 * Forma estructural de un issue de Zod.
 *
 * Se declara asi en vez de usar `z.ZodError` para no acoplar la utilidad a una
 * version concreta de Zod (v3 usa `path: string[]` y v4 usa `PropertyKey[]`).
 */
export interface ZodIssueLike {
  readonly path: ReadonlyArray<string | number | symbol>;
  readonly message: string;
}

/**
 * Convierte los issues de Zod en un mapa `campo -> mensajes`.
 *
 * Los problemas sin ruta (error general del objeto) se agrupan bajo `_root`
 * para que ningun mensaje se pierda en el cliente.
 *
 * @param issues - `result.error.issues` de un `safeParse` fallido.
 * @returns Errores agrupados por nombre de campo.
 */
export function toTaskFieldErrors(issues: ReadonlyArray<ZodIssueLike>): TaskFieldErrors {
  const fieldErrors: TaskFieldErrors = {};

  for (const issue of issues) {
    const field = issue.path.length > 0 ? String(issue.path[0]) : '_root';

    if (!fieldErrors[field]) {
      fieldErrors[field] = [];
    }

    fieldErrors[field].push(issue.message);
  }

  return fieldErrors;
}
