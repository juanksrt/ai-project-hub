import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';

import Providers from '@/app/Providers';
import AuthButton from '@/components/features/AuthButton';
import ThemeToggle from '@/components/features/ThemeToggle';

import './globals.css';

export const metadata: Metadata = {
  title: 'AI Project Hub',
  description:
    'Plataforma de gestion de proyectos de IA con asistente RAG integrado.',
};

/**
 * Aplica el tema guardado antes del primer pintado.
 *
 * `<html>` se sirve con la clase `.dark` para que el SSR siempre pinte en
 * oscuro y no haya destello blanco; este script la sustituye por la eleccion
 * del usuario en cuanto empieza el `<body>`. `suppressHydrationWarning` en
 * `<html>` evita el aviso de desajuste de hidratacion por ese cambio.
 */
const THEME_SCRIPT = `
(function () {
  try {
    var stored = window.localStorage.getItem('theme');
    var dark = stored ? stored === 'dark' : true;
    document.documentElement.classList.toggle('dark', dark);
  } catch (error) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-canvas text-ink">
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />

        <Providers>
          <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-md">
            <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-5">
                <Link
                  href="/"
                  className="flex shrink-0 items-center gap-2.5 transition hover:opacity-90"
                >
                  <span
                    aria-hidden="true"
                    className="gradient-brand flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold text-white shadow-card"
                  >
                    AI
                  </span>
                  <span className="truncate text-sm font-semibold tracking-tight sm:text-base">
                    AI Project Hub
                  </span>
                </Link>

                <Link
                  href="/Dashboard"
                  className="hidden rounded-full px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-raised hover:text-ink sm:inline-flex"
                >
                  Dashboard
                </Link>
              </div>

              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                <ThemeToggle />
                <AuthButton />
              </div>
            </nav>
          </header>

          {children}
        </Providers>
      </body>
    </html>
  );
}
