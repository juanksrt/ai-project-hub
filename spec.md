# spec.md — AI Project Hub

## 1. Visión del Producto
Plataforma web SaaS de gestión de proyectos y tareas con un **asistente RAG integrado** (Retrieval-Augmented Generation) que responde preguntas sobre la documentación técnica de los proyectos sin alucinaciones y con citas explícitas a los documentos originales.

## 2. Metodología de Desarrollo: Spec-Driven Development (SDD)
- **Fase de Requerimientos**: Toda nueva funcionalidad se define primero en este archivo `spec.md` (validación de la intención humana) antes de generar código.
- **Flujo Spec-First / Spec-Anchored**: Las especificaciones y el código se mantienen sincronizados. El código es un artefacto derivado de la intención especificada.

## 3. Stack Tecnológico Principal
- **Frontend**: Next.js (App Router, React Server Components) + TypeScript (Modo Estricto) + Tailwind CSS + Shadcn/ui.
- **Backend & Base de Datos**: PostgreSQL (Supabase / Neon) + Prisma ORM + Server Actions.
- **Módulo de IA & RAG**: Vercel AI SDK + Embeddings (OpenAI / Gemini) + Búsqueda Vectorial (pgvector).
- **Autenticación & Sesiones**: Clerk / NextAuth.js.
- **Calidad, CI/CD y Seguridad**: GitHub Actions (Lint, Type-Check, Tests unitarios/integración con Jest/Playwright y Claude Code Security Review).

## 4. Módulos y Requerimientos del Sistema
### Módulo 1: Autenticación y Control de Acceso
- Registro e inicio de sesión seguro (Email, OAuth GitHub/Google).
- Control de roles (Administrador, Desarrollador, Cliente).

**Implementación (rama `feature/auth-nextauth`):**
- **NextAuth.js v5 (Auth.js)** con `@auth/prisma-adapter` sobre la base de Neon.
- Modelos estándar en `prisma/schema.prisma`: `User` (ampliado con `emailVerified`,
  `image`, `accounts`, `sessions`, `passwordHash`), `Account`, `Session` y
  `VerificationToken`.
- Proveedor **Credentials** (email + password) con hash `scrypt` de `node:crypto`
  (`src/lib/credentials.ts`); la sesión se guarda en JWT (`strategy: "jwt"`).
  Los proveedores OAuth se añaden a `src/lib/auth-config.ts` cuando existan
  credenciales (`AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`).
- Puntos de entrada: `src/auth.ts` (configuración y `auth()`), la ruta
  `src/app/api/auth/[...nextauth]/route.ts` y el botón Login/Logout de la
  navegación (`src/components/features/AuthButton.tsx`).
- Variables requeridas: `AUTH_SECRET` (mínimo 32 caracteres) y, fuera de
  Vercel/Vercel-like, `AUTH_TRUST_HOST=true`.
- El rol (`ADMIN` / `MEMBER`) se propaga al cliente en `session.user.role` sin
  consultar la base de datos en cada request.

### Módulo 2: Dashboard de Proyectos y Tareas
- CRUD completo de Proyectos y Tableros Kanban/Listas.
- Estados de tareas: *Pendiente*, *En Proceso*, *En Revisión*, *Completado*.
- Asignación de miembros y prioridades.

**Implementación (rama `feature/create-task-form`): creación de tareas:**
- Endpoint **`POST /api/tasks`** (`src/app/api/tasks/route.ts`), validado con
  **Zod** (`src/lib/task-schema.ts`): `title` (1–120), `description` opcional
  (≤2000, vacío normalizado a `null`), `status` (`PENDING` / `IN_PROGRESS` /
  `COMPLETED`), `priority` (`LOW` / `MEDIUM` / `HIGH`) y `projectId`.
- Asignación automática al usuario de la sesión: `assigneeId = session.user.id`
  obtenido con `auth()` de NextAuth; el valor enviado por el cliente se ignora.
- Códigos de respuesta: `401` sin sesión, `400` con `fieldErrors` por campo,
  `404` si el proyecto no existe y `500` ante fallo de base de datos.
- UI: modal con Tailwind en `src/components/features/CreateTaskForm.tsx`
  (botón *+ Nueva Tarea* en «Tareas Prioritarias» del Dashboard).

### Módulo 3: Asistente RAG de Documentación
- Subida de archivos técnicos (PDF, Markdown, `.txt`) vinculados a cada proyecto.
- Chunking, generación de embeddings y almacenamiento vectorial en PostgreSQL (pgvector).
- Chat interactivo contextual con citación exacta de fuentes y tasa cero de alucinación.

**Implementación (rama `feature/rag-pgvector`): embeddings de Project y Task:**
- Extensión **pgvector** habilitada en la migración
  `prisma/migrations/20261005212314_add_pgvector_embeddings` (`CREATE EXTENSION
  IF NOT EXISTS vector`, pgvector 0.8.6 en Neon) e índice **HNSW**
  (`vector_cosine_ops`) para la búsqueda por similitud coseno (`<=>`).
- Modelo **`Embedding`** en `prisma/schema.prisma`: `entityType`
  (`PROJECT`/`TASK`), `entityId`, `projectId` (filtro), `title` (cita),
  `content` y `embedding Unsupported("vector(1536)")`. Prisma 5 no expone el
  tipo `vector`, así que la columna se lee/escribe **solo con SQL crudo
  parametrizado** (`$queryRaw` / `$executeRaw`); el upsert es
  `ON CONFLICT ("entityType","entityId")` (re-indexar no duplica).
- **`src/lib/embeddings.ts`**: `generateEmbedding()` (Vercel AI SDK +
  `text-embedding-3-small`, 1536 dimensiones), `indexProject()` / `indexTask()`
  (nunca lanzan: devuelven `false` si falla el proveedor), `similaritySearch()`
  (coseno, score `1 - distancia` recortado a [0,1]), `lexicalSearch()`
  (respaldo `ILIKE` sin credencial) y `deleteProjectEmbeddings()`.
- **Indexación en escritura**: `POST /api/tasks`, `POST /api/projects` y
  `PATCH /api/projects/[id]` generan el embedding al crear/actualizar y
  responden `indexed: boolean`.
- **`POST /api/chat`**: exige sesión (`auth()` → `401` sin sesión), valida con
  `chatRequestSchema` (Zod), embede la última pregunta, busca por coseno (con
  respaldo léxico si falta `OPENAI_API_KEY`), anade los `DocumentChunk` del
  proyecto al contexto y redacta la respuesta con `streamText` (`gpt-4o-mini`)
  devolviendo un **stream de texto plano**. Las fuentes van en las cabeceras
  `X-RAG-Sources` (JSON con `encodeURIComponent`), `X-RAG-Mode` (`llm`/`context`)
  y `X-RAG-Retrieval` (`vector`/`lexical`).
- **UI**: `src/app/Dashboard/ChatSidebar.tsx` (ya montado en el Dashboard) lee
  el stream con `response.body.getReader()` y muestra estados de carga,
  de escritura, error con *Reintentar* y las fuentes citadas con su score.
- **Variables**: `OPENAI_API_KEY` es opcional: sin ella el chat responde en
  modo `context` (contexto recuperado + fuentes) en vez de fallar.
- **Tests**: `src/lib/__tests__/embeddings.test.ts` (24),
  `src/app/api/chat/__tests__/chat-route.test.ts` (10),
  `src/app/api/projects/__tests__/projects-route.test.ts` (12) y
  `src/lib/__tests__/embeddings-e2e.test.ts` (3, integración con Neon: se
  ejecutan solo si existe `DATABASE_URL` y validan el cast a `vector`, el
  `ON CONFLICT` y el operador coseno contra la base de datos real).

### Módulo 4: Auditoría y Métricas
- Registro de consumo de tokens por consulta/proyecto.
- Historial de actividad y eventos del sistema.

## 5. Criterios de Aceptación y Calidad (Quality Gates)
- **Blindaje de Producción**: La rama `main` está bloqueada. Toda contribución entra exclusivamente mediante Pull Request (PR).
- **Testing Mínimo Obligatorio**: Cobertura de pruebas unitarias/integración en flujos críticos (autenticación, Server Actions de DB y procesamiento de vectores RAG).
- **CI/CD Automatizado**: Se ejecutan checks de Lint, Type-Check, Tests y Auditoría de Seguridad con `claude-code-security-review` en cada PR. Si algún check falla, el merge queda bloqueado.
