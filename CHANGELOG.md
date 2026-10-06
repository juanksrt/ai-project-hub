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

## 🔴 Fase 4 — Cierre de brechas de seguridad y pipeline verde

La CI falló en su primera ejecución. La causa raíz no era un error de código, sino
**dependencias obsoletas**. El job de seguridad hizo exactamente su trabajo.

### 11. `vitest` declarado pero no instalado

**Síntoma en CI:**

```
sh: 1: vitest: not found
```

**Causa:** el script `"test": "vitest run"` existía en `package.json`, pero el paquete
`vitest` nunca se añadió a `devDependencies`. Un script sin su dependencia es un
error latente: en local nunca se ejecuta, solo falla cuando la CI lo invoca.

**Solución:**

```bash
npm install -D vitest
```

**Aprendizaje:** un script en `package.json` es una **declaración de intención**.
Si la herramienta no está instalada, el fallo aparece tarde y en otro entorno.
CI es donde se descubren esos errores.

### 12. Vulnerabilidades críticas en Next.js 14.1.0

**Síntoma en CI:**

```
2 vulnerabilities (1 high, 1 critical)
Severity: critical
  Next.js Allows a Denial of Service (DoS) with Server Actions — GHSA-7m27-7ghc-44w9
  Next has a Denial of Service with Server Components (incomplete fix) — GHSA-5j59-xgg2-r9c4
```

**Investigación.** Antes de actualizar se verificó si existía un parche en la misma
rama, para evitar un salto mayor de versión:

| Versión | Resultado de `npm audit` |
|---|---|
| `next@14.1.0` (actual) | 1 critical + 1 high ❌ |
| `next@14.2.35` (último parche de 14) | 1 critical + 1 high ❌ |
| `next@16.3.8` (latest) | **0 vulnerabilidades** ✅ |

**Conclusión:** la rama 14 no tiene parche de seguridad. Ambas advertencias son de
**Denial of Service**, lo que significa que un atacante puede tornar el servicio
inaccesible con una petición crafted. En un repositorio público, esto queda
registrado en el historial y en el panel de advisories de GitHub.

**Solución:** migración a Next 16.3.8 con su cadena de peer dependencies:

| Paquete | Antes | Después | Motivo |
|---|---|---|---|
| `next` | 14.1.0 | 16.3.8 | Resuelve las CVEs |
| `react` / `react-dom` | 18.2.0 | 19.3.0 | Peer dep de Next 16 |
| `eslint` | 8.57.0 | 9.39.5 | `eslint-config-next@16` requiere ESLint ≥ 9 |
| `eslint-config-next` | 14.1.0 | 16.3.8 | Debe coincidir con `next` |
| `lucide-react` | 0.344.0 | 1.49.0 | Versión antigua, sin soporte para React 19 |
| `@types/react(-dom)` | 18.x | 19.x | Alineado con React 19 |
| `@types/node` | 20.x | 24.x | Alineado con el runtime |

**Conflictos de peer dependencies.** La actualización no fue un solo comando. npm
rechazó el install en cadena dos veces:

1. `eslint@8` es incompatible con `eslint-config-next@16` (requiere ≥ 9)
2. `lucide-react@0.344` declara `react: ^18` como peer, no acepta React 19

Ambos se resolvieron **actualizando la dependencia**, nunca con `--legacy-peer-deps`.
Esa bandera solo silencia el aviso: acepta un árbol que puede romperse en runtime.

### 13. `next lint` eliminado en Next 16

**Síntoma:**

```
$ npx next lint
Invalid project directory provided, no such directory: D:\ai-project-hub\lint
```

El comando `next lint` fue deprecado en Next 15 y **eliminado en Next 16**. Ahora el
CLI interpreta `lint` como el nombre de un directorio a construir.

**Solución:** invocar ESLint directamente y migrar al **flat config**.

```diff
- "lint": "next lint"
+ "lint": "eslint ."
```

```diff
- // .eslintrc.json  (formato legacy, no soportado por ESLint 9)
- { "extends": "next/core-web-vitals" }
+ // eslint.config.mjs  (flat config)
+ import { defineConfig, globalIgnores } from 'eslint/config';
+ import nextPlugin from '@next/eslint-plugin-next';
+
+ export default defineConfig([
+   nextPlugin.configs['core-web-vitals'],
+   globalIgnores(['.next/**', 'node_modules/**', 'next-env.d.ts']),
+ ]);
```

**Sobre el preset:** `eslint-config-next@16` expone `.`, `./core-web-vitals`,
`./typescript` y `./parser`. El objeto `core-web-vitals` es un **configo único**, no
un array, por lo que se pasa directo en el array de `defineConfig` — sin `...`.

### 14. Vitest vs. `"jsx": "preserve"`

**Síntoma:**

```
Failed to parse source for import analysis because the content contains
invalid JS syntax. If you use tsconfig.json, make sure to not set jsx to preserve.
```

**Diagnóstico.** Es una colisión entre dos herramientas que quieren controlar la
misma cosa:

- `tsconfig.json` declara `"jsx": "preserve"` porque **Next.js** transpila el JSX en
  su propio pipeline (Turbopack). `preserve` significa "no lo toques".
- **Vitest** no usa ese pipeline. Transforma los archivos con **oxc** y necesita JSX
  ya convertido a funciones (`jsx()`), o el parser de Vite no puede analizarlo.

Dos detalles que costaron tiempo y conviene documentar:

1. **Vitest 5 usa `oxc`, no `esbuild`.** Configurar `esbuild: { jsx: 'automatic' }`
   se ignora en silencio con el aviso `oxc options will be used and esbuild options
   will be ignored`. La opción correcta es `oxc: { jsx: { runtime: 'automatic' } }`.
2. **El archivo debe ser `.mts`.** Con `.ts`, Vite lo carga como CommonJS y falla
   con `ESM syntax in a file loaded as CommonJS`, porque `package.json` no declara
   `"type": "module"`.

**Solución:** `vitest.config.mts` con el alias `@/` replicado y el runtime de JSX
explícito para oxc.

> Next 16 también corrigió `tsconfig.json` automáticamente: cambió `jsx` a
> `react-jsx` y añadió `.next/dev/types/**/*.ts` al `include`. Es el comportamiento
> esperado con el runtime automático de React.

### 15. Primer test real

Antes de tener vitest configurado, la CI ejecutaba `npm test -- --passWithNoTests`,
que **nunca fallaba** aunque no existiera un solo test. Una puerta que siempre
abre no es una puerta.

Se creó `src/app/__tests__/app.test.tsx` con 2 tests sobre los contratos públicos del
layout y la home, y la CI ahora corre `npm test` **sin** el flag de tolerancia.

### 16. CI actualizado

| Cambio | Antes | Después | Motivo |
|---|---|---|---|
| Versión de Node | 20 | 24 | Node 20 estaba deprecado en los runners |
| Job `build` | ❌ no existía | ✅ agregado | Ninguna CI verificaba que la app compilara |
| Auditoría | `--production` | `--omit=dev` | Flag deprecado en npm 11+ |
| Tests | `--passWithNoTests` | `npm test` | Deja de tolerar suites vacías |
| Dependencias de jobs | — | `npm ci` | Determinista: usa el lockfile, no resuelve de nuevo |

`npm ci` es preferible a `npm install` en CI: instala **exactamente** las versiones
del `package-lock.json` y falla si este y `package.json` no coinciden.

---

## ✅ Estado final tras la Fase 4

```
✓ Compiled successfully (Next.js 16.3.8 · Turbopack)

Route (app)
├ ○ /
├ ○ /_not-found
├ ƒ /api/chat
└ ○ /Dashboard
```

| Verificación | Resultado |
|---|---|
| `npm run type-check` | ✅ 0 errores |
| `npm run lint` | ✅ 0 errores |
| `npm test` | ✅ 2 tests pasando |
| `npm audit --omit=dev` | ✅ 0 vulnerabilidades |
| `npm run build` | ✅ 4 rutas generadas |

`ƒ /api/chat` indica que la ruta se renderiza **bajo demanda** (dinámica), no de
forma estática. Es el comportamiento correcto para un endpoint que consulta la base
de datos o recibe peticiones POST.

---

## 📌 Pendientes para la próxima fase

| # | Tarea | Motivo |
|---|---|---|
| 1 | `.env.local` con `DATABASE_URL` | Sin base de datos, el dashboard solo muestra mocks |
| 2 | `npx prisma migrate dev --name init` | Crear las tablas, incluido el nuevo campo `status` |
| 3 | **Autorización en `/api/chat`** | **Crítico:** hoy cualquiera lee documentos de cualquier `projectId` |
| 4 | Conectar un LLM real | `systemPrompt` se construye pero nunca se envía; no hay embeddings ni `pgvector` |
| 5 | Tailwind (`globals.css`, `tailwind.config.js`) | Falta la capa de estilos |
| 6 | Renombrar `src/app/Dashboard` → `dashboard` | Las rutas Next.js van en minúsculas |
| 7 | `.env.example` | Documentar variables sin exponer secretos |
| 8 | Deploy en Vercel | Conectar con `npx vercel` y configurar el workflow |

> El punto 3 es el más urgente. Tal como está, `POST /api/chat` acepta cualquier
> `projectId` y devuelve sus documentos sin comprobar quién pregunta. Es un fallo de
> **autorización**, y no se arregla con los advisories: requiere Clerk.

---

## 🔑 Conceptos introducidos en esta fase

| Concepto | Dónde apareció |
|---|---|
| **Peer dependencies** | `react` 19 obliged a actualizar `lucide-react` |
| **Superficie de ataque** | Por qué un DoS en un repo público importa |
| **CVE / advisory** | GitHub Advisory Database como fuente |
| **Flat config** | `eslint.config.mjs` reemplaza `.eslintrc.json` en ESLint 9 |
| **oxc vs esbuild** | Vitest 5 usa oxc; configurar esbuild se ignora |
| **`npm ci` vs `npm install`** | Determinismo en CI |
| **Tests que no fallan** | El riesgo de `--passWithNoTests` |
| **Deprecación vs eliminación** | `next lint` existió como warning, luego se eliminó |
| **Deprecación de runtime** | Node 20 en runners, Prisma 5 frente a Prisma 8 |

---

---

## 🔐 Fase 5 — Autenticación con NextAuth.js v5 (Auth.js)

Rama `feature/auth-nextauth`. Implementa el **Módulo 1** de `spec.md` con
NextAuth.js v5 + adaptador de Prisma sobre Neon.

### 17. Modelos estándar de Auth.js en `schema.prisma`

**Problema:** Auth.js exige cuatro entidades (`User`, `Account`, `Session`,
`VerificationToken`) y el proyecto ya tenía un `User` propio con `clerkId`.

**Solución:** se amplió `User` en lugar de duplicarlo — que es imposible en
Prisma, que falla con *"There is already another model named User"*:

| Campo | Cambio | Motivo |
|---|---|---|
| `clerkId` | `String` → `String?` | El adaptador crea usuarios sin Clerk |
| `email` | `String` → `String?` | El estándar de Auth.js lo deja anulable |
| `emailVerified`, `image` | nuevos | Exigidos por el adaptador |
| `accounts[]`, `sessions[]` | nuevos | Relaciones con los modelos de sesión |
| `passwordHash` | nuevo | Hash del proveedor Credentials (extensión propia) |

Se añadieron `Account` (clave compuesta `@@id([provider, providerAccountId])`),
`Session` (`sessionToken @unique`) y `VerificationToken`
(`@@id([identifier, token])`), con los campos exactos del esquema oficial.

**Impacto en los datos:** relajar `NOT NULL` no destruye nada. Tras
`npx prisma db push`, la base de Neon quedó con las 3 tablas nuevas y los
3 usuarios existentes intactos.

### 18. El adaptador no puede resolverse al importar

**Problema:** `NextAuth(config)` se ejecuta al importar la ruta API. Si el
config trajera `PrismaAdapter(getPrisma())`, el build exigiría `DATABASE_URL`
aunque nadie tocara la base — exactamente el fallo que ya había quebrado la CI
(ver `fix/lazy-prisma-client`).

**Solución:** `createLazyAdapter()` devuelve un `Proxy` que construye el
adaptador real en el **primer método invocado**, es decir, en el primer request
autentico:

```typescript
return new Proxy({} as Adapter, {
  get(_target, property) {
    const adapter = (instance ??= PrismaAdapter(getPrisma()));
    const value = Reflect.get(adapter, property) as unknown;
    return typeof value === 'function' ? value.bind(adapter) : value;
  },
});
```

**Verificado:** el build corre completo **sin `.env.local` ni `.env`**, igual
que en GitHub Actions.

### 19. Credentials con `node:crypto` (sin dependencias nuevas)

`src/lib/credentials.ts` has y verifica passwords con **scrypt** (RFC 7914) en
lugar de bcrypt/argon2: mismo nivel de garantía sin sumar paquetes nativos,
algo que `AGENT.md` §5 prohibía sin confirmación previa.

Formato `scrypt$cost$salt$hash`. `verifyPassword` **nunca lanza**: un hash
corrupto o con un coste manipulado devuelve `false` en vez de consumir CPU o
tumbar el login.

**Aprendizaje:** separar `authorizeCredentials` y `parseCredentials` como
funciones exportadas permitió probar el flujo de login en el entorno `node` de
Vitest, sin necesitar base de datos ni renderizar React.

### 20. Bug real detectado en la verificación E2E: bucle de redirecciones

**Síntoma:** `GET /api/auth/signin` respondía `302 → 302 → 302` para siempre y
nunca se veía el formulario.

**Causa:** la configuración declaraba `pages: { signIn: '/api/auth/signin' }`.
En `@auth/core/lib/pages/index.js`, `render.signin()` hace:

```javascript
if (pages?.signIn) return { redirect: `${pages.signIn}?callbackUrl=...` };
// ...si no, renderiza el formulario
```

Es decir: **si defines `pages.signIn`, Auth.js redirige en lugar de renderizar**.
Apuntarlo a la propia ruta crea un bucle infinito.

**Solución:** eliminar la clave `pages`. Sin ella, Auth.js sirve su formulario
por defecto en `/api/auth/signin` (ahora `200` con CSRF + campos email/password).

**Aprendizaje:** los tests unitarios pasaban (la configuración *existía*, solo
que era incorrecta). El bucle solo apareció al probar la ruta con `curl`. Esto
es lo que aporta una verificación de extremo a extremo.

### 21. Navegación con Login/Logout

- `src/app/layout.tsx`: barra de navegación (`nav`) con marca, enlace al
  Dashboard y `AuthButton`.
- `src/app/Providers.tsx`: `SessionProvider` en un Client Component. El layout
  sigue siendo un Server Component y **no** llama a `await auth()`, porque eso
  obligaría a `AUTH_SECRET` durante `next build` y rompería el job de CI.
- `src/components/features/AuthButton.tsx`: botón según `useSession()`, con la
  lógica de presentación extraída a `src/lib/auth-action.ts` para poder testearla.
- `src/types/next-auth.d.ts`: amplía `Session` con `user.id` y `user.role`.

### 22. Verificaciones

| Verificación | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errores |
| `npm run lint` | ✅ 0 errores |
| `npm test` | ✅ **52 tests** (7 archivos) |
| `npm run build` (con `.env.local`) | ✅ `/api/auth/[...nextauth]` dinámica `ƒ` |
| `npx next build` **sin variables de entorno** | ✅ 0 errores (simula CI) |
| `npm audit --omit=dev --audit-level=high` | ✅ 0 vulnerabilidades |
| `npx prisma validate` / `generate` / `db push` | ✅ Neon sincronizada |
| E2E login correcto | ✅ sesión con `user.id` y `role: ADMIN` |
| E2E password incorrecto / usuario inexistente | ✅ `session: null` |
| E2E logout | ✅ `session: null` tras `POST /api/auth/signout` |
| E2E formulario `/api/auth/signin` | ✅ `200` con email + password + CSRF |

---

## 📌 Pendientes tras la Fase 5

| # | Tarea | Motivo |
|---|---|---|
| 1 | Registrar los modelos de Auth como migración (`prisma migrate dev`) | Se usó `db push` (lo pedido): la historia de migraciones quedó por detrás del esquema |
| 2 | Proveedores OAuth (GitHub/Google) | Requiere crear la app OAuth y definir `AUTH_GITHUB_*` |
| 3 | Página de login propia (`/login`) | Hoy se usa el formulario por defecto de Auth.js |
| 4 | **Autorización en `/api/chat`** | ~~Crítico: sigue sin comprobar quién pregunta~~ ✅ cerrado en la Fase 6 (`auth()` → `401` sin sesión) |
| 5 | Password reset / verificación de email | Auth.js lo soporta con `EmailProvider` y `VerificationToken` |

---

## 🔑 Conceptos introducidos en esta fase

| Concepto | Dónde apareció |
|---|---|
| **Adapter de Auth.js** | `PrismaAdapter` sobre los 4 modelos estándar |
| **Inicialización perezosa con Proxy** | `createLazyAdapter()` protege el build de CI |
| **Estrategia JWT vs database** | Credentials exige JWT; el adaptador persiste usuarios |
| **scrypt** | `src/lib/credentials.ts`, sin dependencias nativas nuevas |
| **Module augmentation** | `src/types/next-auth.d.ts` tipa `session.user` |
| **Verificación E2E** | El bucle de `pages.signIn` no lo detectaba ningún test unitario |

---

## 🟣 Fase 6 — Asistente RAG con pgvector (embeddings vectoriales)

**Contexto:** `POST /api/chat` "recuperaba" contexto con `documentChunk.findMany({ take: 3 })`,
es decir: los tres primeros fragmentos **al azar**, sin orden por relevancia, y los proyectos
y tareas no estaban indexados en ningún sitio. El chat no era RAG, era un volcado de tablas.

### 1. pgvector y la migración

**Solución:**

- `CREATE EXTENSION IF NOT EXISTS vector;` en la nueva migración
  `20261005212314_add_pgvector_embeddings` (pgvector **0.8.6** y PostgreSQL 18.6 en Neon).
- Índice **HNSW** sobre `"embedding" vector_cosine_ops`: la búsqueda por similitud
  coseno (`<=>`) no escanea la tabla.

**Problemas encontrados y cómo se resolvieron:**

| Problema | Causa | Solución |
|---|---|---|
| `P3006: syntax error at or near "﻿"` | La migración `init` tenía un **BOM UTF-8** al inicio | Se reescribió el archivo sin BOM (contenido idéntico) |
| `migrate dev` exige TTY interactivo | Shell no interactiva | `prisma migrate diff --from-schema-datamodel old --to-schema-datamodel new --script` y `prisma migrate deploy` |

### 2. Modelo `Embedding` con `Unsupported("vector(1536)")`

Prisma 5 **no tiene tipo `vector` nativo**, así que la columna se declara como tipo
nativo no soportado. Consecuencia: Prisma Client **nunca** toca esa columna y todo
acceso al vector pasa por SQL crudo **parametrizado** (`$1`, `$2`, ...), sin inyección SQL.

- `@@unique([entityType, entityId])` → el upsert es `ON CONFLICT`, re-indexar no duplica.
- `projectId` denormalizado → el filtro por proyecto usa índice en la búsqueda coseno.
- `title` → el texto que se cita en la respuesta del asistente.

### 3. `src/lib/embeddings.ts`

| Función | Qué hace |
|---|---|
| `generateEmbedding(texto)` | Vercel AI SDK (`embed`) + `text-embedding-3-small` (1536) |
| `upsertEmbedding(...)` | Serializa `[0.1,0.2,...]` y persiste con `ON CONFLICT` |
| `indexProject()` / `indexTask()` | **Nunca lanzan**: devuelven `false` si falla la IA |
| `similaritySearch()` | `<=>` (coseno), score `1 - distancia` recortado a [0,1] |
| `lexicalSearch()` | Respaldo `ILIKE` cuando no hay `OPENAI_API_KEY` |
| `deleteProjectEmbeddings()` | Limpieza de los vectores de un proyecto |

**Clave de diseño:** crear o actualizar una tarea **nunca** puede fallar por un problema
del proveedor de IA; la indexación se intenta y se informa con `indexed: boolean`.

### 4. Indexación en la escritura

- `POST /api/tasks` → `indexTask()` tras el `create` (responde `indexed`).
- `POST /api/projects` (nuevo) → crea el proyecto y lo indexa.
- `PATCH /api/projects/[id]` (nuevo) → actualiza y **re-indexa** (mismo `entityId`,
  el vector anterior se sobrescribe). Autoriza solo al propietario o a un `ADMIN` (403).

### 5. `POST /api/chat` con búsqueda coseno

1. **`auth()` de NextAuth → `401` sin sesión.** El chat devuelve contenido de
   proyectos y tareas, así que no puede ser público: se cierra aquí el punto 4
   de los pendientes de la Fase 5.
2. Validación con `chatRequestSchema` (Zod) → `400` si no cumple.
3. La última pregunta se embede y se busca por **coseno** en `Embedding`
   (con respaldo léxico si falta la credencial). Otro fallo de BD → `500`.
4. Los `DocumentChunk` del proyecto se anaden al contexto junto a los hits vectoriales.
5. `streamText` (`gpt-4o-mini`) redacta la respuesta con el *Guardrail of Truth*
   (contexto anclado + citación `[Fuente: ...]` + "si no está en el contexto, dilo").
6. La respuesta sale como **stream de texto plano** y las fuentes viajan en cabeceras
   (`X-RAG-Sources`, `X-RAG-Mode`, `X-RAG-Retrieval`): se envían **antes** de que
   empiece el streaming, que es exactamente lo que necesita el cliente.

**Sin `OPENAI_API_KEY` el chat no falla:** responde en modo `context` con el material
recuperado y las mismas cabeceras. Útil en local y en CI.

### 6. UI del chat (`ChatSidebar`)

- Lee el stream con `response.body.getReader()` y `TextDecoder` → respuesta **en tiempo real**.
- Estados separados: *Buscando fuentes en PostgreSQL* (hasta el primer chunk) y
  *Escribiendo* (durante el stream).
- Estado de error con botón **Reintentar** que reenvía el historial hasta el último usuario.
- Fuentes citadas como chips con su **score en %** y aviso cuando la respuesta es de tipo `context`.

### 7. Verificaciones

| Verificación | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errores |
| `npm run lint` | ✅ 0 errores |
| `npm test` | ✅ **125 tests** (13 archivos), 49 nuevos (3 son E2E y se saltan sin `DATABASE_URL`) |
| `npx prisma migrate deploy` | ✅ Neon sincronizada (tabla + HNSW) |
| E2E `embeddings-e2e.test.ts` | ✅ insert → re-index sin duplicar → coseno `1 - 0 = 1` → `ILIKE` → `DELETE` |
| `npm audit --omit=dev --audit-level=high` | ⚠️ 9 vulnerabilidades previas (dependencias ya existentes) |

### 📌 Pendientes tras la Fase 6

| # | Tarea | Motivo |
|---|---|---|
| 1 | Embeddings de `DocumentChunk` | El chunking existe, pero sus vectores no se generan: hoy la recuperación de documentos es léxica |
| 2 | Re-indexación en lote (`reindexProject`) | Migrar datos existentes sin re-crear cada proyecto/tarea |
| 3 | Botón *+ Nuevo Proyecto* del Dashboard | Ahora tiene `POST /api/projects`, pero el botón sigue sin formulario |
| 4 | Scoping de resultados por usuario | Hoy el chat exige sesión, pero un usuario autenticado ve todos los proyectos indexados |

### 🔑 Conceptos introducidos en esta fase

| Concepto | Dónde aparece |
|---|---|
| **pgvector / distancia coseno (`<=>`)** | Migración + `similaritySearch()` |
| **Índice HNSW** | `migration.sql` de la Fase 6 |
| **`Unsupported<T>` en Prisma** | `model Embedding` (SQL crudo parametrizado) |
| **Upsert con `ON CONFLICT`** | `upsertEmbedding()` |
| **Vercel AI SDK (`embed` / `streamText`)** | `src/lib/embeddings.ts` y `/api/chat` |
| **Respuesta en streaming + metadatos en cabeceras** | `createTextStreamResponse()` + `X-RAG-*` |
| **Modo degradado sin API key** | `lexicalSearch()` + `X-RAG-Mode: context` |

---

## 🟠 Fase 7 — Migración del RAG a Google Gemini (100 % gratuito)

**Problema:** el asistente RAG dependía de OpenAI (`text-embedding-3-small` +
`gpt-4o-mini`), de pago. Se migra a la capa gratuita de Google Gemini usando
`@ai-sdk/google`, manteniendo pgvector y **sin tocar el esquema de la base de
datos**.

**Rama:** `feature/rag-gemini-free` → todo vía Pull Request (nunca push directo
a `main`, `AGENT.md` §5).

### 1. Los dos modelos del enunciado ya estaban apagados

Comprobado antes de escribir una sola línea, en la tabla oficial de
deprecaciones de Google (<https://ai.google.dev/gemini-api/docs/deprecations>,
actualizada el 01/10/2026):

| Modelo pedido | Estado real (05/10/2026) | Sustituto aplicado |
|---|---|---|
| `text-embedding-004` | 🔴 **apagado el 14/01/2026** → `404 Not Found` en runtime | `gemini-embedding-2` |
| `gemini-2.0-flash` | 🟠 shutdown anunciado para el **01/06/2026** | `gemini-3.6-flash` |

Los dos sustitutos figuran como **"Free of charge"** (input y output) en la
tabla de precios de la Gemini Developer API, así que se cumple el requisito de
que la integración sea **100 % gratuita**.

### 2. La dimensión vectorial NO cambia (paso 4 del enunciado)

| Decisión | Por qué |
|---|---|
| Mantener `vector(1536)` | `gemini-embedding-2` devuelve 3072 por defecto, pero admite `outputDimensionality`; a 1536 el MTEB (68.17) es prácticamente igual que a 3072 |
| Cero migraciones SQL | Si se hubiera seguido `text-embedding-004` (768) haría falta `ALTER TABLE` de `vector(1536)` → `vector(768)`, **recrear el índice HNSW** y purgar las filas existentes: PostgreSQL no castea entre dimensiones |
| El test E2E no se toca | Usa `EMBEDDING_DIMENSIONS`, así que se adapta solo |
| `schema.prisma` solo cambia un comentario | El dato de la dimensión vive en el código, no en el modelo |

### 3. `reindexProject` y purga de huérfanos

La tabla `Embedding` estaba **vacía**: nunca hubo `OPENAI_API_KEY` en local,
así que `indexProject`/`indexTask` devolvieron siempre `indexed: false` y no
existía ni un vector que borrar de OpenAI. El riesgo real eran los
**vectores huérfanos**: no había ningún `DELETE` de proyectos o tareas que
limpiara sus embeddings.

- **`deleteOrphanEmbeddings(projectId?)`** — borra los vectores cuya entidad
  ya no existe (proyecto o tarea). Con `projectId` se acota al proyecto que se
  está re-indexando, así que aprovecha `@@index([projectId])` y no toca datos
  de otros usuarios.
- **`reindexProject(projectId)`** — purga → lee el proyecto y sus tareas →
  re-genera cada embedding. El upsert `ON CONFLICT` lo hace **idempotente**.
  Devuelve `ReindexResult` con contadores: a diferencia de `indexEntity()`,
  aquí los fallos del proveedor **no se ocultan**, porque quien pide un
  re-indexado necesita saber si algo falló.
- **`POST /api/projects/[id]/reindex`** — mismo esquema de autorización que
  el `PATCH`: sesión obligatoria (401), proyecto inexistente (404) y solo
  propietario o `ADMIN` (403).

**Ejecución real contra Neon (2 proyectos + 4 tareas):**

| Métrica | Valor |
|---|---|
| Vectores al empezar | **0** |
| Vectores al terminar | **6** |
| Proyectos re-indexados | 2 / 2 ✅ |
| Tareas re-indexadas | 4 / 4 ✅ |
| Huérfanos eliminados | 0 |
| Prueba: *"como funciona el chatbot RAG?"* | `Chatbot RAG interno` → **0.8035** |

Cierra el pendiente nº 2 de la Fase 6 (*"Re-indexación en lote"*).

### 4. Cambios por archivo

| Archivo | Cambio |
|---|---|
| `package.json` | `+ @ai-sdk/google@4.0.88`, `− @ai-sdk/openai` (quedó sin uso) |
| `src/lib/embeddings.ts` | `google.embeddingModel('gemini-embedding-2')` + `providerOptions: { google: { outputDimensionality: 1536 } }`; `hasOpenAiCredentials` → `hasGoogleCredentials`; `OPENAI_CREDENTIAL_ENV` → `GOOGLE_CREDENTIAL_ENV = 'GOOGLE_GENERATIVE_AI_API_KEY'`; **nuevos** `reindexProject()` y `deleteOrphanEmbeddings()` |
| `src/app/api/chat/route.ts` | `CHAT_MODEL_ID = 'gemini-3.6-flash'` y `google(CHAT_MODEL_ID)` en `streamText` |
| `src/app/api/projects/[id]/reindex/route.ts` | **Nuevo** endpoint `POST` de re-indexado |
| `src/lib/__tests__/embeddings.test.ts` | Mock de `@ai-sdk/google`, caso que fija `outputDimensionality: 1536` y **+8 tests** (purga y re-indexado) |
| `src/app/api/chat/__tests__/chat-route.test.ts` | Mock del provider callable y del fallback `context` |
| `src/app/api/projects/__tests__/projects-route.test.ts` | **+6 tests** del endpoint de re-indexado |
| `.env.example` | `OPENAI_API_KEY` → `GOOGLE_GENERATIVE_AI_API_KEY` con enlace a AI Studio |
| `spec.md`, `prisma/schema.prisma` (comentario) | Documentación del módulo IA & RAG |

### 5. Decisiones técnicas

| Decisión | Por qué |
|---|---|
| `embeddingModel()` y no `textEmbeddingModel()` | En `@ai-sdk/google@4` `textEmbeddingModel()` está **deprecado**: el alias sigue funcionando pero marca el camino a seguir |
| `GOOGLE_GENERATIVE_AI_API_KEY` como credencial | Es la variable que el provider lee **por defecto**: `createGoogle({ apiKey })` no hace falta en ninguna parte |
| `@ai-sdk/google@4.0.88` y no otra línea | Misma línea major que el `@ai-sdk/openai@4.0.84` que se quitó: peer `zod ^4.1.8` y `ProviderV4`, compatible con `ai@7.0.128` sin tocar el SDK |
| El degradado sin clave se conserva igual | Sin `GOOGLE_GENERATIVE_AI_API_KEY`, `/api/chat` sigue respondiendo en modo `context` (léxico + fuentes) en vez de 500 |
| Purgar **antes** de re-generar | Los vectores de entidades ya borradas no se sobrescriben (nadie los toca), así que se limpian primero; después el `ON CONFLICT` reemplaza los que sí tienen entidad viva |
| `$executeRaw` parametrizado en la purga | Nada de `$executeRawUnsafe`: el `projectId` viaja como `$1`, sin concatenar SQL |
| Scope acotado a la migración | Los prefijos de *task type* que Google recomienda para `gemini-embedding-2` (`task: search result \| query: ...`) se dejan como pendiente para no mezclar un cambio de calidad con uno de proveedor |

### 6. Verificaciones

| Verificación | Resultado |
|---|---|
| `npm run type-check` | ✅ 0 errores |
| `npm run lint` | ✅ 0 errores |
| `npm test` | ✅ **139 tests** (13 archivos), 14 nuevos |
| `npm run build` | ✅ rutas `/api/chat`, `/api/projects`, `/api/projects/[id]`, `/api/projects/[id]/reindex` y `/api/tasks` registradas |
| E2E `embeddings-e2e.test.ts` | ✅ 3 tests contra Neon (cast a `vector`, `ON CONFLICT`, coseno, `ILIKE`, `DELETE`) |
| SQL de la purga contra Postgres real | ✅ sentencias con alcance y global ejecutadas en Neon |
| Re-indexado real con Gemini | ✅ 6 vectores generados y recuperación coseno 0.8035 |

### 7. Pendientes tras la Fase 7

| # | Tarea | Motivo |
|---|---|---|
| 1 | Prefijos de *task type* en `generateEmbedding` | Google recomienda `task: search result \| query:` / `title: ... \| text:` para RAG asimétrico con `gemini-embedding-2` |
| 2 | Clave en **Vercel** | ✅ Hecho tras el merge de la Fase 7: `GOOGLE_GENERATIVE_AI_API_KEY`, `AUTH_SECRET` y `DATABASE_URL` están como *Secrets* de Vercel (Production + Preview) |
| 3 | Botón de re-indexado en el Dashboard | El endpoint existe y está probado, pero no hay UI que lo lance |
| 4 | Pendientes de la Fase 6 no abordados aquí | Embeddings de `DocumentChunk`, botón *+ Nuevo Proyecto*, scoping por usuario |

---

## 🎨 Fase 8 — Rediseño visual del frontend (UI/UX)

**Problema:** la interfaz tenía pinta de proyecto sin pulir: dos cabeceras
apiladas en el Dashboard, el chat con una altura fija de 600 px, sin página de
login propia y con la portada en HTML crudo. Y, sobre todo, **no se veía nada
de lo que se había escrito** (ver punto 1).

**Rama:** `feature/frontend-ui-redesign` → todo vía Pull Request, siguiendo el
`AGENT.md` §3 (*Modo Plan*): primero se presentó el plan con los tres alcances
abiertos (tema, portada y nombre de la ruta) y se esperó a la aprobación antes
de tocar un solo fichero.

### 1. 🚨 Hallazgo: Tailwind estaba instalado pero **nunca se conectó**

| Comprobación | Resultado |
|---|---|
| `tailwind.config.*` | ❌ no existía |
| `postcss.config.*` | ❌ no existía |
| Ficheros `.css` en todo el repo | ❌ **0** |
| CSS compilado en `.next/` | ❌ **0 bytes** |

`tailwindcss@3.4.1`, `autoprefixer` y `postcss` estaban en `devDependencies`,
y en `layout.tsx` ya se usaban `bg-slate-950`, `border-slate-800` y decenas de
clases más… que **no generaban una sola línea de CSS**. La aplicación se pintaba
con los estilos por defecto del navegador.

> Next.js no inventa la configuración PostCSS de Tailwind: sin
> `postcss.config.mjs` el plugin no se ejecuta. Cualquier "mejora de estilos"
> anterior a este punto era puro teatro.

**Solución (paso 0 obligatorio):** `postcss.config.mjs` + `tailwind.config.js`
+ `src/app/globals.css`, importado desde `layout.tsx`. Verificado con
`npm run build`: **0 → 22.232 bytes** de CSS con `.bg-canvas`,
`.gradient-brand`, `.skeleton`, `.text-gradient` y `.dark{`.

### 2. Sistema de tokens en lugar de colores crudos

Los colores se declaran como variables CSS con canales RGB **separados por
espacios** (no hex) para que Tailwind pueda componerlos con opacidad:

```css
--c-surface: 255 255 255;
```
```
bg-surface/70   →   rgb(255 255 255 / 0.7)
```

En `tailwind.config.js` se mapean con el marcador `<alpha-value>`, de forma que
`extend.colors` **añade** los alias sin borrar la paleta por defecto:

| Token | Uso |
|---|---|
| `canvas` | fondo de página |
| `surface` / `raised` | tarjetas / estados hover |
| `line` / `line-strong` | bordes |
| `ink` / `muted` | texto principal / secundario |
| `accent` (`strong`, `soft`) | marca |
| `ok` / `warn` / `danger` | estados de proyectos, tareas y errores |

Resultado: `grep` en `src/` de `slate-\d`, `indigo-\d` o `red-\d` → **0
coincidencias**. Un solo cambio en `globals.css` recolorea toda la aplicación.

### 3. Tema oscuro + claro con persistencia

El punto 2 del enunciado pedía *"tema oscuro/claro"*, así que se implementó
como **clase `.dark` en `<html>`** (`darkMode: 'class'`) y no con
`prefers-color-scheme`, para que el usuario pueda alternar y la elección
sobreviva a un recargue.

- `<html className="dark">` → el SSR siempre pinta oscuro (identidad actual).
- Un script **inline al inicio del `<body>`** aplica la elección guardada en
  `localStorage` antes del primer pintado: **sin destello blanco**.
- `suppressHydrationWarning` en `<html>` absorbe el cambio de clase respecto
  al HTML del servidor.
- `ThemeToggle` en la navegación; si `localStorage` está bloqueado, el tema
  queda en memoria y no se rompe nada.

### 4. Página de login `/login`

No existía: Auth.js servía su formulario genérico en `/api/auth/signin`.

| Archivo | Qué hace |
|---|---|
| `src/lib/auth-config.ts` | `pages: { signIn: '/login' }` → tanto el botón *Ingresar* como el proveedor Credentials aterrizan en la página propia |
| `src/app/login/page.tsx` | **Server Component** (para exportar `metadata`) con panel de marca |
| `src/app/login/LoginForm.tsx` | **Client Component** con la lógica |
| `src/lib/login-schema.ts` | Validación con Zod, patrón `*-schema.ts` del repo |

**Flujo:** validación local → `signIn('credentials', { redirect: false })` →
`router.push('/Dashboard')` solo si `error` viene vacío. Con `redirect: false`
el fallo se muestra **dentro de la propia página** en vez de saltar a la
página de error de Auth.js.

- Errores **por campo** (`aria-invalid`, `aria-describedby`, `role="alert"`).
- Durante la petición: campos bloqueados y botón con spinner (`aria-busy`), imposible enviar dos veces.
- Un único mensaje para usuario inexistente o contraseña mala: evita filtrar qué cuentas existen.
- Mostrar/ocultar contraseña con `aria-pressed`.

El **test que impedía `pages.signIn`** (`"apuntar a /api/auth/signin crea un
bucle"`) se reformuló: ahora exige `/login` y prohíbe explícitamente las rutas
internas de Auth.js, que sí crearían bucle. Y se añadió un test que **lee la
ruta del disco** para garantizar que `pages.signIn` siempre apunta a una
página que existe.

### 5. Skeletons de carga

| Fichero | Cuándo se ve |
|---|---|
| `src/components/ui/Skeleton.tsx` | Barra base + métrica, tarjeta de proyecto, fila de tarea y panel de chat |
| `src/app/Dashboard/loading.tsx` | Mientras App Router consulta Neon (`Suspense` automático de Next) |
| `ChatSidebar` | Barras animadas + *"Buscando fuentes similares en PostgreSQL…"* antes del primer chunk |

La regla `.skeleton` se define en `@layer components` **con `@apply`**, igual
que `.gradient-brand` y `.text-gradient`: en `globals.css` no hay una sola
regla escrita a mano (AGENT.md §5), todo pasa por utilities de Tailwind. El
barrido usa `animate-shimmer`, cuyos `keyframes` viven en
`theme.extend.keyframes`, y al estar en la capa `components` cualquier
`rounded-xl` de la utility lo sobreescribe sin luchar. Los esqueletos repiten
la rejilla del contenido real, así que **no hay salto** cuando llegan los
datos.

### 6. Responsive

| Antes | Después |
|---|---|
| Cabecera del `layout` + cabecera del Dashboard **apiladas** | Una sola cabecera global (`sticky`, `backdrop-blur`), la del Dashboard eliminada |
| Chat `h-[600px]` fijo | `h-[70vh] min-h-[420px]` en móvil → `lg:h-[640px]` en escritorio, y `lg:sticky` para que siga la lectura |
| Rejilla sin breakpoints | `grid-cols-1 lg:grid-cols-4` (contenido `lg:col-span-3` + chat) |
| Botones *Ingresar / Cerrar sesión* con tamaños fijos | Padding fijo `px-4 py-2` en los tres estados para que **no cambie de tamaño** al alternar sesión |
| Enlace *Dashboard* siempre visible | Oculto por debajo de `sm` (el menú de marca y los accesos siguen disponibles) |

Además: estados vacíos con borde discontinuo (proyectos y tareas), tarjetas con
`hover:-translate-y-0.5 hover:shadow-lift`, el botón *+ Nuevo Proyecto* pasa a
`disabled` con `title` explicativo en lugar de ser un botón muerto (sigue
pendiente el formulario, Fase 6), y el modal de *Nueva Tarea* gana
`max-h-[90vh] overflow-y-auto` para no salirse de la pantalla en móviles
pequeños.

### 7. Cambios por archivo

| Archivo | Cambio |
|---|---|
| `postcss.config.mjs`, `tailwind.config.js`, `src/app/globals.css` | **Nuevos** — puesta en marcha de Tailwind + tokens + gradientes + `.skeleton` |
| `src/app/layout.tsx` | Importa `globals.css`, script de tema, cabecera única responsive y `ThemeToggle` |
| `src/components/features/ThemeToggle.tsx` | **Nuevo** — alterna `.dark` y persiste en `localStorage` |
| `src/components/ui/Badge.tsx` | **Nuevo** — `Badge`, `StatusBadge`, `PriorityBadge` (traducción ES + tono) |
| `src/components/ui/Skeleton.tsx` | **Nuevo** — esqueletos reutilizables |
| `src/app/Dashboard/loading.tsx` | **Nuevo** — estado de carga de la ruta |
| `src/app/Dashboard/page.tsx` | Sin cabecera duplicada, métricas con iconos, tarjetas con `StatusBadge`/`PriorityBadge`, estados vacíos, `documentCount` real (`prisma.document.count()`) y `Promise.all` |
| `src/app/Dashboard/ChatSidebar.tsx` | Tokens semánticos, burbujas con avatar, skeleton de escritura, estado *Buscando/Escribiendo/Listo* y `<form>` para enviar con Enter |
| `src/app/login/page.tsx`, `LoginForm.tsx` | **Nuevos** — página y formulario de acceso |
| `src/lib/login-schema.ts` | **Nuevo** — esquema Zod + `validateLoginForm()` sin lanzar |
| `src/app/page.tsx` | Portada rediseñada (hero con `text-gradient`, 3 tarjetas, accesos) |
| `src/components/features/CreateTaskForm.tsx` | Tokens semánticos + modal desplazable |
| `src/lib/auth-action.ts` | Clases de los tres estados del botón de sesión |
| `src/lib/auth-config.ts` | `pages: { signIn: '/login' }` |
| `src/app/__tests__/app.test.tsx` | +3 tests (metadata y ruta de login) |
| `src/lib/__tests__/auth-config.test.ts` | Test de `pages.signIn` reformulado |
| `src/components/ui/__tests__/ui.test.tsx` | **Nuevo** — 8 tests del sistema de diseño |
| `src/lib/__tests__/login-schema.test.ts` | **Nuevo** — 8 tests de validación |

### 8. Decisiones técnicas

| Decisión | Por qué |
|---|---|
| Cablear Tailwind **antes** de nada | Sin CSS compilado, el resto de la fase no habría tenido ningún efecto visible |
| Variables RGB con `<alpha-value>` y no `dark:` por componente | 13 tokens cambian de tema; con `dark:` habría que duplicar cada clase de cada componente |
| `darkMode: 'class'` y no `prefers-color-scheme` | Requisito de alternar en caliente y persistir la elección |
| Fuentes del sistema, sin `next/font` | Cero dependencias y sin riesgo de fallo de build si Google Fonts no responde durante la compilación |
| `pages.signIn = '/login'` | Era la ruta que ya dejaba prevista el comentario de `auth-config.ts`; corta y sin segmentos anidados |
| `signIn(..., { redirect: false })` | El error de credenciales se pinta en el formulario, no en una página aparte |
| Lógica de validación en `src/lib/` y no en el componente | Patrón del repo: sin testing library se prueba llamando al módulo en entorno `node` |
| **Sin dependencias nuevas** | `lucide-react` ya estaba instalado (y sin usar) y aporta todos los iconos |
| Un único `.css`, todo con `@apply` | AGENT.md §5 prohíbe CSS a mano: gradientes y skeleton se componen con utilities, y los `keyframes` van en `theme.extend.keyframes` |
| Mantener `mock` de demostración en el Dashboard | No rompe el flujo existente cuando Neon no está accesible |

### 9. Verificaciones

| Verificación | Resultado |
|---|---|
| `npm run type-check` | ✅ 0 errores |
| `npm run lint` | ✅ 0 errores |
| `npm test` | ✅ **156 tests** (15 archivos), 17 nuevos |
| `npm run build` | ✅ nuevas rutas `/login` y `/Dashboard` con `loading.tsx` |
| CSS compilado | ✅ **22.232 bytes** (antes **0**) con tokens, `.dark`, `.skeleton` y `.gradient-brand` |
| HTML prerenderizado de `/login` | ✅ formulario con `login-email`, `login-password`, `aria-busy` y panel de marca |
| `grep` de colores crudos en `src/` | ✅ **0** coincidencias de `slate-*`, `indigo-*`, `red-*` |
| AGENT.md §5 (sin CSS a mano) | ✅ `globals.css` es el único `.css` y solo contiene `@tailwind`, variables de tema y bloques con `@apply` |

### 10. Pendientes tras la Fase 8

| # | Tarea | Motivo |
|---|---|---|
| 1 | Formulario de creación de proyectos | El botón existe pero está `disabled`; el endpoint `POST /api/projects` ya soporta alta (Fase 6) |
| 2 | Botón de re-indexado en la UI | El endpoint `POST /api/projects/[id]/reindex` está probado pero no tiene lanzador (pendiente nº 3 de la Fase 7) |
| 3 | Contraste AA verificado en herramienta como Lighthouse | Se han usado pares `ink`/`canvas` con ~15:1, pero falta la medición formal |
| 4 | Tests de interacción del formulario de login | No hay testing library instalada; la lógica está cubierta vía `login-schema.test.ts` |

### 💡 Conceptos introducidos en esta fase

| Concepto | Dónde |
|---|---|
| **PostCSS + Tailwind** | `postcss.config.mjs`, `tailwind.config.js` |
| **Design tokens en CSS variables** con `<alpha-value>` | `globals.css` + `tailwind.config.js` |
| **`darkMode: 'class'`** y anti-FOUC con script inline | `layout.tsx` |
| **`loading.tsx`** de App Router (carga con `Suspense` implícito) | `src/app/Dashboard/loading.tsx` |
| **`pages.signIn`** de Auth.js | `src/lib/auth-config.ts` |
| **Skeleton / shimmer** como componente reutilizable | `src/components/ui/Skeleton.tsx` |
| **Server Component + Client Component** separados para poder exportar `metadata` | `src/app/login/` |
