-- Extension pgvector: habilita el tipo `vector` y los operadores de similitud
-- (`<=>` = distancia coseno) utilizados por src/lib/embeddings.ts.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "EmbeddingEntityType" AS ENUM ('PROJECT', 'TASK');

-- CreateTable
CREATE TABLE "Embedding" (
    "id" TEXT NOT NULL,
    "entityType" "EmbeddingEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Embedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Embedding_entityType_projectId_idx" ON "Embedding"("entityType", "projectId");

-- CreateIndex
CREATE INDEX "Embedding_projectId_idx" ON "Embedding"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Embedding_entityType_entityId_key" ON "Embedding"("entityType", "entityId");

-- CreateIndex: indice HNSW sobre el vector (pgvector >= 0.5; Neon trae 0.8.x).
-- Acelera la busqueda por similitud coseno (`<=>`) sin escanear la tabla entera.
CREATE INDEX "Embedding_embedding_idx" ON "Embedding" USING hnsw ("embedding" vector_cosine_ops);
