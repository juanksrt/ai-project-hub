'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import {
  TASK_DESCRIPTION_MAX,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TITLE_MAX,
  type TaskFieldErrors,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/task-schema';

/** Proyecto minimo que necesita el selector del formulario. */
export interface TaskFormProject {
  id: string;
  name: string;
}

/** Props del formulario de creacion de tareas. */
interface CreateTaskFormProps {
  /** Proyectos disponibles para vincular la tarea. */
  projects: TaskFormProject[];
}

/** Cuerpo de error que devuelve `POST /api/tasks`. */
interface CreateTaskApiError {
  error?: string;
  fieldErrors?: TaskFieldErrors;
}

/** Forma minima del cuerpo de exito (201) que devuelve `POST /api/tasks`. */
interface CreateTaskSuccessResponse {
  task: { id: string };
}

/** Estado inicial del formulario: PENDING + MEDIUM, igual que los defaults de Prisma. */
const INITIAL_STATUS: TaskStatus = 'PENDING';
const INITIAL_PRIORITY: TaskPriority = 'MEDIUM';

/**
 * Etiquetas en espanol de cada estado.
 *
 * El tipo `Record<TaskStatus, string>` es exhaustivo: si se anade un estado al
 * schema (y a Prisma) TypeScript obliga a declarar su traduccion aqui.
 */
const STATUS_LABELS: Record<TaskStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En progreso',
  COMPLETED: 'Completada',
};

/** Etiquetas en espanol de cada prioridad. Igual de exhaustiva que `STATUS_LABELS`. */
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
};

/**
 * Traduce el status HTTP de `POST /api/tasks` a un mensaje accionable.
 *
 * La API devuelve textos tecnicos (`No autenticado`, `Error interno al crear
 * la tarea`) que en el modal no le dicen nada a la persona usuaria. El 401
 * siempre se traduce porque exige una accion concreta (volver a entrar); el
 * resto respeta el mensaje del servidor si lo hay.
 *
 * @param status - Codigo HTTP de la respuesta.
 * @param serverMessage - `error` devuelto por la API, si venia en el cuerpo.
 * @returns Mensaje listo para pintar dentro del modal.
 */
function messageForHttpError(status: number, serverMessage?: string): string {
  if (status === 401) {
    return 'Tu sesión no está activa. Inicia sesión de nuevo para crear la tarea.';
  }

  if (serverMessage) {
    return serverMessage;
  }

  if (status >= 500) {
    return 'El servidor tuvo un problema al crear la tarea. Intenta de nuevo en unos segundos.';
  }

  return 'No se pudo crear la tarea. Revisa los datos e inténtalo de nuevo.';
}

/**
 * Interpreta un cuerpo de error JSON.
 *
 * @param payload - Cuerpo leido de la respuesta.
 * @returns El cuerpo como error, o `null` si no es un objeto JSON.
 */
function readApiError(payload: unknown): CreateTaskApiError | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  return payload as CreateTaskApiError;
}

/**
 * Comprueba que la respuesta confirma la tarea creada.
 *
 * Sin esta guarda, un 2xx sin JSON de tarea (p.ej. el HTML que devuelve un
 * proxy o un error de red disfrazado) cerraria el modal en silencio sin haber
 * creado nada.
 *
 * @param payload - Cuerpo leido de la respuesta.
 * @returns `true` si el cuerpo trae el `task.id` del 201.
 */
function isCreateTaskSuccess(payload: unknown): payload is CreateTaskSuccessResponse {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const task = (payload as Partial<CreateTaskSuccessResponse>).task;

  return typeof task?.id === 'string';
}

/**
 * Boton + modal para crear una tarea desde el Dashboard.
 *
 * Es un Client Component: el modal, el estado del formulario y la peticion
 * `fetch` exigen hooks del navegador, por eso declara `'use client'`.
 * La validacion de verdad vive en el servidor (`POST /api/tasks` con Zod); aqui
 * solo se pintan los `fieldErrors` devueltos por la API.
 *
 * @param props - Proyectos a mostrar en el selector.
 */
export default function CreateTaskForm({ projects }: CreateTaskFormProps) {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(INITIAL_STATUS);
  const [priority, setPriority] = useState<TaskPriority>(INITIAL_PRIORITY);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<TaskFieldErrors>({});

  // Cierra el modal con la tecla Escape mientras este abierto.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const resetForm = (): void => {
    setTitle('');
    setDescription('');
    setStatus(INITIAL_STATUS);
    setPriority(INITIAL_PRIORITY);
    setProjectId(projects[0]?.id ?? '');
    setFormError(null);
    setFieldErrors({});
  };

  const openModal = (): void => {
    resetForm();
    setIsOpen(true);
  };

  const closeModal = (): void => {
    setIsOpen(false);
  };

  /** Primer mensaje de validacion de un campo, si lo hay. */
  const errorFor = (field: string): string | undefined => fieldErrors[field]?.[0];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, status, priority, projectId }),
      });

      let payload: unknown = null;

      try {
        payload = await response.json();
      } catch {
        // Respuesta sin cuerpo JSON: se maneja con el mensaje generico.
        payload = null;
      }

      if (!response.ok) {
        // El modal permanece abierto mostrando el motivo (401/400/404/500).
        const body = readApiError(payload);

        setFormError(messageForHttpError(response.status, body?.error));
        setFieldErrors(body?.fieldErrors ?? {});
        return;
      }

      // Un 2xx que no trae la tarea creada no debe cerrar el modal en
      // silencio: se informa del fallo y se conservan los datos escritos.
      if (!isCreateTaskSuccess(payload)) {
        setFormError(
          'El servidor no confirmó la creación de la tarea. Comprueba tu conexión y vuelve a intentarlo.',
        );
        return;
      }

      closeModal();
      resetForm();
      // Refresca los Server Components del Dashboard para ver la tarea nueva.
      router.refresh();
    } catch (error) {
      console.error('Error al crear la tarea:', error);
      setFormError('No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClasses = (field: string): string =>
    `w-full rounded-xl border bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-muted outline-none transition focus:ring-2 ${
      errorFor(field)
        ? 'border-danger focus:ring-danger/25'
        : 'border-line focus:border-accent focus:ring-accent/25'
    }`;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-sm font-medium text-white shadow-card transition hover:bg-accent-strong"
      >
        + Nueva Tarea
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay: clic fuera cierra el modal */}
          <button
            type="button"
            aria-label="Cerrar formulario"
            onClick={closeModal}
            className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-task-heading"
            className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-lift"
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 id="create-task-heading" className="text-lg font-semibold text-ink">
                  Nueva Tarea
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Se asignara a tu usuario activo.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Cerrar"
                className="rounded-lg px-2 py-1 text-muted transition hover:bg-raised hover:text-ink"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Titulo */}
              <div>
                <label htmlFor="task-title" className="mb-1.5 block text-sm font-medium text-ink">
                  Título *
                </label>
                <input
                  id="task-title"
                  name="title"
                  type="text"
                  required
                  maxLength={TASK_TITLE_MAX}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  aria-invalid={Boolean(errorFor('title'))}
                  placeholder="Ej. Configurar pipeline de embeddings"
                  className={inputClasses('title')}
                />
                {errorFor('title') && (
                  <p className="mt-1 text-xs text-danger">{errorFor('title')}</p>
                )}
              </div>

              {/* Descripcion */}
              <div>
                <label
                  htmlFor="task-description"
                  className="mb-1.5 block text-sm font-medium text-ink"
                >
                  Descripción
                </label>
                <textarea
                  id="task-description"
                  name="description"
                  rows={3}
                  maxLength={TASK_DESCRIPTION_MAX}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  aria-invalid={Boolean(errorFor('description'))}
                  placeholder="Detalles, criterios de aceptación, enlaces..."
                  className={`${inputClasses('description')} resize-y`}
                />
                {errorFor('description') && (
                  <p className="mt-1 text-xs text-danger">{errorFor('description')}</p>
                )}
              </div>

              {/* Estado y prioridad */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="task-status" className="mb-1.5 block text-sm font-medium text-ink">
                    Estado
                  </label>
                  <select
                    id="task-status"
                    name="status"
                    value={status}
                    onChange={(event) => setStatus(event.target.value as TaskStatus)}
                    aria-invalid={Boolean(errorFor('status'))}
                    className={inputClasses('status')}
                  >
                    {TASK_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {STATUS_LABELS[value]}
                      </option>
                    ))}
                  </select>
                  {errorFor('status') && (
                    <p className="mt-1 text-xs text-danger">{errorFor('status')}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="task-priority" className="mb-1.5 block text-sm font-medium text-ink">
                    Prioridad
                  </label>
                  <select
                    id="task-priority"
                    name="priority"
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as TaskPriority)}
                    aria-invalid={Boolean(errorFor('priority'))}
                    className={inputClasses('priority')}
                  >
                    {TASK_PRIORITIES.map((value) => (
                      <option key={value} value={value}>
                        {PRIORITY_LABELS[value]}
                      </option>
                    ))}
                  </select>
                  {errorFor('priority') && (
                    <p className="mt-1 text-xs text-danger">{errorFor('priority')}</p>
                  )}
                </div>
              </div>

              {/* Proyecto */}
              <div>
                <label htmlFor="task-project" className="mb-1.5 block text-sm font-medium text-ink">
                  Proyecto *
                </label>
                <select
                  id="task-project"
                  name="projectId"
                  required
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  aria-invalid={Boolean(errorFor('projectId'))}
                  className={inputClasses('projectId')}
                >
                  <option value="" disabled>
                    Selecciona un proyecto
                  </option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                {errorFor('projectId') && (
                  <p className="mt-1 text-xs text-danger">{errorFor('projectId')}</p>
                )}
              </div>

              {/* Error general del servidor */}
              {formError && (
                <p
                  role="alert"
                  className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
                >
                  {formError}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-xl border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink shadow-card transition hover:bg-raised"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-card transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? 'Creando...' : 'Crear tarea'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
