import { CalendarDays, Headphones, Loader2, Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { HelpdeskProblematicaText } from '../components/helpdesk/HelpdeskProblematicaText'
import { HelpdeskBitacoraSection } from '../components/helpdesk/HelpdeskBitacoraSection'
import { HelpdeskTicketTimeline } from '../components/helpdesk/HelpdeskTicketTimeline'
import { HelpdeskMinutaDiagnosticoView } from '../components/helpdesk/HelpdeskMinutaDiagnosticoView'
import { HELPDESK_REUNION_TIPO_INICIAL } from '../constants/helpdeskReunion'
import {
  fetchMisSolicitudes,
  HelpdeskApiError,
  HELPDESK_GENERIC_ERROR_MESSAGE,
  type HelpdeskMisSolicitudTicket,
  type HelpdeskUrgencia,
} from '../services/helpdeskApi'

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
              Proyecto del {formatCreatedAt(ticket.createdAt)}
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${urgenciaBadgeClass(ticket.urgencia)}`}
          >
            Urgencia {urgenciaLabel(ticket.urgencia)}
          </span>
        </div>
        <HelpdeskTicketTimeline
          estadoIdx={ticket.estadoIdx}
          cancelado={ticket.cancelado === true}
          canceladoMotivo={ticket.canceladoMotivo}
          canceladoPor={ticket.canceladoPor}
        />
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        {ticket.problematica?.trim() ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">
              Problemática
            </p>
            <HelpdeskProblematicaText text={ticket.problematica} className="mt-1" />
          </div>
        ) : null}
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
                  {reunion.tipo === HELPDESK_REUNION_TIPO_INICIAL &&
                  reunion.minutaDiagnostico ? (
                    <div
                      className="mt-2 w-full basis-full rounded-md border border-neutral-200 bg-white px-3 py-3 dark:border-zinc-700 dark:bg-zinc-900"
                      data-testid="helpdesk-mis-proyectos-minuta"
                    >
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-body-muted">
                        Minuta de diagnóstico
                      </p>
                      <HelpdeskMinutaDiagnosticoView
                        minuta={reunion.minutaDiagnostico}
                        areaNombre={ticket.areaNombre}
                        legacyMinutaTexto={reunion.minuta?.texto}
                        legacyMinutaMeta={
                          reunion.minuta
                            ? `${reunion.minuta.autorNombre} · ${formatCreatedAt(reunion.minuta.updatedAt)}`
                            : null
                        }
                      />
                    </div>
                  ) : reunion.minuta ? (
                    <div
                      className="mt-2 w-full basis-full rounded-md border border-neutral-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                      data-testid="helpdesk-mis-proyectos-minuta"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">
                        Minuta
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-heading">
                        {reunion.minuta.texto}
                      </p>
                      <p className="mt-2 text-xs text-body-muted">
                        {reunion.minuta.autorNombre} ·{' '}
                        {formatCreatedAt(reunion.minuta.updatedAt)}
                      </p>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <HelpdeskBitacoraSection
          ticketId={ticket.id}
          estadoIdx={ticket.estadoIdx}
          mode="mis-proyectos"
        />
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
          <p className="text-xs font-semibold uppercase tracking-[0.14em]">Sistemas · Desarrollo</p>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-heading sm:text-3xl">
          Mis proyectos
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-body-muted">
          Seguimiento de los pedidos que iniciaste con el equipo de Sistemas. Acá ves el estado y
          las reuniones acordadas.
        </p>
      </header>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-body-muted">
          <Loader2 className="h-5 w-5 animate-spin text-brand-primary" aria-hidden />
          Cargando proyectos…
        </div>
      ) : tickets.length === 0 ? (
        <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-6 dark:border-zinc-800 dark:bg-zinc-950/60">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-6 w-6 shrink-0 text-brand-primary" aria-hidden />
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-heading">Todavía no tenés proyectos</h2>
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
