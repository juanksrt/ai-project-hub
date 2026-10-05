import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Session, User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

import {
  authConfig,
  authorizeCredentials,
  parseCredentials,
  sessionWithToken,
  tokenWithRole,
} from '@/lib/auth-config';

/** Connection string de forma válida que nunca se conecta: no hay cliente. */
const URL_VALIDA =
  'postgresql://user:pass@ep-foo.us-east-2.aws.neon.tech/neondb?sslmode=require';

type GlobalConPrisma = { prisma?: unknown };

function limpiarClientePrisma(): void {
  (globalThis as unknown as GlobalConPrisma).prisma = undefined;
}

describe('authConfig', () => {
  const databaseUrlOriginal = process.env.DATABASE_URL;

  beforeEach(() => {
    limpiarClientePrisma();
    vi.resetModules();
  });

  afterEach(() => {
    if (databaseUrlOriginal === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = databaseUrlOriginal;
    limpiarClientePrisma();
    vi.restoreAllMocks();
  });

  it('configura un único proveedor Credentials', () => {
    expect(authConfig.providers).toHaveLength(1);

    const proveedor = authConfig.providers[0];
    // `Provider` puede ser una función o una config ya construida.
    const id = typeof proveedor === 'function' ? proveedor({}).id : proveedor?.id;

    expect(id).toBe('credentials');
  });

  it('usa sesiones JWT, que es lo que exige el proveedor Credentials', () => {
    expect(authConfig.session?.strategy).toBe('jwt');
    expect(authConfig.session?.maxAge).toBeGreaterThan(0);
  });

  it('monta el adaptador de Prisma', () => {
    expect(authConfig.adapter).toBeDefined();
  });

  it('no define pages.signIn: apuntar a /api/auth/signin crea un bucle', () => {
    // Auth.js redirige a options.pages.signIn en lugar de renderizar su
    // formulario, así que apuntar a la propia ruta sería un redirect infinito.
    expect(authConfig.pages?.signIn).toBeUndefined();
  });

  it('declara los callbacks jwt y session', () => {
    expect(typeof authConfig.callbacks?.jwt).toBe('function');
    expect(typeof authConfig.callbacks?.session).toBe('function');
  });

  it('se importa sin DATABASE_URL: no rompe el build de CI', async () => {
    delete process.env.DATABASE_URL;
    limpiarClientePrisma();
    vi.resetModules();

    const modulo = await import('@/lib/auth-config').catch(() => null);

    expect(modulo).not.toBeNull();
    expect(modulo?.authConfig.adapter).toBeDefined();
    // Importar no debe haber instanciado al cliente de Prisma.
    expect((globalThis as unknown as GlobalConPrisma).prisma).toBeUndefined();
  });

  it('no instancia Prisma hasta que se invoca un método del adaptador', async () => {
    process.env.DATABASE_URL = URL_VALIDA;
    limpiarClientePrisma();
    vi.resetModules();

    const { authConfig: config } = await import('@/lib/auth-config');

    expect((globalThis as unknown as GlobalConPrisma).prisma).toBeUndefined();

    const createUser = config.adapter?.createUser;

    expect(typeof createUser).toBe('function');
    expect((globalThis as unknown as GlobalConPrisma).prisma).toBeDefined();
  });
});

describe('parseCredentials', () => {
  it('normaliza el email (espacios y mayúsculas)', () => {
    expect(parseCredentials({ email: '  ANA@Ejemplo.COM ', password: 'x' })).toEqual({
      email: 'ana@ejemplo.com',
      password: 'x',
    });
  });

  it('rechaza payloads ausentes o con tipos incorrectos', () => {
    expect(parseCredentials(undefined)).toBeNull();
    expect(parseCredentials({})).toBeNull();
    expect(parseCredentials({ email: 42, password: 'x' })).toBeNull();
    expect(parseCredentials({ email: 'ana@ejemplo.com', password: 123 })).toBeNull();
    expect(parseCredentials({ email: '   ', password: 'x' })).toBeNull();
    expect(parseCredentials({ email: 'ana@ejemplo.com', password: '' })).toBeNull();
  });
});

describe('authorizeCredentials', () => {
  it('rechaza payloads inválidos sin tocar la base de datos', async () => {
    await expect(authorizeCredentials(undefined)).resolves.toBeNull();
    await expect(authorizeCredentials({ email: 42, password: 'x' })).resolves.toBeNull();
    await expect(
      authorizeCredentials({ email: 'ana@ejemplo.com', password: '' }),
    ).resolves.toBeNull();
  });

  it('devuelve null (y no lanza) cuando la base de datos no está disponible', async () => {
    delete process.env.DATABASE_URL;
    limpiarClientePrisma();
    vi.resetModules();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { authorizeCredentials: authorize } = await import('@/lib/auth-config');

    await expect(
      authorize({ email: 'admin@aiprojecthub.dev', password: 'Admin1234!' }),
    ).resolves.toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('callbacks de sesión', () => {
  it('tokenWithRole guarda el rol devuelto por authorize', () => {
    const token: JWT = { sub: 'user_1' };
    const user: User = { id: 'user_1', email: 'ana@ejemplo.com', role: 'MEMBER' };

    expect(tokenWithRole(token, user).role).toBe('MEMBER');
  });

  it('tokenWithRole conserva el rol si no viene usuario (peticiones posteriores)', () => {
    const token: JWT = { sub: 'user_1', role: 'ADMIN' };

    expect(tokenWithRole(token, null).role).toBe('ADMIN');
  });

  it('sessionWithToken identifica al usuario en la sesión', () => {
    const session: Session = {
      user: { id: 'sin-id', name: 'Ana', email: 'ana@ejemplo.com', image: null },
      expires: '2030-01-01T00:00:00.000Z',
    };
    const token: JWT = { sub: 'user_1', role: 'ADMIN' };

    const resultado = sessionWithToken(session, token);

    expect(resultado.user?.id).toBe('user_1');
    expect(resultado.user?.role).toBe('ADMIN');
    expect(resultado.user?.email).toBe('ana@ejemplo.com');
  });
});
