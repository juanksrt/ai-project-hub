import { describe, expect, it } from 'vitest';

import { loginSchema, validateLoginForm } from '@/lib/login-schema';

describe('loginSchema', () => {
  it('acepta credenciales correctas y normaliza el correo', () => {
    const result = loginSchema.safeParse({
      email: '  ADMIN@Dev.XYZ  ',
      password: 'Admin1234!',
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.email).toBe('admin@dev.xyz');
      expect(result.data.password).toBe('Admin1234!');
    }
  });

  it('exige el correo y el password', () => {
    const result = loginSchema.safeParse({ email: '', password: '' });

    expect(result.success).toBe(false);

    if (!result.success) {
      const mensajes = result.error.issues.map((issue) => issue.message);

      expect(mensajes).toContain('Escribe tu correo electrónico');
      expect(mensajes).toContain('Escribe tu contraseña');
    }
  });

  it('rechaza un correo sin formato', () => {
    const result = loginSchema.safeParse({ email: 'no-es-un-correo', password: 'x' });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Ese correo no es válido');
    }
  });

  it('no recorta el password: un espacio inicial es parte de la clave', () => {
    const result = loginSchema.safeParse({ email: 'a@b.dev', password: ' clave ' });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.password).toBe(' clave ');
    }
  });
});

describe('validateLoginForm', () => {
  it('devuelve el payload normalizado cuando todo cuadra', () => {
    const outcome = validateLoginForm({ email: ' Juan@Hub.dev ', password: 'secret' });

    expect(outcome.ok).toBe(true);

    if (outcome.ok) {
      expect(outcome.data).toEqual({ email: 'juan@hub.dev', password: 'secret' });
    }
  });

  it('devuelve errores por campo en vez de lanzar', () => {
    const outcome = validateLoginForm({ email: 'mal', password: '' });

    expect(outcome.ok).toBe(false);

    if (!outcome.ok) {
      expect(outcome.errors.email).toBe('Ese correo no es válido');
      expect(outcome.errors.password).toBe('Escribe tu contraseña');
    }
  });

  it('trata los campos ausentes como vacios (formulario sin tocar)', () => {
    const outcome = validateLoginForm({});

    expect(outcome.ok).toBe(false);

    if (!outcome.ok) {
      expect(outcome.errors.email).toBe('Escribe tu correo electrónico');
      expect(outcome.errors.password).toBe('Escribe tu contraseña');
    }
  });

  it('solo reporta el primer error de cada campo', () => {
    const outcome = validateLoginForm({ email: '', password: '' });

    expect(outcome.ok).toBe(false);

    if (!outcome.ok) {
      expect(Object.keys(outcome.errors).sort()).toEqual(['email', 'password']);
      expect(Object.values(outcome.errors).every((value) => typeof value === 'string')).toBe(true);
    }
  });
});
