import { describe, expect, it } from 'vitest';

import { metadata } from '@/app/layout';
import HomePage from '@/app/page';

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
