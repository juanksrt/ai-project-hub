/**
 * Validacion de variables de entorno.
 *
 * Prisma lanza `PrismaClientInitializationError` con un mensaje generico
 * cuando la URL falta o esta mal formada, lo que hace dificil ver la causa
 * real. Validando aqui, el error dice exactamente que esta mal y desde donde.
 */

/** Patron que debe cumplir una connection string de PostgreSQL. */
const POSTGRES_URL = /^postgres(ql)?:\/\//;

export class EnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentError';
  }
}

/**
 * Valida que DATABASE_URL exista y tenga la forma correcta.
 *
 * @param url - Valor crudo de la variable. Si se omite, lee `process.env`.
 * @returns La URL validada.
 * @throws {EnvironmentError} Si falta o esta mal formada.
 *
 * @remarks No se imprime la URL completa en el error porque podria
 * contener credenciales. Solo los primeros 20 caracteres.
 */
export function assertDatabaseUrl(url: string | undefined = process.env.DATABASE_URL): string {
  if (!url || url.trim() === '') {
    throw new EnvironmentError(
      'DATABASE_URL no esta definida. Configurala en .env.local para ' +
        'desarrollo, y en las variables de entorno del proveedor de ' +
        'despliegue (Vercel, Railway, Neon) para produccion.',
    );
  }

  if (!POSTGRES_URL.test(url)) {
    throw new EnvironmentError(
      'DATABASE_URL mal formada. Debe empezar por "postgresql://" o ' +
        '"postgres://", pero empieza por "' +
        url.slice(0, 20) +
        '". Revisa que no tenga caracteres extra pegados al inicio.',
    );
  }

  return url;
}
