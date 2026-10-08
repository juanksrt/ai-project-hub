import { FileStack, FolderKanban, ListTodo, Plus } from 'lucide-react';

import CreateTaskForm from '@/components/features/CreateTaskForm';
import { PriorityBadge, StatusBadge } from '@/components/ui/Badge';
import { getPrisma } from '@/lib/prisma';

import ChatSidebar from './ChatSidebar';

/** Proyecto listo para pintar con datos reales de la base de datos. */
interface ProjectView {
  id: string;
  name: string;
  description: string;
  status: string;
  taskCount: number;
  docCount: number;
}

/** Tarea reciente listo para pintar con datos reales de la base de datos. */
interface TaskView {
  id: string;
  title: string;
  status: string;
  priority: string;
  projectName: string;
}

/** Indicador circular junto al titulo de cada tarea. */
function taskDotClass(status: string): string {
  if (status === 'COMPLETED') return 'bg-ok';
  if (status === 'IN_PROGRESS') return 'bg-warn';

  return 'bg-line-strong';
}

/**
 * Dashboard de AI Project Hub.
 *
 * Server Component: consulta Neon en el propio request. Solo se pintan datos
 * reales: si la base de datos no responde o no hay registros, se muestran los
 * estados vacios de cada seccion y el badge de conexion lo indica, en lugar de
 * servir datos de demostracion. Mientras responde se pinta `loading.tsx`, que
 * replica exactamente esta misma rejilla.
 *
 * @returns Vista completa: metricas, proyectos, tareas y el chat lateral.
 */
export default async function DashboardPage() {
  let projects: ProjectView[] = [];
  let tasks: TaskView[] = [];
  let documentCount = 0;
  let dbOnline = false;

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

    projects = dbProjects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description ?? '',
      status: project.status,
      taskCount: project.tasks.length,
      docCount: project.documents.length,
    }));

    tasks = dbTasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      projectName: task.project.name,
    }));

    documentCount = dbDocuments;
    dbOnline = true;
  } catch (error) {
    // Sin conexion no se inventan datos: se sirven los estados vacios y el
    // badge de cabecera avisa de que el Dashboard no esta sincronizado.
    console.error('Dashboard: no se pudo consultar la base de datos:', error);
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
      hint: tasks.length > 0 ? `de ${tasks.length} tareas recientes` : 'sin tareas todavia',
      icon: ListTodo,
    },
    {
      label: 'Documentos indexados',
      value: documentCount,
      hint: documentCount > 0 ? 'Vectorizados para el RAG' : 'sin documentos todavia',
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
        <span
          className={`inline-flex w-fit items-center gap-1.5 self-start rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset sm:self-auto ${
            dbOnline
              ? 'bg-accent-soft text-accent ring-accent/20'
              : 'bg-warn/10 text-warn ring-warn/30'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${dbOnline ? 'bg-accent' : 'bg-warn'}`}
            aria-hidden="true"
          />
          {dbOnline ? 'Sincronizado con Neon' : 'Sin conexión con Neon'}
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
