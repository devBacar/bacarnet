import { ExternalLink, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import { HelpdeskProblematicaText } from './HelpdeskProblematicaText'
import {
  fetchAnalisisPendientes,
  patchAnalisisDecision,
  HelpdeskApiError,
  HELPDESK_GENERIC_ERROR_MESSAGE,
  type HelpdeskAnalisisPendienteItem,
} from '../../services/helpdeskApi'

export function AprobacionesPendientesPanel({
  onListEmpty,
  onItemDecided,
}: {
  onListEmpty?: () => void
  onItemDecided?: (item: HelpdeskAnalisisPendienteItem, remainingCount: number) => void
}) {
  const { user } = useAuth()
  const [items, setItems] = useState<HelpdeskAnalisisPendienteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAnalisisPendientes()
      setItems(data.items)
      return data.items
    } catch (err) {
      toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
      return null
    } finally {
      setLoading(false)
    }
  }, [onListEmpty])

  useEffect(() => {
    if (!user) return
    void load()
  }, [user, load])

  const decide = async (
    item: HelpdeskAnalisisPendienteItem,
    decision: 'aprobado' | 'rechazado',
  ) => {
    const key = `${item.ticketId}:${item.analisisId}`
    setBusyId(key)
    try {
      await patchAnalisisDecision(item.ticketId, item.analisisId, {
        decision,
        comentario: comments[key]?.trim() || undefined,
      })
      toast.success(decision === 'aprobado' ? 'Análisis aprobado' : 'Análisis rechazado')
      const data = await fetchAnalisisPendientes()
      setItems(data.items)
      const remaining = data.items.length
      onItemDecided?.(item, remaining)
      if (remaining === 0) onListEmpty?.()
    } catch (err) {
      toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10 text-body-muted">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-body-muted" data-testid="aprobaciones-pendientes-empty">
        No tenés análisis pendientes.
      </p>
    )
  }

  return (
    <ul className="space-y-4" data-testid="aprobaciones-pendientes-list">
      {items.map((item) => {
        const key = `${item.ticketId}:${item.analisisId}`
        const busy = busyId === key
        return (
          <li
            key={key}
            className="rounded-xl border border-neutral-200 bg-neutral-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-950/50 sm:p-5"
            data-testid="aprobacion-pendiente-item"
          >
            <h2 className="text-lg font-semibold text-heading">{item.ticket.areaNombre}</h2>
            <p className="mt-1 text-xs text-body-muted">
              Ticket {item.ticketId} · Subido por {item.analisis.subidoPorNombre}
            </p>
            <div className="mt-2">
              <HelpdeskProblematicaText text={item.ticket.problematica} />
            </div>
            <a
              href={item.analisis.archivoDriveLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-primary hover:underline"
            >
              Abrir documento en Drive
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-body-muted">
              Comentario (opcional)
              <textarea
                rows={2}
                value={comments[key] ?? ''}
                onChange={(e) => setComments((prev) => ({ ...prev, [key]: e.target.value }))}
                className="input-brand-focus mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide(item, 'aprobado')}
                className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
                data-testid="aprobacion-aprobar"
              >
                Aprobar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide(item, 'rechazado')}
                className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-red-300"
                data-testid="aprobacion-rechazar"
              >
                Rechazar
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
