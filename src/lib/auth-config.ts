/**
 * Configuracion de NextAuth.js (Auth.js v5).
 *
 * Este modulo NO depende de `next/auth` en tiempo de ejecucion (solo como
 * tipo), para que los tests puedan importarlo en el entorno `node` de Vitest
 * sin arrastrar el runtime de Next.js. La inicializacion de NextAuth vive en
 * `src/auth.ts`.
 */

import type { Adapter } from '@auth/core/adapters';
import type { NextAuthConfig, Session, User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import type { Role } from '@prisma/client';

import { PrismaAdapter } from '@auth/prisma-adapter';
import Credentials from 'next-auth/providers/credentials';

import { verifyPassword } from '@/lib/credentials';
import { getPrisma } from '@/lib/prisma';

/** Campos que envia el formulario de login del proveedor Credentials. */
export interface CredentialsPayload {
  email: string;
  password: string;
}

/** Usuario que devuelve el `authorize`, con el rol de este proyecto. */
export interface AuthorizedUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  role: Role;
}

/**
 * Adaptador de Prisma con inicializacion perezosa.
 *
 * `NextAuth(config)` se ejecuta al importar la ruta API. Si aqui se llamara a
 * `PrismaAdapter(getPrisma())`, el build de Next exigiria `DATABASE_URL`
 * aunque nadie toque la base de datos, y el job de CI (que no define variables
 * de entorno) fallaria: exactamente el problema que ya se corrigio con el
 * singleton perezoso de `src/lib/prisma.ts`.
 *
 * El Proxy resuelve el adaptador real en el primer metodo invocado, es decir,
 * en el primer request autentico.
 *
 * @returns Un `Adapter` que construye el adaptador real bajo demanda.
 */
export function createLazyAdapter(): Adapter {
  let instance: Adapter | undefined;

  return new Proxy({} as Adapter, {
    get(_target, property) {
      const adapter = (instance ??= PrismaAdapter(getPrisma()));
      const value = Reflect.get(adapter, property) as unknown;

      return typeof value === 'function' ? value.bind(adapter) : value;
    },
  });
}

/**
 * Extrae y normaliza los campos del formulario de login.
 *
 * @param credentials - Credenciales crudas que entrega Auth.js.
 * @returns Los campos ya normalizados, o `null` si falta alguno.
 *
 * @remarks Devuelve `null` en lugar de lanzar para que Auth.js responda con
 * el error generico de credenciales invalidas y no filtre informacion.
 */
export function parseCredentials(
  credentials: Partial<Record<string, unknown>> | undefined,
): CredentialsPayload | null {
  if (!credentials) return null;

  const { email, password } = credentials;

  if (typeof email !== 'string' || typeof password !== 'string') return null;

  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedEmail.length === 0 || password.length === 0) return null;

  return { email: normalizedEmail, password };
}

/**
 * Verifica un login de email + password contra la tabla `User`.
 *
 * Es el `authorize` del proveedor Credentials. Nunca lanza: cualquier fallo
 * (payload invalido, base de datos caida, hash corrupto) se traduce en `null`,
 * que Auth.js interpreta como "credenciales invalidas" sin filtrar detalles.
 *
 * @param credentials - Credenciales crudas que entrega Auth.js.
 * @returns El usuario para crear la sesion, o `null` si no se puede autenticar.
 */
export async function authorizeCredentials(
  credentials: Partial<Record<string, unknown>> | undefined,
): Promise<AuthorizedUser | null> {
  const payload = parseCredentials(credentials);

  if (!payload) return null;

  try {
    const user = await getPrisma().user.findUnique({
      where: { email: payload.email },
    });

    // Usuarios creados por OAuth todavia no tienen passwordHash.
    if (!user?.passwordHash) return null;

    if (!verifyPassword(payload.password, user.passwordHash)) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: user.role,
    };
  } catch (error) {
    // Nunca se propaga el error al cliente: solo se rechaza el login.
    console.error('[auth] Error al verificar credenciales:', error);
    return null;
  }
}

/**
 * Copia el id y el rol del token JWT a la sesion (callback `session`).
 *
 * Se extrae aqui para poder probar la logica sin construir los parametros
 * completos que exige el tipo del callback de Auth.js.
 *
 * @param session - Sesion que va a recibir el cliente.
 * @param token - Token JWT decodificado de la peticion.
 * @returns La misma sesion, con el usuario identificado.
 */
export function sessionWithToken(session: Session, token: JWT): Session {
  if (session.user) {
    session.user.id = token.sub ?? session.user.id;

    if (token.role) {
      session.user.role = token.role;
    }
  }

  return session;
}

/**
 * Guarda el rol del usuario en el token JWT cuando se inicia sesion
 * (callback `jwt`), para que la sesion no tenga que consultar la base de
 * datos en cada request.
 *
 * @param token - Token que se va a firmar.
 * @param user - Usuario devuelto por `authorize` o por el adaptador.
 * @returns El mismo token, con el rol cargado.
 */
export function tokenWithRole(token: JWT, user: User | null | undefined): JWT {
  if (user) {
    token.role = user.role;
  }

  return token;
}

export const authConfig: NextAuthConfig = {
  // El adaptador se resuelve perezosamente: ver createLazyAdapter().
  adapter: createLazyAdapter(),

  // Con el proveedor Credentials, Auth.js exige sesiones JWT (el adaptador no
  // crea sesiones en base de datos para este proveedor). El adaptador sigue
  // siendo el encargado de persistir usuarios y cuentas cuando se agregue un
  // proveedor OAuth.
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  },

  // Pagina propia de inicio de sesion. Sin esta clave, `signIn()` (el boton de
  // la navegacion) redirige al formulario generico de Auth.js servido en
  // `/api/auth/signin`, que no encaja con el resto de la interfaz. Al declarar
  // `/login`, tanto ese boton como el propio proveedor Credentials aterrizan
  // en la vista disenada para el proyecto.
  pages: {
    signIn: '/login',
  },

  providers: [
    Credentials({
      id: 'credentials',
      name: 'Email y password',
      credentials: {
        email: { label: 'Correo', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: authorizeCredentials,
    }),
  ],

  // No se declara `pages.signIn`: si apunta a /api/auth/signin Auth.js entra
  // en un bucle de redirecciones (redirige a pages.signIn en vez de renderizar
  // su propia pagina). Sin esta clave, Auth.js sirve el formulario por defecto
  // en /api/auth/signin. Para una pagina propia, basta con apuntar a /login.
  callbacks: {
    jwt: ({ token, user }) => tokenWithRole(token, user),
    session: ({ session, token }) => sessionWithToken(session, token),
  },
};
