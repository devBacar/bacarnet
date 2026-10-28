import { useMutation, useQueryClient } from '@tanstack/react-query'
import { traerVientriAhora } from '../../services/finanzasVientriApi'

/**
 * "Traer datos de Vientri ahora": busca en Drive la última copia y la importa si es nueva.
 * Los datos se actualizan solos cada mañana; esto es para cuando no se quiere esperar.
 */
export function BotonTraerVientri() {
  const qc = useQueryClient()
  const traer = useMutation({
    mutationFn: traerVientriAhora,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['finanzas', 'vientri'] })
    },
  })
  const resultado = traer.data
  const color =
    traer.isError || resultado?.estado === 'error'
      ? 'text-red-800 dark:text-red-200'
      : resultado?.estado === 'importado'
        ? 'text-green-800 dark:text-green-200'
        : 'text-neutral-700 dark:text-neutral-200'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => traer.mutate()}
        disabled={traer.isPending}
        className="rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
      >
        {traer.isPending ? 'Trayendo datos de Vientri…' : 'Traer datos de Vientri ahora'}
      </button>
      {(resultado || traer.isError) && !traer.isPending && (
        <p role="status" className={`text-sm ${color}`}>
          {traer.isError ? (traer.error as Error).message : resultado?.mensaje}
        </p>
      )}
    </div>
  )
}
