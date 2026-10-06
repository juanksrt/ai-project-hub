/**
 * Esqueletos de carga.
 *
 * Pintan la forma final del contenido (misma rejilla, mismos anchos) para que
 * la pagina no salte cuando Neon responde. La animacion vive en la regla
 * `.skeleton` de `globals.css`.
 *
 * Todos los bloques llevan `aria-hidden`: el estado de carga se comunica por
 * la ruta `loading.tsx` de Next, no por el lector de pantalla.
 */

interface SkeletonProps {
  /** Clases de tamano/posicion (`h-4`, `w-40`, `flex-1`...). */
  className?: string;
}

/** Barra de texto basica. */
export function Skeleton({ className = '' }: SkeletonProps) {
  return <span aria-hidden="true" className={`skeleton block ${className}`} />;
}

/** Tarjeta de metrica: una etiqueta corta y una cifra grande. */
export function SkeletonMetric() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <Skeleton className="h-3 w-24 rounded-md" />
      <Skeleton className="mt-3 h-7 w-16 rounded-md" />
    </div>
  );
}

/** Tarjeta de proyecto: titulo, descripcion de dos lineas y pie con contadores. */
export function SkeletonProjectCard() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-4 w-2/5 rounded-md" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-3 w-full rounded-md" />
      <Skeleton className="mt-2 h-3 w-4/5 rounded-md" />
      <div className="mt-5 border-t border-line pt-4">
        <Skeleton className="h-3 w-1/2 rounded-md" />
      </div>
    </div>
  );
}

/** Fila de tarea: indicador, dos lineas de texto y una etiqueta. */
export function SkeletonTaskRow() {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-canvas p-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <Skeleton className="h-3 w-3 shrink-0 rounded-full" />
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-3 w-56 max-w-[55vw] rounded-md" />
          <Skeleton className="h-2.5 w-32 rounded-md" />
        </div>
      </div>
      <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
    </div>
  );
}

/** Bloque de panel lateral completo: cabecera, area de chat y composer. */
export function SkeletonChat() {
  return (
    <div className="flex h-[70vh] flex-col rounded-2xl border border-line bg-surface p-5 shadow-card lg:h-[640px]">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3.5 w-40 rounded-md" />
        </div>
        <Skeleton className="h-3 w-14 rounded-md" />
      </div>

      <div className="my-4 flex-1 space-y-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="ml-auto h-14 w-3/4 rounded-xl" />
        <Skeleton className="h-20 w-11/12 rounded-xl" />
      </div>

      <div className="flex gap-2 border-t border-line pt-4">
        <Skeleton className="h-10 flex-1 rounded-xl" />
        <Skeleton className="h-10 w-20 rounded-xl" />
      </div>
    </div>
  );
}
