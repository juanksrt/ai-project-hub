import type { Role } from '@prisma/client';
import type { DefaultSession } from 'next-auth';

/**
 * Extensiones de los tipos de Auth.js con los datos propios del proyecto.
 *
 * - `Session.user.id` y `Session.user.role`: disponibles en cualquier Server
 *   Component o Server Action despues de `await auth()`.
 * - `User.role`: lo devuelve el `authorize` del proveedor Credentials.
 * - `JWT.role`: se copia del usuario en el callback `jwt` para que la sesion
 *   no requira consultar la base de datos en cada request.
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      /** Puede faltar si el usuario viene de un proveedor sin rol cargado. */
      role?: Role;
    } & DefaultSession['user'];
  }

  interface User {
    role?: Role;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: Role;
  }
}
