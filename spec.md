# spec.md — AI Project Hub

## 1. Visión del Producto
Plataforma web SaaS de gestión de proyectos y tareas con un **asistente RAG integrado** (Retrieval-Augmented Generation) que responde preguntas sobre la documentación técnica de los proyectos sin alucinaciones y con citas explícitas a los documentos originales.

## 2. Metodología de Desarrollo: Spec-Driven Development (SDD)
- **Fase de Requerimientos**: Toda nueva funcionalidad se define primero en este archivo `spec.md` (validación de la intención humana) antes de generar código.
- **Flujo Spec-First / Spec-Anchored**: Las especificaciones y el código se mantienen sincronizados. El código es un artefacto derivado de la intención especificada.

## 3. Stack Tecnológico Principal
- **Frontend**: Next.js (App Router, React Server Components) + TypeScript (Modo Estricto) + Tailwind CSS + Shadcn/ui.
- **Backend & Base de Datos**: PostgreSQL (Supabase / Neon) + Prisma ORM + Server Actions.
- **Módulo de IA & RAG**: Vercel AI SDK + `@ai-sdk/google` (Google Gemini, capa gratuita) + Búsqueda Vectorial (pgvector).
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
- **Página propia de acceso** (rama `feature/frontend-ui-redesign`):
  `src/app/login/` — server component con `metadata` + client component
  `LoginForm.tsx`. `authConfig.pages.signIn = '/login'` hace que el botón
  *Ingresar* y el proveedor Credentials aterricen ahí; la validación
  previa vive en `src/lib/login-schema.ts` (Zod) y se llama con
  `signIn('credentials', { redirect: false })` para pintar el error de
  credenciales dentro del formulario en vez de saltar a la página de error de
  Auth.js.
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

**Implementación (rama `feature/frontend-ui-redesign`): diseño y responsive:**
- **Tailwind efectivo**: `postcss.config.mjs`, `tailwind.config.js` y
  `src/app/globals.css`. Antes de esta rama los tres ficheros **no existían**,
  `**/*.css` daba 0 resultados y `.next` compilaba **0 bytes de CSS**: todas
  las clases `className` eran inertes.
- **Design tokens** (`canvas`, `surface`, `raised`, `line`, `ink`, `muted`,
  `accent`, `ok`, `warn`, `danger`) como variables RGB con
  `<alpha-value>`, para que `bg-surface/70` componga opacidad. El tema se
  alterna con `darkMode: 'class'` + script anti-FOUC en `layout.tsx` y la
  elección persiste en `localStorage` (`ThemeToggle`).
- **Componentes**: `src/components/ui/Badge.tsx` (`StatusBadge`,
  `PriorityBadge`, traducción ES + tono) y `src/components/ui/Skeleton.tsx`.
- **Estados de carga**: `src/app/Dashboard/loading.tsx` (carga con `Suspense`
  implícito de la ruta) y skeleton de escritura en `ChatSidebar` antes del
  primer chunk.
- **Responsive**: una única cabecera `sticky` en el layout (se elimina la
  duplicada del Dashboard), rejilla `grid-cols-1 lg:grid-cols-4` y chat
  `h-[70vh] min-h-[420px] lg:h-[640px]` con `lg:sticky`.
- **Portada** rediseñada en `src/app/page.tsx` (mantiene `<main>` como raíz,
  que es lo que asserta `app.test.tsx`).
- **Tests**: `src/lib/__tests__/login-schema.test.ts` (8),
  `src/components/ui/__tests__/ui.test.tsx` (8) y
  `src/app/__tests__/app.test.tsx` (+3). Total del repositorio: **156 tests
  en 15 archivos**.

### Módulo 3: Asistente RAG de Documentación
- Subida de archivos técnicos (PDF, Markdown, `.txt`) vinculados a cada proyecto.
- Chunking, generación de embeddings y almacenamiento vectorial en PostgreSQL (pgvector).
- Chat interactivo contextual con citación exacta de fuentes y tasa cero de alucinación.

**Implementación (rama `feature/rag-gemini-free`): embeddings de Project y Task:**
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
  `@ai-sdk/google`, modelo `gemini-embedding-2` con `outputDimensionality`
  fijado a 1536 para respetar `vector(1536)` sin migrar el esquema),
  `indexProject()` / `indexTask()`
  (nunca lanzan: devuelven `false` si falla el proveedor), `similaritySearch()`
  (coseno, score `1 - distancia` recortado a [0,1]), `lexicalSearch()`
  (respaldo `ILIKE` sin credencial) y `deleteProjectEmbeddings()`.
- **Indexación en escritura**: `POST /api/tasks`, `POST /api/projects` y
  `PATCH /api/projects/[id]` generan el embedding al crear/actualizar y
  responden `indexed: boolean`.
- **Re-indexado en lote**: `POST /api/projects/[id]/reindex` vuelve a generar
  los embeddings del proyecto y de todas sus tareas con el modelo actual
  (sesión obligatoria, solo propietario o `ADMIN`), y antes **purga los
  vectores huérfanos** (`deleteOrphanEmbeddings()`: vectores cuya tarea o
  proyecto ya no existe). El upsert `ON CONFLICT` hace la operación
  idempotente; responde `{ result: ReindexResult }` con los contadores.
- **`POST /api/chat`**: exige sesión (`auth()` → `401` sin sesión), valida con
  `chatRequestSchema` (Zod), embede la última pregunta, busca por coseno (con
  respaldo léxico si falta `GOOGLE_GENERATIVE_AI_API_KEY`), anade los `DocumentChunk` del
  proyecto al contexto y redacta la respuesta con `streamText` (`gemini-3.6-flash`)
  devolviendo un **stream de texto plano**. Las fuentes van en las cabeceras
  `X-RAG-Sources` (JSON con `encodeURIComponent`), `X-RAG-Mode` (`llm`/`context`)
  y `X-RAG-Retrieval` (`vector`/`lexical`).
- **UI**: `src/app/Dashboard/ChatSidebar.tsx` (ya montado en el Dashboard) lee
  el stream con `response.body.getReader()` y muestra estados de carga,
  de escritura, error con *Reintentar* y las fuentes citadas con su score.
- **Variables**: `GOOGLE_GENERATIVE_AI_API_KEY` es opcional: sin ella el chat responde en
  modo `context` (contexto recuperado + fuentes) en vez de fallar.
- **Tests**: `src/lib/__tests__/embeddings.test.ts` (32),
  `src/app/api/chat/__tests__/chat-route.test.ts` (10),
  `src/app/api/projects/__tests__/projects-route.test.ts` (18) y
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
