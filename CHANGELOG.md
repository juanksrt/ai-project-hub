# 📋 Registro de Cambios — AI Project Hub

Documentación de las correcciones aplicadas durante la puesta en marcha del proyecto.
Cronológico: cada bloque indica **qué se cambió, por qué, y qué se aprendió**.

---

## 🔴 Fase 1 — Desbloqueo del arranque

El proyecto **no arrancaba**. Estos eran los bloqueadores.

### 1. `package.json` vacío (0 bytes)

**Problema:** el archivo existía pero estaba en blanco. Sin él, `npm install` no sabe
qué instalar y no hay Next.js, React ni Prisma.

**Solución:** se definió el manifiesto completo.

**Claves del diseño:**

| Decisión | Razón |
|---|---|
| `@prisma/client` en `dependencies` | Se necesita en **producción**, se importa desde el código |
| `prisma` en `devDependencies` | Es una **CLI** (migraciones, generate). No se importa en runtime |
| `next` y `react` en `dependencies` | Se empaquetan con la app |
| `typescript`, `tailwindcss`, `eslint` en `devDependencies` | Solo hacen falta al desarrollar |

> **Regla general:** si tu código hace `import X from 'x'`, va en `dependencies`.
> Si solo lo usas desde la terminal, va en `devDependencies`.

### 2. Scripts faltantes

Se agregaron dos scripts que ya eran **exigidos** por otros archivos del repo:

```json
"type-check": "tsc --noEmit",
"test": "vitest run"
```

- `AGENT.md` §6 documenta `npm run type-check` y `npm run test`
- `ci.yml` ejecuta `npm test` en el job `unit-and-integration-tests`

Sin ellos, la CI fallaba antes de ejecutar nada.

### 3. `app/api/chat/chat-route.ts` → `route.ts`

**Problema:** Next.js App Router **solo** reconoce handlers en archivos llamados
exactamente `route.ts` (o `.js`). Con el nombre `chat-route.ts`, la carpeta se
ignoraba y `POST /api/chat` respondía **404**.

```
app/api/chat/chat-route.ts    ← invisible para Next.js
app/api/chat/route.ts         ← reconocido como Route Handler
```

**Aprendizaje:** en App Router, el *nombre del archivo define su función**.
`page.tsx` = página, `route.ts` = API, `layout.tsx` = layout, `loading.tsx` = carga.

### 4. Estructura `/app` → `/src/app`

**Problema:** `AGENT.md` §2 y el `README` especifican `/src/app`, `/src/lib`,
`/src/types`. El código estaba en `/app`, contradiciendo la especificación.

**Solución:** se creó `src/` y se movió la carpeta completa.

```powershell
mkdir src
move app src\app
```

**Aprendizaje:** en un proyecto con Spec-Driven Development, el código es un
*artefacto derivado* del spec. Si divergen, el spec es la fuente de verdad y el
código se ajusta. Next.js acepta ambas convenciones, pero `src/` es la estándar
y la que aparece en la documentación y los tutoriales.

### 5. `tsconfig.json` — el alias `@/`

**Problema:** el código usaba `import { prisma } from '@/lib/prisma'`, pero sin
`tsconfig.json` ese alias no resolvía. Imports rotos en los dos archivos que
importaban Prisma.

**Solución:** se creó el archivo con la clave:

```json
"paths": { "@/*": ["./src/*"] }
```

**Cómo funciona:** es un **comodín**. TypeScript lee `@/lib/prisma`, sustituye
`*` por `lib/prisma` y resuelve `./src/lib/prisma`. Sin esto habría que escribir
`../../lib/prisma`, que se rompe al mover archivos.

Opciones relevantes:

| Opción | Efecto |
|---|---|
| `"strict": true` | Activa el conjunto completo de chequeos. Exigido por `AGENT.md` §4 |
| `"noEmit": true` | Verifica tipos **sin** emitir `.js`. Por eso `--noEmit` |
| `"noUncheckedIndexedAccess": true` | `array[0]` pasa a ser `T \| undefined`, obligando a comprobar antes de usar |
| `"moduleResolution": "bundler"` | Resuelve módulos como lo hace el bundler de Next, no Node clásico |

### 6. `src/lib/prisma.ts` — patrón Singleton

**Problema:** faltaba el archivo que ambos módulos importaban.

**Por qué no basta con `new PrismaClient()`:**

En desarrollo, Next.js usa **Hot Module Replacement**. Cada guardado recarga el
módulo y ejecuta de nuevo el constructor:

```
Guardas archivo  → 1 conexión a Postgres
Guardas otro     → 2 conexiones
... 50 veces      → 💥 P1001: too many connections
```

PostgreSQL tiene un límite (por defecto ~100). El error real no apunta a la
causa, y se presenta después de 15 minutos de trabajo normal.

**Solución — reusar o crear:**

```typescript
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

| Parte | Función |
|---|---|
| `globalThis` | Objeto universal que **sobrevive a los hot reloads** |
| `as unknown as` | Doble conversión: "esto *quizás* tenga `prisma`" |
| `?? new PrismaClient()` | Nullish coalescing: reusa si existe, crea si no |
| `NODE_ENV !== 'production'` | Solo guarda en el cajón al desarrollar; en producción no hay hot reload |

**Patrón:** Singleton. Garantiza **una sola conexión** durante toda la sesión.

---

## 🟡 Fase 2 — Corrección del modelo de datos

### 7. Campo `status` en el modelo `Project`

**Problema:** `page.tsx:63` usaba `p.status`, pero el modelo `Project` en
`schema.prisma` no tenía ese campo. TypeScript lo detectó:

```
error TS2339: Property 'status' does not exist on type '{ tasks: ...; documents: ...; }'
```

El origen era una inconsistencia de diseño: los datos *mock* de la misma página
usaban `status: 'ACTIVE'`, pero el campo nunca se añadió al esquema.

**Solución en dos partes:**

```prisma
enum ProjectStatus {          // 1. el conjunto de valores permitidos
  ACTIVE
  ARCHIVED
}

model Project {
  // ...
  status      ProjectStatus @default(ACTIVE)   // 2. la columna
}
```

**Anatomía de la línea:**

```prisma
  status      ProjectStatus @default(ACTIVE)
  ─────       ────────────  ───────────────
   nombre        tipo          valor inicial
```

- **`status`** — nombre de la columna. Debe coincidir **exactamente** con lo que
  el código lee (`p.status`).
- **`ProjectStatus`** — restringe los valores a `ACTIVE` o `ARCHIVED`. PostgreSQL
  **rechaza** cualquier otro, evitando datos inválidos.
- **`@default(ACTIVE)`** — si no se especifica al crear, se llena solo. Sin esto,
  cada `create()` tendría que pasar el status o fallaría.

**Patrón seguido:** se replicó exactamente la convención ya usada en `Task`,
que tiene `status TaskStatus @default(PENDING)` y `priority TaskPriority`.

**Aprendizaje — la relación código ↔ esquema:**

> Prisma no es una capa de datos cualquiera: **es la fuente de los tipos**.
> `p.status` en TypeScript existe *porque* `status` existe en `schema.prisma`.
> Cambiar el modelo cambia el compilador, y viceversa.

Esa es la razón por la que, tras editar `schema.prisma`, hay que regenerar:

```bash
npx prisma generate     # re-emite los tipos desde el esquema
```

Sin ese paso, TypeScript sigue viendo el modelo viejo aunque el `.prisma` ya tenga
el campo.

---

## 🟠 Fase 3 — Renderizado y tooling

### 8. `src/app/layout.tsx` (root layout)

**Problema:** Next.js **exige** un layout raíz. Sin él el build falla:

```
⨯ Dashboard/page.tsx doesn't have a root layout.
```

**Solución:** se creó con el patrón oficial de la documentación de Next.js.

```tsx
export const metadata: Metadata = { title: '...', description: '...' };
```

`metadata` es la convención de Next 14+ para SEO. Reemplaza el `<head>` manual
y se fusiona automáticamente en todas las páginas.

**Aprendizaje:** `layout.tsx` es el **esqueleto HTML** compartido. Solo puede
existir **uno raíz**, en `app/layout.tsx`. Los layouts anidados se heredan y se
pueden envolver por segmento.

### 9. `src/app/page.tsx` (home)

**Problema:** el proyecto no tenía ruta raíz, solo `/Dashboard`.

**Solución:** Server Component mínimo que enlaza al dashboard con `next/link`.
Se sigue la regla de `AGENT.md` §4: Server Components por defecto, sin `'use client'`.

### 10. `.eslintrc.json`

**Problema:** `next lint` abría un **menú interactivo** para preguntar la
configuración. En CI **no hay nadie que responda**, así que el job moría.

**Solución:**

```json
{ "extends": "next/core-web-vitals" }
```

`next/core-web-vitals` incluye las reglas de accesibilidad y rendimiento de
Google (LCP, CLS...). Es el estándar recomendado por Next.js.

**Aprendizaje:** cualquier herramienta que sea interactiva en local **es un
problema en CI**. Todo lo que la CI ejecute debe ser no-interactivo y estar
versionado.

---

## ✅ Estado final

```
✓ Compiled successfully
✓ Generating static pages (6/6)

Route (app)                              Size     First Load JS
┌ ○ /                                    6.95 kB        91.1 kB
├ ○ /_not-found                          882 B            85 kB
├ λ /api/chat                            0 B                0 B
└ ○ /Dashboard                           140 B          84.3 kB
```

| Verificación | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errores |
| `npx next lint` | ✅ 0 warnings, 0 errores |
| `npx next build` | ✅ 6/6 rutas generadas |
| `npx prisma generate` | ✅ Client v5.22.0 |

Los mensajes `Servidor en modo demo con datos simulados` durante el build son el
`try/catch` del dashboard activating el fallback: no hay `DATABASE_URL` aún, y
está diseñado para degradar sin romperse.

---

## 📌 Pendientes para la próxima fase

| # | Tarea | Motivo |
|---|---|---|
| 1 | `.env.local` con `DATABASE_URL` | Sin base de datos, el dashboard solo muestra mocks |
| 2 | `npx prisma migrate dev --name init` | Crear la tabla `status` en PostgreSQL |
| 3 | Renombrar `src/app/Dashboard` → `dashboard` | Las rutas Next.js van en minúsculas |
| 4 | Configurar Tailwind (`globals.css`, `tailwind.config.js`) | Falta la capa de estilos |
| 5 | Verificar sesión en Clerk en `/api/chat` | **Autorización:** hoy cualquiera lee documentos de cualquier `projectId` |
| 6 | Conectar un LLM real | `systemPrompt` se construye pero nunca se envía; no hay embeddings ni `pgvector` |

> El punto 5 es el más importante. Tal como está, `POST /api/chat` acepta
> cualquier `projectId` y devuelve sus documentos sin comprobar quién pregunta.

---

## 🔑 Conceptos introducidos en esta fase

| Concepto | Dónde apareció |
|---|---|
| **Singleton** | `src/lib/prisma.ts` — una sola conexión pese al hot reload |
| **Alias de importación** | `tsconfig.json` → `@/*` mapeado a `./src/*` |
| **Hot Module Replacement** | Causa raíz de las fugas de conexiones |
| **Prisma como fuente de tipos** | `npx prisma generate` tras editar el esquema |
| **App Router por convención de nombre** | `page.tsx`, `route.ts`, `layout.tsx` |
| **Server vs Client Components** | `layout.tsx` y `page.tsx` sin `'use client'` |
| **Enum como restricción de dominio** | `ProjectStatus` limita los valores válidos |
| **CI no interactiva** | `.eslintrc.json` evita el prompt de ESLint |

---

*Documento generado durante la puesta en marcha del proyecto. Registra decisiones
técnicas y su fundamento, no solo los cambios.*
