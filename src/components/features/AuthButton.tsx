'use client';

import { signIn, signOut, useSession } from 'next-auth/react';

import { resolveAuthAction } from '@/lib/auth-action';

/** Nombre visible junto al boton, para saber quien tiene la sesion abierta. */
function sessionLabel(name: string | null | undefined, email: string | null | undefined): string {
  return name ?? email ?? 'Tu cuenta';
}

/**
 * Boton de Login/Logout de la navegacion.
 *
 * Es un Client Component porque `useSession()` lee la sesion en el navegador;
 * el layout que lo contiene sigue siendo un Server Component.
 */
export default function AuthButton() {
  const { data: session, status } = useSession();

  const action = resolveAuthAction(status);

  async function handleClick(): Promise<void> {
    try {
      if (action.kind === 'signIn') {
        await signIn();
      } else if (action.kind === 'signOut') {
        await signOut({ redirectTo: '/' });
      }
    } catch (error) {
      console.error('[auth] Error al cambiar el estado de sesion:', error);
    }
  }

  if (status === 'authenticated' && session?.user) {
    return (
      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-slate-400 sm:inline">
          {sessionLabel(session.user.name, session.user.email)}
        </span>
        <button type="button" onClick={() => void handleClick()} className={action.className}>
          {action.label}
        </button>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => void handleClick()} className={action.className}>
      {action.label}
    </button>
  );
}
