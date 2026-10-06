'use client';

import { Eye, EyeOff, Loader2, LockKeyhole, Mail, X } from 'lucide-react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  validateLoginForm,
  type LoginFieldErrors,
} from '@/lib/login-schema';

/**
 * Formulario de inicio de sesion.
 *
 * Secuencia:
 * 1. Validacion local con `validateLoginForm` (sin mandar nada al servidor).
 * 2. `signIn('credentials', { redirect: false })` para poder mostrar el error
 *    dentro de la propia pagina en vez de saltar a la pagina de error de Auth.js.
 * 3. Navegacion al Dashboard solo cuando `error` viene vacio.
 *
 * Mientras hay una peticion en vuelo los campos quedan bloqueados y el boton
 * muestra un spinner con `aria-busy`, de modo que no se puede enviar dos veces.
 */
export default function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /** Limpia el error del campo mientras el usuario escribe de nuevo. */
  function clearFieldError(field: 'email' | 'password'): void {
    setFieldErrors((previous) => {
      if (!previous[field]) return previous;

      const next = { ...previous };
      delete next[field];

      return next;
    });
    setFormError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const outcome = validateLoginForm({ email, password });

    if (!outcome.ok) {
      setFieldErrors(outcome.errors);
      setFormError(null);

      return;
    }

    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(true);

    try {
      const result = await signIn('credentials', {
        email: outcome.data.email,
        password: outcome.data.password,
        redirect: false,
      });

      if (result?.error) {
        // Auth.js no distingue entre usuario inexistente y password malo a
        // proposito: un unico mensaje evita filtrar cuales cuentas existen.
        setFormError('El correo o la contraseña no son correctos.');
        setIsSubmitting(false);

        return;
      }

      router.push('/Dashboard');
      router.refresh();
    } catch {
      setFormError('No se pudo contactar con el servidor. Inténtalo de nuevo.');
      setIsSubmitting(false);
    }
  }

  const emailError = fieldErrors.email;
  const passwordError = fieldErrors.password;

  return (
    <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-lift sm:p-8">
      <div className="mb-7">
        <span className="gradient-brand inline-flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-card lg:hidden">
          AI
        </span>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight lg:mt-0">
          Bienvenido de nuevo
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          Inicia sesión para entrar en tu Dashboard y consultar el asistente RAG.
        </p>
      </div>

      {formError && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger"
        >
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-danger text-white"
          >
            <X className="h-2.5 w-2.5" />
          </span>
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-4">
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium">
            Correo electrónico
          </label>
          <div className="relative">
            <Mail
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            />
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              disabled={isSubmitting}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                clearFieldError('email');
              }}
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? 'login-email-error' : undefined}
              placeholder="tu@correo.com"
              className={`w-full rounded-xl border bg-canvas py-2.5 pl-10 pr-3.5 text-sm text-ink placeholder:text-muted transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                emailError
                  ? 'border-danger focus:border-danger focus:ring-danger/25'
                  : 'border-line focus:border-accent focus:ring-accent/25'
              }`}
            />
          </div>
          {emailError && (
            <p id="login-email-error" className="mt-1.5 text-xs text-danger">
              {emailError}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium">
            Contraseña
          </label>
          <div className="relative">
            <LockKeyhole
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            />
            <input
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              disabled={isSubmitting}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                clearFieldError('password');
              }}
              aria-invalid={Boolean(passwordError)}
              aria-describedby={passwordError ? 'login-password-error' : undefined}
              placeholder="••••••••"
              className={`w-full rounded-xl border bg-canvas py-2.5 pl-10 pr-11 text-sm text-ink placeholder:text-muted transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                passwordError
                  ? 'border-danger focus:border-danger focus:ring-danger/25'
                  : 'border-line focus:border-accent focus:ring-accent/25'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((previous) => !previous)}
              disabled={isSubmitting}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={showPassword}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {passwordError && (
            <p id="login-password-error" className="mt-1.5 text-xs text-danger">
              {passwordError}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="gradient-brand mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-card transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/" className="font-medium text-accent transition hover:opacity-80">
          Volver al inicio
        </Link>
      </p>
    </div>
  );
}
