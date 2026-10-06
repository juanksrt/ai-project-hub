/**
 * Esquema de validacion (Zod) del formulario de inicio de sesion.
 *
 * Toda la logica de validacion vive aqui y no en el Client Component: asi se
 * puede probar sin montar React ni necesitar un navegador, que es el mismo
 * patron que `task-schema.ts` y `project-schema.ts`.
 *
 * La autenticacion real la hace el proveedor Credentials en el servidor
 * (`authorizeCredentials`): esto solo evita mandar peticiones vacias y poder
 * pintar el error bajo cada campo.
 */
import { z } from 'zod';

/**
 * Contrato del formulario de login.
 *
 * - `email`: se recorta y se exige con formato valido. Se normaliza a
 *   minusculas para coincidir con `parseCredentials`, que tambien lo hace.
 * - `password`: solo se exige que no este vacio; **no se recorta**, porque un
 *   password puede empezar o terminar en espacio.
 */
export const loginSchema = z.object({
  email: z
    .string({ error: 'Escribe tu correo electrónico' })
    .trim()
    .toLowerCase()
    .min(1, 'Escribe tu correo electrónico')
    .pipe(z.email('Ese correo no es válido')),
  password: z
    .string({ error: 'Escribe tu contraseña' })
    .min(1, 'Escribe tu contraseña'),
});

/** Payload ya validado y normalizado. */
export type LoginInput = z.infer<typeof loginSchema>;

/** Errores por campo, listos para pintarse bajo cada input. */
export type LoginFieldErrors = Partial<Record<'email' | 'password', string>>;

/** Resultado de la validacion del formulario. */
export type LoginFormValidation =
  | { ok: true; data: LoginInput }
  | { ok: false; errors: LoginFieldErrors };

/**
 * Valida los valores crudos del formulario de login.
 *
 * Nunca lanza: los problemas de Zod se convierten en un mapa de errores por
 * campo para que el componente solo tenga que renderizarlos.
 *
 * @param values - Cadenas crudas del estado del formulario.
 * @returns `data` normalizado si todo cuadra, o `errors` por campo.
 */
export function validateLoginForm(values: {
  email?: string;
  password?: string;
}): LoginFormValidation {
  const result = loginSchema.safeParse({
    email: values.email ?? '',
    password: values.password ?? '',
  });

  if (result.success) {
    return { ok: true, data: result.data };
  }

  const errors: LoginFieldErrors = {};

  for (const issue of result.error.issues) {
    const field = issue.path[0];

    if (field === 'email' && !errors.email) {
      errors.email = issue.message;
    }

    if (field === 'password' && !errors.password) {
      errors.password = issue.message;
    }
  }

  return { ok: false, errors };
}
