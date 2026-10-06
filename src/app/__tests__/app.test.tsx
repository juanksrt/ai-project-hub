import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { metadata } from '@/app/layout';
import LoginPage, { metadata as loginMetadata } from '@/app/login/page';
import HomePage from '@/app/page';
import { authConfig } from '@/lib/auth-config';

describe('layout', () => {
  it('expone metadata con title y description', () => {
    expect(metadata.title).toBe('AI Project Hub');
    expect(metadata.description).toBeTruthy();
  });
});

describe('HomePage', () => {
  it('se renderiza sin lanzar errores', () => {
    const arbol = HomePage();

    expect(arbol).toBeTruthy();
    expect(arbol.type).toBe('main');
  });
});

describe('LoginPage', () => {
  it('declara su propio titulo de pestana', () => {
    expect(loginMetadata.title).toBe('Iniciar sesión — AI Project Hub');
    expect(loginMetadata.description).toBeTruthy();
  });

  it('se renderiza con el panel de marca', () => {
    const arbol = LoginPage();

    expect(arbol).toBeTruthy();
    // Texto propio de la portada del login (el formulario es un Client
    // Component y no se materializa al invocar el Server Component directamente).
    expect(JSON.stringify(arbol)).toContain('copiloto que sí lee la documentación');
  });

  it('existe la ruta a la que apunta pages.signIn de Auth.js', () => {
    // Si se cambiara pages.signIn sin crear la pagina, Auth.js redirigiria a
    // una 404 y no habria forma de entrar. Comprobacion barata y completa.
    const destino = authConfig.pages?.signIn;

    expect(destino).toBe('/login');

    const ruta = fileURLToPath(new URL(`..${destino}/page.tsx`, import.meta.url));

    expect(() => readFileSync(ruta, 'utf8')).not.toThrow();
  });
});
