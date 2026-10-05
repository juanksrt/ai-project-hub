import { describe, expect, it } from 'vitest';

import { CredentialsError, hashPassword, verifyPassword } from '@/lib/credentials';

describe('hashPassword', () => {
  it('genera un hash en formato scrypt$cost$salt$hash', () => {
    const hash = hashPassword('secreta-123');

    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(hash.split('$')).toHaveLength(4);
  });

  it('usa un salt distinto en cada llamada', () => {
    expect(hashPassword('secreta-123')).not.toBe(hashPassword('secreta-123'));
  });

  it('rechaza un password vacio', () => {
    expect(() => hashPassword('')).toThrow(CredentialsError);
  });
});

describe('verifyPassword', () => {
  it('acepta el password correcto', () => {
    const hash = hashPassword('secreta-123');

    expect(verifyPassword('secreta-123', hash)).toBe(true);
  });

  it('rechaza un password distinto', () => {
    const hash = hashPassword('secreta-123');

    expect(verifyPassword('secreta-124', hash)).toBe(false);
  });

  it('no lanza con hashes malformados, solo devuelve false', () => {
    const corruptos = [
      '',
      'sin-estructura',
      'scrypt$16384$solo-tres-campos',
      'bcrypt$16384$aa$bb',
      'scrypt$no-numerico$aa$bb',
      'scrypt$16384$zz$zz', // hex invalido: Buffer.from devuelve vacio
      'scrypt$16384$$',
    ];

    for (const corrupto of corruptos) {
      expect(verifyPassword('secreta-123', corrupto)).toBe(false);
    }
  });

  it('rechaza un coste fuera de rango en lugar de consumir CPU', () => {
    expect(verifyPassword('secreta-123', 'scrypt$1073741824$aa$bb')).toBe(false);
    expect(verifyPassword('secreta-123', 'scrypt$2$aa$bb')).toBe(false);
  });
});
