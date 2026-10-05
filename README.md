# 🤖 AI Project Hub

Plataforma centralizada para organizar proyectos de IA: tareas, documentos y una capa de **RAG** (búsqueda semántica) sobre los documentos de cada proyecto.

Construido con **Next.js (App Router)**, **TypeScript**, **Prisma** y **PostgreSQL**.

> Nota: Rama `feature/test-ci` utilizada para verificar la auditoría automática de CI/CD en GitHub Actions.

---

## 🎯 Propósito

Reunir en un solo lugar lo que normalmente vive disperso: el estado de las tareas, la documentación de cada proyecto y los fragmentos de texto (*chunks*) que alimentan las consultas de IA.

Cada documento se divide en fragmentos indexados para permitir recuperar contexto relevante antes de generar una respuesta, en lugar de enviar el documento completo al modelo.

---

## 🧱 Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) |
| Lenguaje | TypeScript (modo estricto) |
| UI | Shadcn/ui + Tailwind CSS |
| ORM | Prisma |
| Base de datos | PostgreSQL |
| Autenticación | NextAuth.js v5 (Auth.js) + Prisma Adapter |
| Datos vectoriales | pgvector (Supabase / Neon) |
| Deploy | Vercel |
| CI/CD | GitHub Actions |

---

## 🗃️ Modelo de datos

```mermaid
erDiagram
    User ||--o{ Project : "es dueño de"
    User ||--o{ Task : "asigna"
    User ||--o{ Account : "tiene"
    User ||--o{ Session : "tiene"
    Project ||--o{ Task : "contiene"
    Project ||--o{ Document : "contiene"
    Document ||--o{ DocumentChunk : "se divide en"

    User {
        string id PK
        string clerkId UK "opcional (legacy Clerk)"
        string email UK "opcional (Auth.js)"
        datetime emailVerified
        string image
        string name
        string passwordHash "hash scrypt (proveedor Credentials)"
        Role role "ADMIN | MEMBER"
        datetime createdAt
        datetime updatedAt
    }

    Account {
        string provider PK "clave compuesta"
        string providerAccountId PK "clave compuesta"
        string userId FK
        string type
        string accessToken
        string refreshToken
        int expiresAt
    }

    Session {
        string sessionToken UK
        string userId FK
        datetime expires
    }

    VerificationToken {
        string identifier PK "clave compuesta"
        string token PK "clave compuesta"
        datetime expires
    }

    Project {
        string id PK
        string name
        string description
        string ownerId FK
        datetime createdAt
        datetime updatedAt
    }

    Task {
        string id PK
        string title
        string description
        TaskStatus status "PENDING | IN_PROGRESS | COMPLETED"
        TaskPriority priority "LOW | MEDIUM | HIGH"
        string projectId FK
        string assigneeId FK
        datetime createdAt
        datetime updatedAt
    }

    Document {
        string id PK
        string title
        string fileUrl
        text content
        string projectId FK
        datetime createdAt
    }

    DocumentChunk {
        string id PK
        string documentId FK
        text content
        int chunkIndex
        datetime createdAt
    }
```

### Enumeraciones

| Enum | Valores |
|---|---|
| `Role` | `ADMIN`, `MEMBER` |
| `TaskStatus` | `PENDING`, `IN_PROGRESS`, `COMPLETED` |
| `TaskPriority` | `LOW`, `MEDIUM`, `HIGH` |

---

## 📁 Estructura

```
ai-project-hub/
├── AGENT.md            # Reglas del repositorio para agentes de IA
├── spec.md             # Requerimientos y arquitectura
├── prisma/
│   ├── schema.prisma   # Esquema de la base de datos
│   └── migrations/     # Migraciones versionadas
├── src/
│   ├── app/            # Rutas, páginas y Server Actions
│   ├── components/
│   │   ├── ui/         # Componentes atómicos (Shadcn/ui)
│   │   └── features/   # Componentes con lógica de negocio
│   ├── lib/            # Cliente de Prisma, utilidades, conectores IA/RAG
│   └── types/          # Interfaces y tipos TypeScript
├── src/app/__tests__/    # Tests con Vitest
└── .github/workflows/  # CI/CD
```

---

## ⚙️ Configuración local

### Requisitos
- **Node.js 20.9+** (probado en 24)
- **PostgreSQL 15+** (Neon / Supabase)

### Instalación

```bash
npm install
cp .env.example .env.local
npx prisma migrate dev
npm run dev
```

### Variables de entorno

```bash
DATABASE_URL="postgresql://usuario:password@localhost:5432/ai_project_hub"
AUTH_SECRET="openssl rand -base64 32"
AUTH_TRUST_HOST=true
```

> Las llaves nunca se suben al repositorio: viven en `.env.local`, ignorado por `.gitignore`.

---

## 🔐 Autenticación

NextAuth.js v5 (Auth.js) con adaptador de Prisma sobre los modelos
`User`, `Account`, `Session` y `VerificationToken`.

| Archivo | Responsabilidad |
|---|---|
| `src/lib/auth-config.ts` | Proveedor Credentials, adaptador perezoso, callbacks de sesión |
| `src/auth.ts` | `NextAuth(authConfig)` → `handlers`, `auth`, `signIn`, `signOut` |
| `src/app/api/auth/[...nextauth]/route.ts` | Ruta API (`GET`/`POST`) |
| `src/components/features/AuthButton.tsx` | Botón Login/Logout de la navegación |

**Inicio de sesión:** la navegación muestra *Ingresar* → formulario de
`/api/auth/signin`. Los usuarios de prueba se crean con `npx prisma seed`
(`prisma/seed.ts`): `admin@aiprojecthub.dev` / `Admin1234!` (solo desarrollo,
configurable con `SEED_USER_PASSWORD`).

**Variables:** `AUTH_SECRET` es obligatoria (mínimo 32 caracteres); sin ella
Auth.js rechaza las peticiones. `AUTH_TRUST_HOST=true` hace falta fuera de
Vercel.

**OAuth (pendiente):** añade GitHub/Google a `src/lib/auth-config.ts` y define
`AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`. El adaptador ya persiste esas cuentas.

---

## 📜 Comandos

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run type-check` | Verificación de tipos TypeScript |
| `npm run lint` | Linter |
| `npm run test` | Suite de pruebas |

---

## 🔀 Flujo de trabajo

Este repositorio sigue un flujo basado en Pull Requests. **Ningún cambio llega directo a `main`.**

1. Crea una rama: `git checkout -b feat/mi-funcionalidad`
2. Commitea con Conventional Commits: `git commit -m "feat: agregar busqueda semantica"`
3. Sube la rama: `git push -u origin feat/mi-funcionalidad`
4. Abre el **Pull Request** hacia `main`
5. CI/CD corre las verificaciones antes de aprobar el merge

---

## 👥 Autores

| Autor | GitHub |
|---|---|
| **Juan Sampayo** | [@juanksrt](https://github.com/juanksrt) |

---

## 📄 Licencia

Proyecto en desarrollo activo.
