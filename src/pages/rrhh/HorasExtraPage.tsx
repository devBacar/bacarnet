import { BriefcaseBusiness } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { fetchRrhhEstado } from '../../services/rrhhApi'

/** RRHH · Horas extra. PR 1: solo conexión (ruta, permisos y API). El informe llega en los próximos PR. */
export function RrhhHorasExtraPage() {
  const estado = useQuery({
    queryKey: ['rrhh', 'estado'],
    queryFn: fetchRrhhEstado,
    staleTime: 60_000,
  })

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <BriefcaseBusiness className="h-6 w-6 shrink-0 text-[var(--color-primary)]" aria-hidden />
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-gray-100">RRHH · Horas extra</h1>
        </div>
        <p className="mt-3 text-sm text-neutral-600 dark:text-gray-400">
          En construcción. Acá va a estar el informe mensual de horas extra, vacaciones y licencias.
        </p>
        <p className="mt-4 text-xs text-neutral-500 dark:text-gray-500" role="status">
          {estado.isPending
            ? 'Verificando conexión con el servidor...'
            : estado.isError
              ? 'No se pudo conectar con el servidor de RRHH.'
              : 'Conexión con el servidor de RRHH: OK.'}
        </p>
      </div>
    </div>
  )
}
