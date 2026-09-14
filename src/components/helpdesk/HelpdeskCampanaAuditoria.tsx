import { useEffect, useMemo, useState } from 'react'
import { formatHelpdeskDateTime } from './helpdeskUi'
import {
  fetchCampanaAuditoria,
  HelpdeskApiError,
  type HelpdeskCampanaAuditoriaRow,
} from '../../services/helpdeskApi'

function sortByEnviadoDesc(rows: HelpdeskCampanaAuditoriaRow[]): HelpdeskCampanaAuditoriaRow[] {
  return [...rows].sort((a, b) => {
    const aTime = a.fecha_envio ? new Date(a.fecha_envio).getTime() : 0
    const bTime = b.fecha_envio ? new Date(b.fecha_envio).getTime() : 0
    return bTime - aTime
  })
}

function flagLabel(value: boolean | null, fecha: string | null): string {
  if (value === true) {
    const when = formatHelpdeskDateTime(fecha)
    return when === '—' ? 'Sí' : `Sí · ${when}`
  }
  if (value === false) return 'No'
  return '—'
}

export function HelpdeskCampanaAuditoria() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<HelpdeskCampanaAuditoriaRow[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchCampanaAuditoria()
        if (cancelled) return
        setRows(Array.isArray(data.rows) ? data.rows : [])
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof HelpdeskApiError
            ? err.message
            : 'No se pudo obtener el estado de la campaña, intentá de nuevo',
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const sorted = useMemo(() => sortByEnviadoDesc(rows), [rows])
  const total = sorted.length
  const responded = sorted.filter((row) => row.respondido === true).length

  return (
    <section
      className="space-y-4"
      data-testid="helpdesk-campana-auditoria"
      aria-labelledby="helpdesk-campana-auditoria-title"
    >
      <header className="space-y-1">
        <h2
          id="helpdesk-campana-auditoria-title"
          className="text-xl font-semibold tracking-tight text-heading"
        >
          Auditoría de campaña
        </h2>
        <p className="text-sm text-body-muted">
          {total === 0
            ? 'Sin filas de difusión para mostrar.'
            : `${responded} de ${total} áreas respondieron`}
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-body-muted">Cargando auditoría…</p>
      ) : error ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
          data-testid="helpdesk-campana-auditoria-error"
        >
          {error}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-neutral-200 text-xs font-semibold uppercase tracking-wide text-body-muted dark:border-zinc-800">
              <tr>
                <th className="px-4 py-3">Área</th>
                <th className="px-4 py-3">Jefe</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Enviado</th>
                <th className="px-4 py-3">Respondido</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, index) => (
                <tr
                  key={`${row.email ?? 'row'}-${index}`}
                  className="border-b border-neutral-100 last:border-0 dark:border-zinc-800"
                  data-testid="helpdesk-campana-auditoria-row"
                >
                  <td className="px-4 py-3 font-medium text-heading">{row.area ?? '—'}</td>
                  <td className="px-4 py-3 text-heading">{row.nombre ?? '—'}</td>
                  <td className="px-4 py-3 text-body-muted">{row.email ?? '—'}</td>
                  <td className="px-4 py-3 text-body-muted">{flagLabel(row.enviado, row.fecha_envio)}</td>
                  <td className="px-4 py-3 text-body-muted">
                    {flagLabel(row.respondido, row.fecha_respuesta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
