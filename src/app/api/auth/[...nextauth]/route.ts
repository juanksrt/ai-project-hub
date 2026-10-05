import { handlers } from '@/auth';

/**
 * La ruta de autenticacion nunca se prerenderiza: Auth.js lee cookies y
 * headers de cada request, y `force-dynamic` evita que Next.js intente
 * ejecutar el handler durante `next build` (donde no hay sesion ni secretos).
 */
export const dynamic = 'force-dynamic';

export const { GET, POST } = handlers;
