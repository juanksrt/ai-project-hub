import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';

import Providers from '@/app/Providers';
import AuthButton from '@/components/features/AuthButton';

export const metadata: Metadata = {
  title: 'AI Project Hub',
  description:
    'Plataforma de gestion de proyectos de IA con asistente RAG integrado.',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <Providers>
          <nav className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-6 py-4">
            <div className="flex items-center gap-6">
              <Link href="/" className="text-lg font-bold tracking-tight">
                AI Project Hub
              </Link>
              <Link
                href="/Dashboard"
                className="text-sm text-slate-400 transition hover:text-white"
              >
                Dashboard
              </Link>
            </div>
            <AuthButton />
          </nav>
          {children}
        </Providers>
      </body>
    </html>
  );
}
