import { HELPDESK_TICKET_ESTADOS } from '../../constants/helpdeskEstados'

/** Línea de tiempo compacta: solo puntos, sin etiquetas. */
export function HelpdeskTicketTimelineMini({
  estadoIdx,
  cancelado = false,
}: {
  estadoIdx: number
  cancelado?: boolean
}) {
  const safeIdx = Math.min(Math.max(0, estadoIdx), HELPDESK_TICKET_ESTADOS.length - 1)

  return (
    <ol
      className="flex shrink-0 items-center gap-0.5"
      aria-label="Avance del pedido"
      data-testid="helpdesk-timeline-mini"
    >
      {HELPDESK_TICKET_ESTADOS.map((label, index) => {
        const completed = !cancelado && index < safeIdx
        const current = !cancelado && index === safeIdx
        return (
          <li key={label} className="flex items-center">
            {index > 0 ? (
              <span
                className={`mx-0.5 h-0.5 w-1.5 sm:w-2 ${
                  completed || current ? 'bg-brand-primary' : 'bg-neutral-200 dark:bg-zinc-700'
                }`}
                aria-hidden
              />
            ) : null}
            <span
              className={`block h-2 w-2 rounded-full ${
                cancelado
                  ? 'bg-neutral-300 dark:bg-zinc-600'
                  : current
                    ? 'bg-brand-primary ring-2 ring-brand-primary/30'
                    : completed
                      ? 'bg-brand-primary'
                      : 'border border-neutral-300 bg-white dark:border-zinc-600 dark:bg-zinc-900'
              }`}
              aria-current={current ? 'step' : undefined}
              title={label}
            />
          </li>
        )
      })}
    </ol>
  )
}
