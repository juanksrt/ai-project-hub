import {
  Skeleton,
  SkeletonChat,
  SkeletonMetric,
  SkeletonProjectCard,
  SkeletonTaskRow,
} from '@/components/ui/Skeleton';

/**
 * Estado de carga de `/Dashboard`.
 *
 * App Router lo monta automaticamente como `Suspense` de la pagina, asi que
 * se ve mientras el Server Component consulta Neon y desaparece sin salto
 * cuando llegan los datos: la rejilla del esqueleto es la misma que la del
 * contenido real.
 *
 * @returns Esqueleto con la estructura definitiva del Dashboard.
 */
export default function DashboardLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Cargando el Dashboard"
      className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6"
    >
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-56 rounded-md" />
        <Skeleton className="h-3.5 w-80 max-w-[70vw] rounded-md" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="space-y-6 lg:col-span-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SkeletonMetric />
            <SkeletonMetric />
            <SkeletonMetric />
          </div>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-44 rounded-md" />
              <Skeleton className="h-9 w-36 rounded-xl" />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SkeletonProjectCard />
              <SkeletonProjectCard />
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <Skeleton className="mb-4 h-5 w-44 rounded-md" />
            <div className="space-y-3">
              <SkeletonTaskRow />
              <SkeletonTaskRow />
              <SkeletonTaskRow />
            </div>
          </section>
        </div>

        <SkeletonChat />
      </div>
    </div>
  );
}
