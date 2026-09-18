import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import {
  patchHelpdeskTicketCancelacion,
  HelpdeskApiError,
  HELPDESK_GENERIC_ERROR_MESSAGE,
} from '../../services/helpdeskApi'
import { HelpdeskCanceledBanner } from './HelpdeskCanceledBanner'

export function HelpdeskPanelCancelacion({
  ticketId,
  cancelado,
  canceladoMotivo,
  canceladoPor,
  onUpdated,
  embedded = false,
  embeddedInRiskZone = false,
}: {
  ticketId: string
  cancelado: boolean
  canceladoMotivo?: string | null
  canceladoPor?: string | null
  onUpdated: () => void
  embedded?: boolean
  embeddedInRiskZone?: boolean
}) {
  const [motivo, setMotivo] = useState(canceladoMotivo ?? '')
  const [busy, setBusy] = useState(false)

  const toggle = async (next: boolean) => {
    setBusy(true)
    try {
      await patchHelpdeskTicketCancelacion(ticketId, {
        cancelado: next,
        motivo: next ? motivo : undefined,
      })
      toast.success(next ? 'Proyecto marcado como cancelado' : 'Proyecto reactivado')
      onUpdated()
    } catch (err) {
      toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
    } finally {
      setBusy(false)
    }
  }

  const body = (
    <>
      {!embedded || embeddedInRiskZone ? (
        <>
          <h3 className="text-sm font-semibold text-heading">Cancelación del proyecto</h3>
          <p className="mt-1 text-xs text-body-muted">
            Independiente del flujo de análisis. Congela la línea de tiempo en el paso actual.
          </p>
        </>
      ) : null}

      {cancelado ? (
        <div className="mt-3">
          <HelpdeskCanceledBanner motivo={canceladoMotivo} canceladoPor={canceladoPor} />
        </div>
      ) : null}

      {!cancelado ? (
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-body-muted">
            Motivo (opcional)
            <textarea
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="input-brand-focus mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              data-testid="helpdesk-cancelacion-motivo"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void toggle(true)}
            className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-60 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
            data-testid="helpdesk-cancelar-proyecto"
          >
            {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null} Cancelar proyecto
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void toggle(false)}
            className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-brand-primary hover:bg-brand-tint/30 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
            data-testid="helpdesk-reactivar-proyecto"
          >
            {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null} Reactivar proyecto
          </button>
        </div>
      )}
    </>
  )

  if (embedded) {
    return (
      <div
        data-testid="helpdesk-cancelacion-section"
        className={
          embeddedInRiskZone
            ? undefined
            : 'mt-4 border-t border-neutral-100 pt-4 dark:border-zinc-800'
        }
      >
        {body}
      </div>
    )
  }

  return (
    <section
      className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5"
      data-testid="helpdesk-cancelacion-section"
    >
      {body}
    </section>
  )
}
