import { PrismaClient } from '@prisma/client';

import { assertDatabaseUrl } from '@/lib/env';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Devuelve el cliente de Prisma, creandolo en el primer uso (Singleton perezoso).
 *
 * ## Por que NO se instancia al importar el modulo
 *
 * Next.js importa los modulos de las rutas durante `next build` para recoger
 * su configuracion. Si el cliente se creara en el scope del modulo, el build
 * exigiria `DATABASE_URL` aunque no llegara a tocar la base de datos, y la
 * compilacion fallaria en cualquier entorno sin esa variable (por ejemplo, un
 * job de CI que solo quiere verificar que el codigo compila).
 *
 * Con esta version:
 * - `next build` compila sin necesidad de la base de datos
 * - la validacion de `DATABASE_URL` ocurre en el primer request real
 *
 * ## Por que el singleton vive en `globalThis`
 *
 * En desarrollo, Next.js recarga los modulos en cada guardado (Hot Module
 * Replacement). Sin `globalThis`, cada recarga crearia un cliente nuevo y
 * acumularia conexiones hasta agotar el limite de PostgreSQL.
 */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      datasources: { db: { url: assertDatabaseUrl() } },
    });
  }

  return globalForPrisma.prisma;
}
