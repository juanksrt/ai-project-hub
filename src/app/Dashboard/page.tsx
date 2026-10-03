import React from 'react';
import { prisma } from '@/lib/prisma';
import ChatSidebar from './ChatSidebar';

// Mock data fallbacks for server component demo
const MOCK_PROJECTS = [
  {
    id: '1',
    name: 'Lanzamiento SaaS IA',
    description: 'Plataforma con RAG y gestión de tareas en tiempo real',
    status: 'ACTIVE',
    taskCount: 12,
    docCount: 3,
  },
  {
    id: '2',
    name: 'E-commerce Redesign',
    description: 'Migración a Next.js App Router y Tailwind CSS',
    status: 'ACTIVE',
    taskCount: 8,
    docCount: 5,
  },
];

const MOCK_TASKS = [
  {
    id: 't1',
    title: 'Configurar esquema de Prisma con extensión Vector',
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
    title: 'Diseñar interfaz con Shadcn UI y Tailwind',
    status: 'PENDING',
    priority: 'MEDIUM',
    projectName: 'E-commerce Redesign',
  },
];

export default async function DashboardPage() {
  // Intentar cargar proyectos reales de la DB si existen
  let projects = MOCK_PROJECTS;
  let tasks = MOCK_TASKS;

  try {
    const dbProjects = await prisma.project.findMany({
      include: { tasks: true, documents: true },
      take: 5,
    });
    if (dbProjects.length > 0) {
      projects = dbProjects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description || '',
        status: p.status,
        taskCount: p.tasks.length,
        docCount: p.documents.length,
      }));
    }
  } catch (error) {
    // Si la DB aún no está conectada, usa el fallback seguro
    console.log('Servidor en modo demo con datos simulados');
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header Principal */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white">
            AI
          </div>
          <h1 className="text-xl font-bold tracking-tight">AI Project Hub</h1>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-slate-400">Rol: Administrador</span>
          <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-medium">
            US
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 p-6 max-w-7xl mx-auto w-full">
        {/* Columna Izquierda: Proyectos y Tareas (3 cols) */}
        <main className="lg:col-span-3 space-y-6">
          {/* Métricas Rápidas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <p className="text-sm font-medium text-slate-400">Proyectos Activos</p>
              <p className="text-2xl font-bold mt-1 text-white">{projects.length}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <p className="text-sm font-medium text-slate-400">Tareas Pendientes</p>
              <p className="text-2xl font-bold mt-1 text-indigo-400">
                {tasks.filter((t) => t.status !== 'COMPLETED').length}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <p className="text-sm font-medium text-slate-400">Documentos Indexados (RAG)</p>
              <p className="text-2xl font-bold mt-1 text-emerald-400">8</p>
            </div>
          </div>

          {/* Sección de Proyectos */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Proyectos Recientes</h2>
              <button className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition">
                + Nuevo Proyecto
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="p-5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition"
                >
                  <div className="flex justify-between items-start">
                    <h3 className="font-semibold text-indigo-300">{project.name}</h3>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                      {project.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-2 line-clamp-2">
                    {project.description}
                  </p>
                  <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between text-xs text-slate-500">
                    <span>{project.taskCount} Tareas</span>
                    <span>{project.docCount} Docs RAG</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Lista de Tareas */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
            <h2 className="text-lg font-semibold mb-4">Tareas Prioritarias</h2>
            <div className="space-y-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-850"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        task.status === 'COMPLETED'
                          ? 'bg-emerald-500'
                          : task.status === 'IN_PROGRESS'
                          ? 'bg-amber-500'
                          : 'bg-slate-600'
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium">{task.title}</p>
                      <p className="text-xs text-slate-500">{task.projectName}</p>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-mono ${
                      task.priority === 'HIGH'
                        ? 'bg-red-950 text-red-400 border border-red-900'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {task.priority}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* Columna Derecha: Asistente RAG Integrado (1 col) */}
        <ChatSidebar />
      </div>
    </div>
  );
}
