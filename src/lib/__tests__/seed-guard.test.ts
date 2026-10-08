import { describe, expect, it } from 'vitest';

import {
  assertSeedAllowed,
  isLocalDatabaseUrl,
  SeedBlockedError,
  SEED_CONFIRM_ENV,
} from '@/lib/seed-guard';

const LOCAL_URL = 'postgresql://user:pass@localhost:5432/neondb';
const LOCAL_LOOPBACK_URL = 'postgresql://user:pass@127.0.0.1:5432/neondb';
const REMOTE_URL =
  'postgresql://neondb_owner:npg_password@ep-sweet-flower.example.neon.tech/neondb';

describe('seed-guard', () => {
  describe('isLocalDatabaseUrl', () => {
    it('reconoce localhost y loopback como locales', () => {
      expect(isLocalDatabaseUrl(LOCAL_URL)).toBe(true);
      expect(isLocalDatabaseUrl(LOCAL_LOOPBACK_URL)).toBe(true);
      expect(isLocalDatabaseUrl('postgresql://user:pass@[::1]:5432/db')).toBe(true);
    });

    it('trata cualquier host remoto como no local', () => {
      expect(isLocalDatabaseUrl(REMOTE_URL)).toBe(false);
      expect(isLocalDatabaseUrl('postgresql://user:pass@db.example.com/db')).toBe(false);
    });

    it('una URL ilegible cuenta como remota (el seed se bloquea por defecto)', () => {
      expect(isLocalDatabaseUrl('no-es-una-url')).toBe(false);
      expect(isLocalDatabaseUrl('')).toBe(false);
    });
  });

  describe('assertSeedAllowed', () => {
    it('permite el seed contra una base de datos local sin flag', () => {
      expect(() => assertSeedAllowed(LOCAL_URL, undefined)).not.toThrow();
      expect(() => assertSeedAllowed(LOCAL_LOOPBACK_URL, '0')).not.toThrow();
    });

    it('bloquea el seed si falta DATABASE_URL', () => {
      expect(() => assertSeedAllowed(undefined, '1')).toThrow(SeedBlockedError);
      expect(() => assertSeedAllowed(undefined, undefined)).toThrow(
        'DATABASE_URL no definido',
      );
    });

    it('bloquea el seed contra una BD remota sin confirmacion', () => {
      expect(() => assertSeedAllowed(REMOTE_URL, undefined)).toThrow(SeedBlockedError);
      expect(() => assertSeedAllowed(REMOTE_URL, '0')).toThrow(SEED_CONFIRM_ENV);
      expect(() => assertSeedAllowed(REMOTE_URL, 'si')).toThrow('BORRA TODOS LOS DATOS');
    });

    it('permite la BD remota solo con SEED_CONFIRM=1 exacto', () => {
      expect(() => assertSeedAllowed(REMOTE_URL, '1')).not.toThrow();
      expect(() => assertSeedAllowed(REMOTE_URL, '01')).toThrow(SeedBlockedError);
      expect(() => assertSeedAllowed(REMOTE_URL, true as unknown as string)).toThrow(
        SeedBlockedError,
      );
    });

    it('el error explica el riesgo y como autorizarlo', () => {
      expect(() => assertSeedAllowed(REMOTE_URL, undefined)).toThrow(
        `${SEED_CONFIRM_ENV}=1`,
      );
    });
  });
});
