import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Lee el esquema de Prisma como texto: así se validan los modelos estándar de
 * NextAuth sin necesidad de una base de datos ni de generar el cliente.
 */
const schema = readFileSync(
  fileURLToPath(new URL('../../../prisma/schema.prisma', import.meta.url)),
  'utf8',
);

/** Devuelve el cuerpo interno de un modelo (`model X { ... }`). */
function cuerpoDe(modelo: string): string {
  const coincidencia = schema.match(new RegExp(`model ${modelo} \\{([\\s\\S]*?)\\n\\}`, 'm'));

  if (!coincidencia?.[1]) {
    throw new Error(`El modelo ${modelo} no existe en prisma/schema.prisma`);
  }

  return coincidencia[1];
}

describe('prisma/schema.prisma — modelos de NextAuth', () => {
  it('declara los cuatro modelos estándar', () => {
    for (const modelo of ['User', 'Account', 'Session', 'VerificationToken']) {
      expect(() => cuerpoDe(modelo)).not.toThrow();
    }
  });

  it('User expone los campos y relaciones que espera el adaptador', () => {
    const user = cuerpoDe('User');

    expect(user).toContain('email         String?   @unique');
    expect(user).toContain('emailVerified DateTime?');
    expect(user).toContain('image         String?');
    expect(user).toContain('accounts Account[]');
    expect(user).toContain('sessions Session[]');
  });

  it('User conserva el dominio del proyecto (roles, proyectos y tareas)', () => {
    const user = cuerpoDe('User');

    expect(user).toContain('clerkId       String?   @unique');
    expect(user).toContain('role          Role      @default(MEMBER)');
    expect(user).toContain('ownedProjects Project[]');
    expect(user).toContain('tasks         Task[]');
  });

  it('User guarda el hash del password para el proveedor Credentials', () => {
    expect(cuerpoDe('User')).toContain('passwordHash  String?');
  });

  it('Account usa la clave compuesta provider/providerAccountId', () => {
    const account = cuerpoDe('Account');

    expect(account).toContain('userId            String');
    expect(account).toContain('providerAccountId String');
    expect(account).toContain('refresh_token     String? @db.Text');
    expect(account).toContain('user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)');
    expect(schema).toMatch(/@@id\(\[provider, providerAccountId\]\)/);
  });

  it('Session usa sessionToken único y referencia al usuario', () => {
    const session = cuerpoDe('Session');

    expect(session).toContain('sessionToken String   @unique');
    expect(session).toContain('userId       String');
    expect(session).toContain('expires      DateTime');
    expect(session).toContain('user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)');
  });

  it('VerificationToken usa la clave compuesta identifier/token', () => {
    const verification = cuerpoDe('VerificationToken');

    expect(verification).toContain('identifier String');
    expect(verification).toContain('token      String   @unique');
    expect(verification).toContain('expires    DateTime');
    expect(schema).toMatch(/@@id\(\[identifier, token\]\)/);
  });

  it('apunta a PostgreSQL mediante DATABASE_URL (Neon)', () => {
    expect(schema).toContain('provider = "postgresql"');
    expect(schema).toContain('url      = env("DATABASE_URL")');
  });
});
