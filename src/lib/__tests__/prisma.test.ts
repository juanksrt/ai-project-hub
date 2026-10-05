import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EnvironmentError } from '@/lib/env';

const URL_VALIDA =
  'postgresql://user:pass@ep-foo.us-east-2.aws.neon.tech/neondb?sslmode=require';

describe('getPrisma', () => {
  const original = process.env.DATABASE_URL;

  beforeEach(() => {
    // Cada test arranca sin instancia en el global para no arrastrar estado.
    (globalThis as unknown as { prisma?: unknown }).prisma = undefined;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
    (globalThis as unknown as { prisma?: unknown }).prisma = undefined;
  });

  it('crea el cliente en el primer uso sin tocar la base de datos', async () => {
    process.env.DATABASE_URL = URL_VALIDA;
    const { getPrisma } = await import('@/lib/prisma');

    // Importar el modulo NO debe lanzar: por eso este test puede importar.
    expect(() => getPrisma()).not.toThrow();
  });

  it('devuelve siempre la misma instancia (singleton)', async () => {
    process.env.DATABASE_URL = URL_VALIDA;
    const { getPrisma } = await import('@/lib/prisma');

    expect(getPrisma()).toBe(getPrisma());
  });

  it('valida DATABASE_URL de forma perezosa, no al importar', async () => {
    delete process.env.DATABASE_URL;
    const { getPrisma } = await import('@/lib/prisma');

    // Importar no falla...
    expect(() => getPrisma()).toThrow(EnvironmentError);
  });

  it('rechaza una URL mal formada al momento de usarla', async () => {
    process.env.DATABASE_URL = '* * `postgresql://user:pass@host/db';
    const { getPrisma } = await import('@/lib/prisma');

    expect(() => getPrisma()).toThrow(/mal formada/);
  });
});
