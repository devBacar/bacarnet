import { HELPDESK_TICKET_ESTADOS } from '../../constants/helpdeskEstados'

import { HelpdeskCanceledBanner } from './HelpdeskCanceledBanner'

export function HelpdeskTicketTimeline({
  estadoIdx,
  editable = false,
  onChangeEstado,
  disabled = false,
  cancelado = false,
  canceladoMotivo,
  canceladoPor,
}: {
  estadoIdx: number
  editable?: boolean
  onChangeEstado?: (estadoIdx: number) => void
  disabled?: boolean
  cancelado?: boolean
  canceladoMotivo?: string | null
  canceladoPor?: string | null
}) {
  const safeIdx = Math.min(Math.max(0, estadoIdx), HELPDESK_TICKET_ESTADOS.length - 1)
  const timelineFrozen = cancelado

  return (
    <div className="relative mt-2">
      {cancelado ? (
        <HelpdeskCanceledBanner motivo={canceladoMotivo} canceladoPor={canceladoPor} />
      ) : null}
      <div className={timelineFrozen ? 'pointer-events-none opacity-90' : undefined}>
      {editable ? (
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-body-muted">
            Cambiar estado
            <select
              value={safeIdx}
              disabled={disabled || timelineFrozen}
              onChange={(e) => onChangeEstado?.(Number.parseInt(e.target.value, 10))}
              className="input-brand-focus mt-1 block w-full min-w-[12rem] rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-heading dark:border-zinc-700 dark:bg-zinc-950"
            >
              {HELPDESK_TICKET_ESTADOS.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Estado del pedido</p>
      <ol className="mt-3 flex flex-wrap gap-2 sm:flex-nowrap sm:gap-0">
        {HELPDESK_TICKET_ESTADOS.map((label, index) => {
          const completed = index < safeIdx
          const current = index === safeIdx
          const pending = index > safeIdx
          return (
            <li
              key={label}
              className="flex min-w-[4.5rem] flex-1 flex-col items-center gap-1.5 text-center sm:min-w-0"
            >
              <div className="flex w-full items-center">
                {index > 0 ? (
                  <span
                    className={`hidden h-0.5 flex-1 sm:block ${
                      index <= safeIdx ? 'bg-brand-primary' : 'bg-neutral-200 dark:bg-zinc-700'
                    }`}
                    aria-hidden
                  />
                ) : (
                  <span className="hidden flex-1 sm:block" aria-hidden />
                )}
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                    current
                      ? 'border-brand-primary bg-brand-primary text-white'
                      : completed
                        ? 'border-brand-primary bg-brand-tint/60 text-brand-primary'
                        : 'border-neutral-200 bg-white text-neutral-400 dark:border-zinc-700 dark:bg-zinc-900'
                  }`}
                  aria-current={current ? 'step' : undefined}
                >
                  {completed ? '✓' : index + 1}
                </span>
                {index < HELPDESK_TICKET_ESTADOS.length - 1 ? (
                  <span
                    className={`hidden h-0.5 flex-1 sm:block ${
                      index < safeIdx ? 'bg-brand-primary' : 'bg-neutral-200 dark:bg-zinc-700'
                    }`}
                    aria-hidden
                  />
                ) : (
                  <span className="hidden flex-1 sm:block" aria-hidden />
                )}
              </div>
              <span
                className={`px-0.5 text-[10px] leading-tight sm:text-[11px] ${
                  current ? 'font-semibold text-heading' : pending ? 'text-body-muted' : 'text-brand-primary'
                }`}
              >
                {label}
              </span>
            </li>
          )
        })}
      </ol>
      </div>
    </div>
  )
}
