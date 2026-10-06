/**
 * Esquema de validacion (Zod) para los endpoints de proyectos.
 *
 * - `POST /api/projects` crea un proyecto y lo indexa con embeddings.
 * - `PATCH /api/projects/[id]` actualiza nombre/descripcion y re-indexa.
 *
 * La existencia del propietario y los permisos se verifican en las rutas API;
 * aqui solo se valida la forma del payload.
 */
import { z } from 'zod';

/** Longitud maxima aceptada para el nombre del proyecto. */
export const PROJECT_NAME_MAX = 120;

/** Longitud maxima aceptada para la descripcion. */
export const PROJECT_DESCRIPTION_MAX = 2000;

/** Contrato de entrada para crear un proyecto. */
export const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(PROJECT_NAME_MAX, `El nombre no puede superar ${PROJECT_NAME_MAX} caracteres`),
  description: z
    .string()
    .trim()
    .max(PROJECT_DESCRIPTION_MAX, `La descripcion no puede superar ${PROJECT_DESCRIPTION_MAX} caracteres`)
    .optional()
    .transform((value) => (value ? value : undefined)),
});

/**
 * Contrato de entrada para actualizar un proyecto.
 *
 * Todos los campos son opcionales, pero debe llegar al menos uno con valor:
 * un PATCH vacio no tiene sentido y Prisma rechaza un `update` sin datos.
 */
export const updateProjectSchema = createProjectSchema
  .partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    error: 'Indica al menos un campo a actualizar',
  });

/** Payload ya validado y normalizado que reciben las rutas API. */
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/** Payload ya validado y normalizado que recibe el PATCH. */
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
