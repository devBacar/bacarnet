import { ChevronLeft, ChevronRight } from 'lucide-react'
import { HELPDESK_FINAL_ESTADO_IDX, HELPDESK_TICKET_ESTADOS } from '../../constants/helpdeskEstados'
import { HelpdeskCanceledBanner } from './HelpdeskCanceledBanner'

const TRACK_IDLE = 'bg-neutral-200 dark:bg-zinc-700'
const TRACK_DONE = 'bg-brand-primary dark:bg-brand-primary'
const NODE_PENDING =
  'border-neutral-300 bg-white text-body-muted dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400'
const NODE_DONE = 'border-brand-primary bg-brand-tint/70 text-brand-primary dark:bg-brand-primary/20 dark:text-brand-primary'
const NODE_CURRENT =
  'border-brand-primary bg-brand-primary text-white shadow-sm shadow-brand-primary/25 scale-110'

export function HelpdeskTicketTimeline({
  estadoIdx,
  editable = false,
  onChangeEstado,
  onOpenManualEstado,
  disabled = false,
  cancelado = false,
  canceladoMotivo,
  canceladoPor,
  showCanceledBanner = true,
}: {
  estadoIdx: number
  editable?: boolean
  onChangeEstado?: (estadoIdx: number) => void
  onOpenManualEstado?: () => void
  disabled?: boolean
  cancelado?: boolean
  canceladoMotivo?: string | null
  canceladoPor?: string | null
  showCanceledBanner?: boolean
}) {
  const safeIdx = Math.min(Math.max(0, estadoIdx), HELPDESK_TICKET_ESTADOS.length - 1)
  const timelineFrozen = cancelado
  const currentLabel = HELPDESK_TICKET_ESTADOS[safeIdx] ?? ''
  const canAdvance = safeIdx < HELPDESK_FINAL_ESTADO_IDX
  const canRetreat = safeIdx > 0

  return (
    <div className="relative">
      {cancelado && showCanceledBanner ? (
        <HelpdeskCanceledBanner motivo={canceladoMotivo} canceladoPor={canceladoPor} />
      ) : null}

      <div className={timelineFrozen ? 'pointer-events-none opacity-90' : undefined}>
        <div
          className="rounded-xl border border-neutral-200 bg-neutral-50/90 px-3 py-4 dark:border-zinc-700 dark:bg-zinc-950/50 sm:px-4"
          data-testid="helpdesk-ticket-timeline-track"
        >
          <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-body-muted sm:text-left">
            Estado del pedido · paso {safeIdx + 1} de {HELPDESK_TICKET_ESTADOS.length}
          </p>

          <ol className="mt-4 flex flex-wrap gap-y-4 sm:flex-nowrap sm:gap-0">
            {HELPDESK_TICKET_ESTADOS.map((label, index) => {
              const completed = index < safeIdx
              const current = index === safeIdx
              const segmentDone = (side: 'left' | 'right') => {
                if (side === 'left') return index > 0 && index <= safeIdx
                return index < safeIdx
              }

              return (
                <li
                  key={label}
                  className="flex min-w-[4.75rem] flex-1 flex-col items-center gap-2 text-center sm:min-w-0"
                >
                  <div className="flex w-full items-center">
                    {index > 0 ? (
                      <span
                        className={`hidden h-0.5 flex-1 sm:block ${
                          segmentDone('left') ? TRACK_DONE : TRACK_IDLE
                        }`}
                        aria-hidden
                      />
                    ) : (
                      <span className="hidden flex-1 sm:block" aria-hidden />
                    )}
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-transform sm:h-9 sm:w-9 ${
                        current ? NODE_CURRENT : completed ? NODE_DONE : NODE_PENDING
                      }`}
                      aria-current={current ? 'step' : undefined}
                    >
                      {completed ? '✓' : index + 1}
                    </span>
                    {index < HELPDESK_TICKET_ESTADOS.length - 1 ? (
                      <span
                        className={`hidden h-0.5 flex-1 sm:block ${
                          segmentDone('right') ? TRACK_DONE : TRACK_IDLE
                        }`}
                        aria-hidden
                      />
                    ) : (
                      <span className="hidden flex-1 sm:block" aria-hidden />
                    )}
                  </div>
                  <span
                    className={`px-1 text-[10px] leading-tight sm:text-[11px] ${
                      current
                        ? 'font-semibold text-heading'
                        : completed
                          ? 'font-medium text-heading/90'
                          : 'text-body-muted'
                    }`}
                  >
                    {label}
                  </span>
                </li>
              )
            })}
          </ol>

          <p className="mt-4 text-center text-sm font-semibold text-heading sm:text-left">{currentLabel}</p>
        </div>

        {editable && !timelineFrozen ? (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-neutral-100 pt-3 text-xs dark:border-zinc-800 sm:justify-start">
            {canRetreat ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChangeEstado?.(safeIdx - 1)}
                className="inline-flex items-center gap-0.5 font-medium text-body-muted hover:text-heading disabled:opacity-50"
                data-testid="helpdesk-ticket-estado-prev"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Etapa anterior
              </button>
            ) : null}
            {canAdvance ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChangeEstado?.(safeIdx + 1)}
                className="inline-flex items-center gap-0.5 font-medium text-brand-primary hover:underline disabled:opacity-50"
                data-testid="helpdesk-ticket-estado-next"
              >
                Siguiente etapa
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            ) : (
              <span className="font-medium text-body-muted">Etapa final</span>
            )}
            {onOpenManualEstado ? (
              <button
                type="button"
                disabled={disabled}
                onClick={onOpenManualEstado}
                className="font-medium text-body-muted underline-offset-2 hover:text-brand-primary hover:underline disabled:opacity-50"
                data-testid="helpdesk-ticket-estado-manual-open"
              >
                Elegir otra etapa…
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
