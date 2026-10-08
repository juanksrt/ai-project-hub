-- CreateIndex
-- POST /api/chat (findDocumentChunks) filtra por document.projectId: sin este
-- indice PostgreSQL hace seq scan sobre DocumentChunk en cada pregunta.
CREATE INDEX "DocumentChunk_documentId_idx" ON "DocumentChunk"("documentId");
