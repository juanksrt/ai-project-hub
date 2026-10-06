import Link from 'next/link';
import { ArrowRight, FolderKanban, ListTodo, Sparkles } from 'lucide-react';

/** Propuesta de valor de la portada. */
const FEATURES = [
  {
    icon: FolderKanban,
    title: 'Proyectos y tareas',
    description:
      'Estados, prioridades y métricas sincronizados con Neon (PostgreSQL) en tiempo real.',
  },
  {
    icon: Sparkles,
    title: 'Asistente RAG con Gemini',
    description:
      'Pregunta en lenguaje natural y obtén respuestas con las fuentes citadas y su % de similitud.',
  },
  {
    icon: ListTodo,
    title: 'Sin alucinaciones',
    description:
      'Las respuestas salen de tus propios datos vectorizados en pgvector, no de la memoria del modelo.',
  },
];

/**
 * Portada publica del proyecto.
 *
 * La raiz es un `<main>` sin envoltorios: el test de `app.test.tsx` comprueba
 * exactamente eso, y a partir de ahi cada seccion se centra con su propio
 * contenedor.
 *
 * @returns Portada con propuesta de valor, caracteristicas y accesos.
 */
export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="gradient-brand pointer-events-none absolute inset-x-0 top-0 h-64 opacity-20 blur-3xl sm:h-80"
        />

        <div className="relative mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent ring-1 ring-inset ring-accent/20">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
            Gemini + pgvector · 100% gratuito
          </span>

          <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Gestiona tu producto y
            <span className="text-gradient"> pregúntale a tus datos</span>.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base text-muted sm:text-lg">
            AI Project Hub reúne proyectos, tareas y documentos en una sola vista, con un
            asistente RAG que responde citando la fuente exacta de la que sale cada respuesta.
          </p>

          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link
              href="/login"
              className="gradient-brand inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-card transition hover:opacity-95"
            >
              Empezar
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>

            <Link
              href="/Dashboard"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-5 py-3 text-sm font-semibold text-ink shadow-card transition hover:bg-raised"
            >
              Ver el Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Caracteristicas */}
      <section aria-labelledby="features-heading" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
        <h2 id="features-heading" className="sr-only">
          Qué incluye
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-2xl border border-line bg-surface p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
            >
              <span
                aria-hidden="true"
                className="gradient-brand flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-card"
              >
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-sm text-muted">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
