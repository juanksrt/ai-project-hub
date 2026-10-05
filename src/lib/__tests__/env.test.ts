import { describe, expect, it } from 'vitest';

import { EnvironmentError, assertDatabaseUrl } from '@/lib/env';

describe('assertDatabaseUrl', () => {
  it('acepta una URL de PostgreSQL valida', () => {
    const url = 'postgresql://user:pass@ep-foo.us-east-2.aws.neon.tech/neondb?sslmode=require';
    expect(assertDatabaseUrl(url)).toBe(url);
  });

  it('acepta el prefijo postgres:// sin el "ql"', () => {
    expect(assertDatabaseUrl('postgres://user:pass@localhost:5432/db')).toContain('localhost');
  });

  it('rechaza undefined con un mensaje que nombra la variable', () => {
    expect(() => assertDatabaseUrl(undefined)).toThrow(EnvironmentError);
    expect(() => assertDatabaseUrl(undefined)).toThrow(/DATABASE_URL no esta definida/);
  });

  it('rechaza una cadena vacia o solo espacios', () => {
    expect(() => assertDatabaseUrl('')).toThrow(/no esta definida/);
    expect(() => assertDatabaseUrl('   ')).toThrow(/no esta definida/);
  });

  it('rechaza el caso real: caracteres extra pegados al inicio', () => {
    const corrupta = '* * `postgresql://user:pass@host/neondb';
    expect(() => assertDatabaseUrl(corrupta)).toThrow(/mal formada/);
  });

  it('rechaza el protocolo equivocado', () => {
    expect(() => assertDatabaseUrl('mysql://user:pass@host/db')).toThrow(/mal formada/);
  });

  it('no filtra credenciales en el mensaje de error', () => {
    const secreto = 'SECRETO123';
    try {
      assertDatabaseUrl(`basura://user:${secreto}@host/db`);
      expect.unreachable('debio lanzar EnvironmentError');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentError);
      expect(String((error as Error).message)).not.toContain(secreto);
    }
  });
});
