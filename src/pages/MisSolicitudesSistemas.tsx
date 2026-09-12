import { CalendarDays, Headphones, Loader2, Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  fetchMisSolicitudes,
  HelpdeskApiError,
  HELPDESK_GENERIC_ERROR_MESSAGE,
  type HelpdeskMisSolicitudTicket,
  type HelpdeskUrgencia,
} from '../services/helpdeskApi'

/** Debe coincidir con HELPDESK_TICKET_ESTADOS del backend. */
const TICKET_ESTADOS = [
  'Solicitud recibida',
  'Reunión inicial agendada',
  'En proceso de planificación',
  'En proceso de desarrollo',
  'En proceso de implementación',
  'Finalizada',
] as const

function formatCreatedAt(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function urgenciaBadgeClass(urgencia: HelpdeskUrgencia): string {
  switch (urgencia) {
    case 'baja':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200'
    case 'media':
      return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200'
    case 'alta':
      return 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200'
    default:
      return 'border-neutral-200 bg-neutral-50 text-neutral-700'
  }
}

function urgenciaLabel(urgencia: HelpdeskUrgencia): string {
  return urgencia.charAt(0).toUpperCase() + urgencia.slice(1)
}

function reunionEstadoLabel(estado: string): string {
  switch (estado) {
    case 'confirmada':
      return 'Confirmada'
    case 'rechazada':
      return 'Rechazada'
    default:
      return 'Pendiente'
  }
}

function TicketTimeline({ estadoIdx }: { estadoIdx: number }) {
  const safeIdx = Math.min(Math.max(0, estadoIdx), TICKET_ESTADOS.length - 1)

  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Estado del pedido</p>
      <ol className="mt-3 flex flex-wrap gap-2 sm:flex-nowrap sm:gap-0">
        {TICKET_ESTADOS.map((label, index) => {
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
                {index < TICKET_ESTADOS.length - 1 ? (
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
  )
}

function SolicitudCard({ ticket }: { ticket: HelpdeskMisSolicitudTicket }) {
  const assignee =
    ticket.asignadoNombre?.trim() ||
    (ticket.asignadoATeamId ? 'Equipo Sistemas' : 'Sin asignar aún')

  return (
    <article
      className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      data-testid="helpdesk-mis-solicitud-card"
      data-ticket-id={ticket.id}
    >
      <div className="border-b border-neutral-100 px-4 py-4 dark:border-zinc-800 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Área</p>
            <h2 className="text-lg font-semibold text-heading">{ticket.areaNombre}</h2>
            <p className="text-sm text-body-muted">
              Solicitud del {formatCreatedAt(ticket.createdAt)}
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${urgenciaBadgeClass(ticket.urgencia)}`}
          >
            Urgencia {urgenciaLabel(ticket.urgencia)}
          </span>
        </div>
        <TicketTimeline estadoIdx={ticket.estadoIdx} />
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">
            Referente Sistemas
          </p>
          <p className="mt-1 text-sm font-medium text-heading">{assignee}</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Reuniones</p>
          {ticket.reuniones.length === 0 ? (
            <p className="mt-2 text-sm text-body-muted">Todavía no hay reuniones registradas.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {ticket.reuniones.map((reunion) => (
                <li
                  key={reunion.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950/60"
                >
                  <CalendarDays className="h-4 w-4 shrink-0 text-brand-primary" aria-hidden />
                  <span className="font-medium text-heading">{reunion.tipo}</span>
                  <span className="text-body-muted">
                    {reunion.fecha} · {reunion.hora}
                  </span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-brand-primary dark:bg-zinc-900">
                    {reunionEstadoLabel(reunion.estado)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  )
}

export function MisSolicitudesSistemas() {
  const [loading, setLoading] = useState(true)
  const [tickets, setTickets] = useState<HelpdeskMisSolicitudTicket[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const data = await fetchMisSolicitudes()
        if (!cancelled) {
          setTickets(data.tickets)
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE
          toast.error(message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-brand-primary">
          <Headphones className="h-6 w-6" aria-hidden />
          <p className="text-xs font-semibold uppercase tracking-[0.14em]">Sistemas · Helpdesk</p>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-heading sm:text-3xl">
          Mis solicitudes
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-body-muted">
          Seguimiento de los pedidos que iniciaste con el equipo de Sistemas. Acá ves el estado y
          las reuniones acordadas.
        </p>
      </header>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-body-muted">
          <Loader2 className="h-5 w-5 animate-spin text-brand-primary" aria-hidden />
          Cargando solicitudes…
        </div>
      ) : tickets.length === 0 ? (
        <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-6 dark:border-zinc-800 dark:bg-zinc-950/60">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-6 w-6 shrink-0 text-brand-primary" aria-hidden />
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-heading">Todavía no tenés solicitudes</h2>
              <p className="text-sm leading-relaxed text-body-muted">
                Cuando Sistemas te invite a cargar un pedido por correo, vas a poder seguirlo desde
                esta pantalla. Si creés que deberías ver algo acá, contactá al equipo de Sistemas.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <div className="space-y-5">
          {tickets.map((ticket) => (
            <SolicitudCard key={ticket.id} ticket={ticket} />
          ))}
        </div>
      )}
    </div>
  )
}
