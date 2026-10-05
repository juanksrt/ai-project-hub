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
| 4 | **Autorización en `/api/chat`** | Crítico: sigue sin comprobar quién pregunta |
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
