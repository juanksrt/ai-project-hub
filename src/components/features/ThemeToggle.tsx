'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

/** Tema activo. El predeterminado es oscuro. */
type Theme = 'dark' | 'light';

/** Clave donde se persiste la eleccion del usuario. */
const STORAGE_KEY = 'theme';

/**
 * Lee el tema ya aplicado en `<html>`.
 *
 * Se consulta el DOM y no `localStorage` para que el boton nunca muestre un
 * estado que contradiga lo que el usuario esta viendo, por muy raro que
 * quede la persistencia.
 *
 * @returns El tema vigente; oscuro si algo falla.
 */
function readTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';

  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * Boton de alternancia claro/oscuro de la navegacion.
 *
 * Escribe la clase `.dark` en `<html>` (que es lo que recogen las variables de
 * `globals.css`) y guarda la eleccion en `localStorage`. El script que se
 * inyecta en el `layout` aplica esa eleccion antes del primer pintado, asi
 * que aqui solo hace falta mantener el estado en sincronia.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  // Tras la hidratacion se adopta lo que el script del layout ya aplico.
  useEffect(() => {
    setTheme(readTheme());
  }, []);

  function handleToggle(): void {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';

    document.documentElement.classList.toggle('dark', next === 'dark');

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Modo privado o almacenamiento bloqueado: el tema queda solo en memoria.
    }

    setTheme(next);
  }

  const nextLabel = theme === 'dark' ? 'claro' : 'oscuro';

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={`Cambiar al tema ${nextLabel}`}
      title={`Cambiar al tema ${nextLabel}`}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-card transition hover:border-line-strong hover:text-ink"
    >
      {theme === 'dark' ? (
        <Sun aria-hidden="true" className="h-4 w-4" />
      ) : (
        <Moon aria-hidden="true" className="h-4 w-4" />
      )}
    </button>
  );
}
