import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <h1>AI Project Hub</h1>
      <p>
        Plataforma de gestion de proyectos de IA con asistente RAG integrado.
      </p>
      <Link href="/Dashboard">Ir al Dashboard</Link>
    </main>
  );
}
