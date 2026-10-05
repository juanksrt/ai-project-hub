import { describe, expect, it } from 'vitest';

import { resolveAuthAction, type AuthStatus } from '@/lib/auth-action';

describe('resolveAuthAction', () => {
  it('ofrece Ingresar cuando no hay sesion', () => {
    const action = resolveAuthAction('unauthenticated');

    expect(action.kind).toBe('signIn');
    expect(action.label).toBe('Ingresar');
  });

  it('ofrece Cerrar sesion cuando hay sesion', () => {
    const action = resolveAuthAction('authenticated');

    expect(action.kind).toBe('signOut');
    expect(action.label).toBe('Cerrar sesion');
  });

  it('no ofrece ninguna accion mientras carga', () => {
    const action = resolveAuthAction('loading');

    expect(action.kind).toBe('none');
    expect(action.label).toBe('Cargando...');
  });

  it('ante un estado desconocido no arriesga una accion de sesion', () => {
    const action = resolveAuthAction('sorpresa' as AuthStatus);

    expect(action.kind).toBe('none');
    expect(action.label).toBe('Sin sesion');
  });

  it('cada estado tiene labels distintos para no confundir al usuario', () => {
    const labels = (['authenticated', 'unauthenticated', 'loading'] as const).map(
      (status) => resolveAuthAction(status).label,
    );

    expect(new Set(labels).size).toBe(labels.length);
  });
});
