import { FileText, Pencil } from 'lucide-react'
import { HELPDESK_REUNION_TIPO_INICIAL } from '../../constants/helpdeskReunion'
import type { HelpdeskTicketDetail } from '../../services/helpdeskApi'
import { formatHelpdeskDateTime } from './helpdeskUi'
import {
  minutaInicialCompleta,
  minutaSimpleFromDiagnostico,
  minutaSimpleSummary,
} from './helpdeskMinutaSimple'
import { legacyMinutaSummary } from './MisProyectosMinutaDisclosure'

type Reunion = HelpdeskTicketDetail['reuniones'][number]

function minutaStatusLabel(reunion: Reunion): { label: string; tone: 'ok' | 'pending' } {
  if (reunion.tipo === HELPDESK_REUNION_TIPO_INICIAL) {
    return minutaInicialCompleta(reunion)
      ? { label: 'Minuta cargada', tone: 'ok' }
      : { label: 'Minuta pendiente', tone: 'pending' }
  }
  const hasText = Boolean(reunion.minuta?.texto?.trim())
  return hasText ? { label: 'Minuta cargada', tone: 'ok' } : { label: 'Sin minuta', tone: 'pending' }
}

export function HelpdeskReunionMinutaBlock({
  reunion,
  areaNombre,
  onOpenMinutaModal,
}: {
  reunion: Reunion
  areaNombre: string
  onOpenMinutaModal: () => void
}) {
  const status = minutaStatusLabel(reunion)
  const isInicial = reunion.tipo === HELPDESK_REUNION_TIPO_INICIAL

  const preview = isInicial
    ? reunion.minutaDiagnostico && minutaInicialCompleta(reunion)
      ? minutaSimpleSummary(minutaSimpleFromDiagnostico(reunion.minutaDiagnostico, areaNombre))
      : reunion.minutaDiagnostico?.generadoPorIA
        ? 'Hay un borrador automático — abrí la minuta para revisarlo'
        : 'Todavía no cargaste la minuta'
    : reunion.minuta?.texto?.trim()
      ? legacyMinutaSummary(reunion.minuta.texto)
      : 'Sin minuta'

  const actionLabel =
    status.tone === 'ok' ? 'Ver o editar minuta' : isInicial ? 'Completar minuta' : 'Agregar minuta'

  return (
    <div className="mt-3 border-t border-neutral-100 pt-3 dark:border-zinc-800" data-testid="helpdesk-reunion-minuta">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-body-muted" aria-hidden />
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                status.tone === 'ok'
                  ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
                  : 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
              }`}
            >
              {status.label}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-body-muted">{preview}</p>
          {!isInicial && reunion.minuta ? (
            <p className="mt-1 text-xs text-body-muted">
              {reunion.minuta.autorNombre} · {formatHelpdeskDateTime(reunion.minuta.updatedAt)}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onOpenMinutaModal}
          data-testid="helpdesk-reunion-minuta-open"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-primary/30 bg-white px-3 py-2 text-xs font-semibold text-brand-primary shadow-sm hover:bg-brand-tint/40 dark:border-brand-primary/40 dark:bg-zinc-950"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          {actionLabel}
        </button>
      </div>
    </div>
  )
}
