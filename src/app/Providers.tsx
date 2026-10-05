'use client';

import type { ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';

/**
 * Proveedor de sesion para los Client Components hijos.
 *
 * Debe vivir en un Client Component: en App Router, `SessionProvider` consulta
 * `/api/auth/session` desde el navegador, por lo que el layout del servidor
 * solo lo envuelve sin leer secretos (el build de CI sigue funcionando sin
 * `AUTH_SECRET`).
 */
export default function Providers({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
