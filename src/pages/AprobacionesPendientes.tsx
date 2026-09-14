import { ExternalLink, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { HelpdeskProblematicaText } from '../components/helpdesk/HelpdeskProblematicaText'
import {
  fetchAnalisisPendientes,
  patchAnalisisDecision,
  HelpdeskApiError,
  HELPDESK_GENERIC_ERROR_MESSAGE,
  type HelpdeskAnalisisPendienteItem,
} from '../services/helpdeskApi'

export function AprobacionesPendientes() {
  const [items, setItems] = useState<HelpdeskAnalisisPendienteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAnalisisPendientes()
      setItems(data.items)
    } catch (err) {
      toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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
      await load()
    } catch (err) {
      toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6" data-testid="aprobaciones-pendientes-page">
      <h1 className="text-2xl font-semibold text-heading">Aprobaciones pendientes</h1>
      <p className="mt-2 text-sm text-body-muted">
        Documentos de análisis de proyectos a Sistemas que requieren tu decisión.
      </p>

      {loading ? (
        <div className="mt-10 flex justify-center text-body-muted">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        </div>
      ) : items.length === 0 ? (
        <p className="mt-10 text-center text-sm text-body-muted">No tenés análisis pendientes.</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {items.map((item) => {
            const key = `${item.ticketId}:${item.analisisId}`
            const busy = busyId === key
            return (
              <li
                key={key}
                className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
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
                    onChange={(e) =>
                      setComments((prev) => ({ ...prev, [key]: e.target.value }))
                    }
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
      )}
    </div>
  )
}
