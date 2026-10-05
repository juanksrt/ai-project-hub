import NextAuth from 'next-auth';

import { authConfig } from '@/lib/auth-config';

/**
 * Inicializacion de NextAuth.js (Auth.js v5).
 *
 * Todo el detalle de la configuracion (adaptador, providers, callbacks) vive en
 * `src/lib/auth-config.ts` para poder probarlo sin el runtime de Next.js.
 *
 * - `handlers`: rutas de `/api/auth/*`, montadas en
 *   `src/app/api/auth/[...nextauth]/route.ts`.
 * - `auth`: servidor de sesion, para usar en Server Components y Server
 *   Actions (`const session = await auth()`).
 * - `signIn` / `signOut`: acciones para usar en Server Actions.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
