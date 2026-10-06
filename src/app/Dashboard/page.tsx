import { FileStack, FolderKanban, ListTodo, Plus } from 'lucide-react';

import CreateTaskForm from '@/components/features/CreateTaskForm';
import { PriorityBadge, StatusBadge } from '@/components/ui/Badge';
import { getPrisma } from '@/lib/prisma';

import ChatSidebar from './ChatSidebar';

/** Proyecto listo para pintar (real o de demostracion). */
interface ProjectView {
  id: string;
  name: string;
  description: string;
  status: string;
  taskCount: number;
  docCount: number;
}

/** Tarea reciente listo para pintar. */
interface TaskView {
  id: string;
  title: string;
  status: string;
  priority: string;
  projectName: string;
}

// Datos de demostracion para cuando Neon no esta conectada.
const MOCK_PROJECTS: ProjectView[] = [
  {
    id: '1',
    name: 'Lanzamiento SaaS IA',
    description: 'Plataforma con RAG y gestion de tareas en tiempo real',
    status: 'ACTIVE',
    taskCount: 12,
    docCount: 3,
  },
  {
    id: '2',
    name: 'E-commerce Redesign',
    description: 'Migracion a Next.js App Router y Tailwind CSS',
    status: 'ACTIVE',
    taskCount: 8,
    docCount: 5,
  },
];

const MOCK_TASKS: TaskView[] = [
  {
    id: 't1',
    title: 'Configurar esquema de Prisma con extension Vector',
    status: 'COMPLETED',
    priority: 'HIGH',
    projectName: 'Lanzamiento SaaS IA',
  },
  {
    id: 't2',
    title: 'Crear pipeline de RAG con Vercel AI SDK',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    projectName: 'Lanzamiento SaaS IA',
  },
  {
    id: 't3',
    title: 'Disenar interfaz con Tailwind CSS',
    status: 'PENDING',
    priority: 'MEDIUM',
    projectName: 'E-commerce Redesign',
  },
];

/** Indicador circular junto al titulo de cada tarea. */
function taskDotClass(status: string): string {
  if (status === 'COMPLETED') return 'bg-ok';
  if (status === 'IN_PROGRESS') return 'bg-warn';

  return 'bg-line-strong';
}

/**
 * Dashboard de AI Project Hub.
 *
 * Server Component: consulta Neon en el propio request y, si la base de datos
 * no esta disponible, cae a los datos de demostracion. Mientras responde se
 * pinta `loading.tsx`, que replica exactamente esta misma rejilla.
 *
 * @returns Vista completa: metricas, proyectos, tareas y el chat lateral.
 */
export default async function DashboardPage() {
  let projects: ProjectView[] = MOCK_PROJECTS;
  let tasks: TaskView[] = MOCK_TASKS;
  let documentCount = MOCK_PROJECTS.reduce(
    (total, project) => total + project.docCount,
    0,
  );

  try {
    const prisma = getPrisma();

    const [dbProjects, dbTasks, dbDocuments] = await Promise.all([
      prisma.project.findMany({
        include: { tasks: true, documents: true },
        take: 5,
      }),
      prisma.task.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { project: { select: { name: true } } },
      }),
      prisma.document.count(),
    ]);

    if (dbProjects.length > 0) {
      projects = dbProjects.map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description ?? '',
        status: project.status,
        taskCount: project.tasks.length,
        docCount: project.documents.length,
      }));
    }

    if (dbTasks.length > 0) {
      tasks = dbTasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        projectName: task.project.name,
      }));
    }

    documentCount = dbDocuments;
  } catch {
    // Sin conexion a Neon se sirve la vista de demostracion.
    console.log('Dashboard en modo demo: no se pudo consultar la base de datos');
  }

  const metrics = [
    {
      label: 'Proyectos',
      value: projects.length,
      hint: `${projects.filter((project) => project.status === 'ACTIVE').length} activos`,
      icon: FolderKanban,
    },
    {
      label: 'Tareas pendientes',
      value: tasks.filter((task) => task.status !== 'COMPLETED').length,
      hint: `de ${tasks.length} tareas recientes`,
      icon: ListTodo,
    },
    {
      label: 'Documentos indexados',
      value: documentCount,
      hint: 'Vectorizados para el RAG',
      icon: FileStack,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted">
            Tus proyectos, tareas y el asistente RAG en una sola vista.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 self-start rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent ring-1 ring-inset ring-accent/20 sm:self-auto">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          Sincronizado con Neon
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <main className="space-y-6 lg:col-span-3">
          {/* Metricas */}
          <section aria-label="Metricas generales" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {metrics.map(({ label, value, hint, icon: Icon }) => (
              <div
                key={label}
                className="rounded-2xl border border-line bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-muted">{label}</p>
                  <span
                    aria-hidden="true"
                    className="gradient-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-card"
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
                  {value}
                </p>
                <p className="mt-1 text-xs text-muted">{hint}</p>
              </div>
            ))}
          </section>

          {/* Proyectos */}
          <section aria-labelledby="projects-heading" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="projects-heading" className="text-lg font-semibold tracking-tight">
                  Proyectos recientes
                </h2>
                <p className="text-sm text-muted">
                  Cada proyecto y sus tareas quedan indexados en pgvector.
                </p>
              </div>
              <button
                type="button"
                disabled
                title="Proximamente: todavia no hay formulario de creacion de proyectos"
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-sm font-medium text-white shadow-card transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nuevo proyecto
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {projects.map((project) => (
                <article
                  key={project.id}
                  className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card transition hover:border-line-strong hover:shadow-lift"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="gradient-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-card"
                      >
                        <FolderKanban className="h-4 w-4" />
                      </span>
                      <h3 className="truncate font-semibold tracking-tight">{project.name}</h3>
                    </div>
                    <StatusBadge value={project.status} />
                  </div>

                  <p className="mt-3 line-clamp-2 text-sm text-muted">
                    {project.description || 'Sin descripcion todavía.'}
                  </p>

                  <div className="mt-4 flex items-center justify-between border-t border-line pt-4 text-xs text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <ListTodo className="h-3.5 w-3.5" aria-hidden="true" />
                      {project.taskCount} tareas
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <FileStack className="h-3.5 w-3.5" aria-hidden="true" />
                      {project.docCount} docs
                    </span>
                  </div>
                </article>
              ))}

              {projects.length === 0 && (
                <div className="col-span-full rounded-2xl border border-dashed border-line-strong bg-surface p-8 text-center">
                  <p className="font-medium">Todavía no hay proyectos</p>
                  <p className="mt-1 text-sm text-muted">
                    Crea el primero para empezar a indexar documentos.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Tareas */}
          <section aria-labelledby="tasks-heading" className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="tasks-heading" className="text-lg font-semibold tracking-tight">
                  Tareas prioritarias
                </h2>
                <p className="text-sm text-muted">Últimas tareas de todos los proyectos.</p>
              </div>
              <CreateTaskForm projects={projects.map(({ id, name }) => ({ id, name }))} />
            </div>

            <ul className="space-y-3">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-canvas p-3.5 transition hover:border-line-strong hover:bg-raised"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${taskDotClass(task.status)}`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <p className="truncate text-xs text-muted">{task.projectName}</p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden sm:block">
                      <StatusBadge value={task.status} />
                    </span>
                    <PriorityBadge value={task.priority} />
                  </div>
                </li>
              ))}

              {tasks.length === 0 && (
                <li className="rounded-xl border border-dashed border-line-strong bg-canvas p-6 text-center text-sm text-muted">
                  Ninguna tarea todavía. Crea la primera con el formulario de arriba.
                </li>
              )}
            </ul>
          </section>
        </main>

        {/* Asistente RAG */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <ChatSidebar />
        </div>
      </div>
    </div>
  );
}
