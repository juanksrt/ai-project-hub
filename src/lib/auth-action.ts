/**
 * Estado visible del boton de sesion en la navegacion.
 *
 * Se separa de los componentes para poder probarlo en el entorno `node` de
 * Vitest, sin renderizar React ni requerir el runtime de `next-auth/react`.
 */
export type AuthStatus = 'authenticated' | 'unauthenticated' | 'loading';

/** Accion que dispara el boton. */
export type AuthActionKind = 'signIn' | 'signOut' | 'none';

export interface AuthAction {
  /** Texto accesible del boton. */
  label: string;
  /** Que funcion de `next-auth/react` se invoca. */
  kind: AuthActionKind;
  /** Clases de Tailwind para el boton. */
  className: string;
}

const SIGNED_OUT: AuthAction = {
  label: 'Ingresar',
  kind: 'signIn',
  className:
    'rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-card transition hover:bg-accent-strong',
};

const SIGNED_IN: AuthAction = {
  label: 'Cerrar sesion',
  kind: 'signOut',
  className:
    'rounded-xl border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink shadow-card transition hover:bg-raised',
};

const LOADING: AuthAction = {
  label: 'Cargando...',
  kind: 'none',
  className: 'px-4 py-2 text-sm text-muted',
};

/**
 * Decide que debe mostrar la navegacion segun el estado de la sesion.
 *
 * @param status - Estado devuelto por `useSession()`.
 * @returns El label, la accion y los estilos del boton.
 */
export function resolveAuthAction(status: AuthStatus): AuthAction {
  switch (status) {
    case 'authenticated':
      return SIGNED_IN;
    case 'loading':
      return LOADING;
    case 'unauthenticated':
      return SIGNED_OUT;
    default:
      // Estado desconocido: no se arriesga a mostrar una accion de sesion.
      return { ...LOADING, label: 'Sin sesion' };
  }
}
