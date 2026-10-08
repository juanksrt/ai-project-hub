/**
 * Guardia de seguridad de `prisma/seed.ts`.
 *
 * El seed **borra todas las tablas** antes de insertar los datos de
 * demostracion. Ejecutarlo contra una base de datos remota (Neon/produccion)
 * destruye los datos reales: ya ocurrio una vez. Este modulo decide si el seed
 * tiene permitido correr, para que nunca vuelva a pasar por accidente.
 *
 * Regla: solo se permite sin confirmacion si la base de datos es local
 * (`localhost` / `127.0.0.1` / `::1`). Cualquier otro host exige el flag
 * `SEED_CONFIRM=1` explicito.
 */

/** Flag de entorno que autoriza el seed contra una base de datos remota. */
export const SEED_CONFIRM_ENV = 'SEED_CONFIRM';

/** Valor que debe tener {@link SEED_CONFIRM_ENV} para autorizar el seed. */
const SEED_CONFIRM_VALUE = '1';

/** Hosts que se consideran base de datos local. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Error lanzado cuando el seed intenta correr contra una BD remota sin flag. */
export class SeedBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedBlockedError';
  }
}

/**
 * Indica si una URL de conexion apunta a una base de datos local.
 *
 * @param databaseUrl - URL en formato `postgresql://user:pass@host:port/db`.
 * @returns `true` solo si el host es local; una URL ilegible cuenta como
 * remota (el seed se bloquea por defecto).
 */
export function isLocalDatabaseUrl(databaseUrl: string): boolean {
  try {
    const host = new URL(databaseUrl).hostname.toLowerCase();

    return LOCAL_HOSTS.has(host);
  } catch {
    return false;
  }
}

/**
 * Lanza {@link SeedBlockedError} si el seed no deberia ejecutarse.
 *
 * @param databaseUrl - `DATABASE_URL` del entorno; ausente o ilegible bloquea.
 * @param confirm - Valor de `SEED_CONFIRM`; solo `'1'` autoriza BDs remotas.
 * @throws {SeedBlockedError} Si la BD es remota y no hay confirmacion explicita.
 */
export function assertSeedAllowed(
  databaseUrl: string | undefined,
  confirm: string | undefined,
): void {
  if (!databaseUrl) {
    throw new SeedBlockedError('DATABASE_URL no definido: no se puede ejecutar el seed.');
  }

  if (isLocalDatabaseUrl(databaseUrl)) return;

  if (confirm !== SEED_CONFIRM_VALUE) {
    throw new SeedBlockedError(
      `DATABASE_URL apunta a una base de datos remota y el seed BORRA TODOS LOS DATOS. ` +
        `Si realmente quieres ejecutarlo, define ${SEED_CONFIRM_ENV}=${SEED_CONFIRM_VALUE}.`,
    );
  }
}
