import type { Metadata } from 'next';
import { FolderKanban, ListTodo, Sparkles } from 'lucide-react';

import LoginForm from './LoginForm';

export const metadata: Metadata = {
  title: 'Iniciar sesión — AI Project Hub',
  description: 'Accede al Dashboard y al asistente RAG de AI Project Hub.',
};

/** Argumentos de venta del panel lateral. Solo se pintan en pantallas grandes. */
const HIGHLIGHTS = [
  {
    icon: FolderKanban,
    title: 'Proyectos y tareas en Neon',
    description: 'PostgreSQL con pgvector y estados sincronizados al instante.',
  },
  {
    icon: ListTodo,
    title: 'Prioridades y métricas',
    description: 'Lo importante de cada proyecto de un vistazo.',
  },
  {
    icon: Sparkles,
    title: 'Asistente RAG con Gemini',
    description: 'Respuestas con fuentes citadas y % de similitud, sin alucinar.',
  },
];

/**
 * Pagina de inicio de sesion.
 *
 * Server Component para poder exportar `metadata`; la logica del formulario
 * vive en `LoginForm.tsx`, que es un Client Component.
 *
 * @returns Panel de marca a la izquierda y tarjeta de acceso a la derecha.
 */
export default function LoginPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-center gap-10 px-4 py-10 sm:px-6 lg:flex-row lg:gap-16 lg:py-16">
      {/* Panel de marca: solo en escritorio */}
      <section className="hidden max-w-lg flex-1 lg:block">
        <span className="gradient-brand inline-flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-lift">
          AI
        </span>

        <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight">
          Todo tu producto, con un
          <span className="text-gradient"> copiloto que sí lee la documentación</span>.
        </h1>

        <p className="mt-4 text-base text-muted">
          Gestiona proyectos y tareas y pregunta por ellos en lenguaje natural:
          el asistente recupera el contexto de tu propia base de datos.
        </p>

        <ul className="mt-8 space-y-5">
          {HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
            <li key={title} className="flex items-start gap-3.5">
              <span
                aria-hidden="true"
                className="gradient-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-card"
              >
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-sm text-muted">{description}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <LoginForm />
    </div>
  );
}
