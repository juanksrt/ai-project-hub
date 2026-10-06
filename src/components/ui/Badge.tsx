import type { ReactNode } from 'react';

/** Color con el que se pinta una etiqueta. */
export type BadgeTone = 'ok' | 'warn' | 'danger' | 'accent' | 'neutral';

/** Estilos por tono: fondo tenue + texto saturado, legible en ambos temas. */
const TONE_CLASSES: Record<BadgeTone, string> = {
  ok: 'bg-ok/10 text-ok ring-ok/20',
  warn: 'bg-warn/10 text-warn ring-warn/20',
  danger: 'bg-danger/10 text-danger ring-danger/20',
  accent: 'bg-accent-soft text-accent ring-accent/20',
  neutral: 'bg-raised text-muted ring-line-strong/40',
};

interface BadgeProps {
  /** Tono semantico. */
  tone?: BadgeTone;
  /** Texto visible. */
  children: ReactNode;
  /** Clases extra para posicionar la etiqueta. */
  className?: string;
}

/**
 * Etiqueta compacta para estados, prioridades y contadores.
 *
 * Es el unico sitio donde se decide como se ven esos conceptos, para que una
 * misma equivalencia (`COMPLETED` = verde) sea identica en el Dashboard, en
 * las tareas y en el chat.
 *
 * @param props - Tono, texto y clases extra.
 * @returns Elemento `<span>` redondeado con anillo del mismo tono.
 */
export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Estado de un proyecto (`ProjectStatus`). */
type ProjectStatusValue = 'ACTIVE' | 'ARCHIVED';

/** Estado de una tarea (`TaskStatus`). */
type TaskStatusValue = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

/** Prioridad de una tarea (`TaskPriority`). */
type PriorityValue = 'LOW' | 'MEDIUM' | 'HIGH';

/** Etiqueta en espanol de cada valor crudo del esquema. */
const STATUS_LABELS: Record<ProjectStatusValue | TaskStatusValue, string> = {
  ACTIVE: 'Activo',
  ARCHIVED: 'Archivado',
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completada',
};

/** Tono asociado a cada estado. */
const STATUS_TONES: Record<ProjectStatusValue | TaskStatusValue, BadgeTone> = {
  ACTIVE: 'ok',
  ARCHIVED: 'neutral',
  PENDING: 'neutral',
  IN_PROGRESS: 'warn',
  COMPLETED: 'ok',
};

/** Etiqueta en espanol de cada prioridad. */
const PRIORITY_LABELS: Record<PriorityValue, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
};

/** Tono asociado a cada prioridad. */
const PRIORITY_TONES: Record<PriorityValue, BadgeTone> = {
  LOW: 'neutral',
  MEDIUM: 'accent',
  HIGH: 'danger',
};

/**
 * Etiqueta de estado de proyecto o tarea.
 *
 * Los valores desconocidos (un enum que crezca en el futuro) se muestran tal
 * cual en tono neutro en vez de romper el render.
 *
 * @param props - `value` con el valor crudo del esquema.
 * @returns La etiqueta ya traducida y coloreada.
 */
export function StatusBadge({
  value,
  className,
}: {
  value: ProjectStatusValue | TaskStatusValue | string;
  className?: string;
}) {
  const known = value as keyof typeof STATUS_LABELS;
  const tone = STATUS_TONES[known] ?? 'neutral';
  const label = STATUS_LABELS[known] ?? value;

  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  );
}

/**
 * Etiqueta de prioridad de una tarea.
 *
 * @param props - `value` con el valor crudo del esquema.
 * @returns La prioridad traducida y coloreada.
 */
export function PriorityBadge({
  value,
  className,
}: {
  value: PriorityValue | string;
  className?: string;
}) {
  const known = value as keyof typeof PRIORITY_LABELS;
  const tone = PRIORITY_TONES[known] ?? 'neutral';
  const label = PRIORITY_LABELS[known] ?? value;

  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  );
}
