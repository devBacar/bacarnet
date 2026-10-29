import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { fetchEstadoVientri, traerVientriAhora } from '../../services/finanzasVientriApi'

/**
 * "Traer datos de Vientri ahora": dispara la búsqueda en Drive y, si hay algo nuevo, la
 * importación sigue en segundo plano (puede tardar más de un minuto). El botón queda
 * en "Importando…" consultando /estado hasta que el candado se libera.
 */
export function BotonTraerVientri() {
  const qc = useQueryClient()
  const estadoQ = useQuery({
    queryKey: ['finanzas', 'vientri', 'estado'],
    queryFn: fetchEstadoVientri,
    refetchInterval: (query) => (query.state.data?.importando ? 5000 : false),
  })
  const traer = useMutation({
    mutationFn: traerVientriAhora,
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ['finanzas', 'vientri', 'estado'] })
      if (r.estado !== 'en_progreso') await qc.invalidateQueries({ queryKey: ['finanzas', 'vientri'] })
    },
  })
  const importando = estadoQ.data?.importando ?? false
  const eraImportando = useRef(false)
  useEffect(() => {
    if (eraImportando.current && !importando) void qc.invalidateQueries({ queryKey: ['finanzas', 'vientri'] })
    eraImportando.current = importando
  }, [importando, qc])
  const resultado = traer.data
  const color =
    traer.isError || resultado?.estado === 'error'
      ? 'text-red-800 dark:text-red-200'
      : resultado?.estado === 'en_progreso'
        ? 'text-neutral-700 dark:text-neutral-200'
        : resultado?.estado === 'sin_novedades'
          ? 'text-neutral-700 dark:text-neutral-200'
          : 'text-green-800 dark:text-green-200'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => traer.mutate()}
        disabled={traer.isPending || importando}
        className="rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
      >
        {traer.isPending ? 'Pidiendo…' : importando ? 'Importando datos de Vientri…' : 'Traer datos de Vientri ahora'}
      </button>
      {!importando && (resultado || traer.isError) && !traer.isPending && (
        <p role="status" className={`text-sm ${color}`}>
          {traer.isError ? (traer.error as Error).message : resultado?.mensaje}
        </p>
      )}
    </div>
  )
}
