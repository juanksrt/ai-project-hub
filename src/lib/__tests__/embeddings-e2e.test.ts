/**
 * Prueba de integracion del SQL crudo de pgvector contra la base de datos real.
 *
 * Los tests unitarios de `embeddings.test.ts` mockean Prisma, asi que aqui se
 * verifica lo que el mock no puede comprobar: el cast de la columna `vector`,
 * los nombres de columna en camelCase entre comillas, el `ON CONFLICT` del
 * upsert, el operador coseno (`<=>`) y el `ILIKE` de respaldo.
 *
 * Se ejecuta SOLO si `DATABASE_URL` esta definida (en CI no lo esta, asi que
 * el test queda saltado y no exige red). `afterAll` borra la fila que crea.
 */
import { afterAll, describe, expect, it } from 'vitest';

import {
  EMBEDDING_DIMENSIONS,
  deleteProjectEmbeddings,
  lexicalSearch,
  upsertEmbedding,
} from '@/lib/embeddings';
import { getPrisma } from '@/lib/prisma';

const PROJECT_ID = `e2e-rag-${Date.now()}`;

/** Vector unitario en la primera dimension: distancia coseno 0 contra si mismo. */
const VECTOR = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) =>
  index === 0 ? 1 : 0,
);

const ENTITY = {
  entityType: 'PROJECT' as const,
  entityId: PROJECT_ID,
  projectId: PROJECT_ID,
  title: 'Proyecto E2E RAG',
  content: 'Proyecto: Proyecto E2E RAG\npalabra clave unica para la busqueda lexica',
};

async function countRows(): Promise<number> {
  const rows = await getPrisma().$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM "Embedding" WHERE "projectId" = ${PROJECT_ID}
  `;
  return rows[0]?.n ?? 0;
}

async function cosineScore(): Promise<number> {
  const rows = await getPrisma().$queryRaw<Array<{ score: number | string }>>`
    SELECT 1 - ("embedding" <=> CAST(${JSON.stringify(VECTOR)} AS vector)) AS "score"
    FROM "Embedding"
    WHERE "entityId" = ${PROJECT_ID} AND "entityType" = 'PROJECT'
    LIMIT 1
  `;
  return Number(rows[0]?.score ?? -1);
}

describe.runIf(Boolean(process.env.DATABASE_URL))(
  'E2E contra Neon: SQL crudo de pgvector',
  () => {
  afterAll(async () => {
    await deleteProjectEmbeddings(PROJECT_ID);
  });

  it('inserta el vector, lo re-indexa sin duplicar y lo recupera por coseno', async () => {
    await upsertEmbedding(ENTITY, VECTOR);
    expect(await countRows()).toBe(1);

    // Re-indexar con el mismo (entityType, entityId) actualiza en lugar de duplicar.
    await upsertEmbedding({ ...ENTITY, content: `${ENTITY.content} v2` }, VECTOR);
    expect(await countRows()).toBe(1);

    const score = await cosineScore();
    expect(score).toBeCloseTo(1, 5);
  });

  it('encuentra la entidad por busqueda lexica ILIKE', async () => {
    const hits = await lexicalSearch('palabra clave unica', { projectId: PROJECT_ID });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.entityId).toBe(PROJECT_ID);
    expect(hits[0]?.entityType).toBe('PROJECT');
  });

  it('elimina todos los embeddings del proyecto', async () => {
    const deleted = await deleteProjectEmbeddings(PROJECT_ID);

    expect(deleted).toBeGreaterThan(0);
    expect(await countRows()).toBe(0);
  });
  },
);
