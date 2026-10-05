/**
 * Hash y verificacion de passwords para el proveedor Credentials de
 * NextAuth.js.
 *
 * Usa `scrypt` de `node:crypto` en lugar de bcrypt/argon2 para no sumar
 * dependencias nativas al proyecto (regla de AGENT.md: no instalar deps sin
 * confirmacion). scrypt esta recomendado por RFC 7914 y es el mismo
 * algoritmo que usa Auth.js en sus ejemplos con Node.
 *
 * Formato del hash: `scrypt$<cost>$<salt hex>$<hash hex>`
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Prefijo del algoritmo, para poder migrar el formato en el futuro. */
const ALGORITHM = 'scrypt';

/** Coste de scrypt (N). Potencia de dos; 16384 es el default de Node. */
const SCRYPT_COST = 16_384;

/** Longitud del salt aleatorio, en bytes. */
const SALT_BYTES = 16;

/** Longitud de la clave derivada, en bytes. */
const KEY_BYTES = 64;

/** Separador de los campos del hash. */
const SEPARATOR = '$';

/** Errores que puede lanzar el modulo. */
export class CredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialsError';
  }
}

/**
 * Devuelve el hash scrypt de un password, con salt aleatorio.
 *
 * @param password - Password en texto plano. No puede estar vacio.
 * @returns Hash en formato `scrypt$cost$salt$hash`.
 * @throws {CredentialsError} Si el password esta vacio.
 */
export function hashPassword(password: string): string {
  if (password.length === 0) {
    throw new CredentialsError('No se puede hashear un password vacio.');
  }

  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(password, salt, KEY_BYTES, { N: SCRYPT_COST });

  return [ALGORITHM, SCRYPT_COST, salt.toString('hex'), derived.toString('hex')].join(
    SEPARATOR,
  );
}

/**
 * Compara un password en texto plano contra un hash guardado.
 *
 * Devuelve `false` (nunca lanza) ante cualquier hash malformado: un registro
 * corrupto no debe tumbar el login, solo rechazarlo.
 *
 * @param password - Password escrito por el usuario.
 * @param storedHash - Hash persistido en `User.passwordHash`.
 * @returns `true` si el password coincide.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const fields = storedHash.split(SEPARATOR);

  if (fields.length !== 4) return false;

  const [algorithm, costRaw, saltHex, hashHex] = fields;

  if (algorithm !== ALGORITHM || !costRaw || !saltHex || !hashHex) return false;

  // El coste viene del storage: hay que validarlo antes de pasarlo a scrypt
  // para que un valor manipulado no provoque un consumo desmedido de CPU.
  const cost = Number(costRaw);
  const esPotenciaDeDos = (cost & (cost - 1)) === 0;
  if (!Number.isSafeInteger(cost) || cost < 1024 || cost > 2 ** 20 || !esPotenciaDeDos) {
    return false;
  }

  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');

    // Buffer.from no lanza con hex invalido: devuelve un buffer corto o vacio.
    if (salt.length === 0 || expected.length === 0) return false;
    if (salt.length * 2 !== saltHex.length || expected.length * 2 !== hashHex.length) {
      return false;
    }

    const actual = scryptSync(password, salt, expected.length, { N: cost });

    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
