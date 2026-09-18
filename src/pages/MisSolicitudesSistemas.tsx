import { ChevronDown, Headphones, Loader2, Mail } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { HelpdeskProblematicaText } from '../components/helpdesk/HelpdeskProblematicaText'
import { HelpdeskBitacoraSection } from '../components/helpdesk/HelpdeskBitacoraSection'
import { HelpdeskColaboradoresSolicitante } from '../components/helpdesk/HelpdeskColaboradoresSolicitante'
import { HelpdeskTicketTimeline } from '../components/helpdesk/HelpdeskTicketTimeline'
import { HelpdeskTicketTimelineMini } from '../components/helpdesk/HelpdeskTicketTimelineMini'
import { HelpdeskMinutaSimpleView } from '../components/helpdesk/HelpdeskMinutaSimpleView'
import { minutaSimpleFromDiagnostico } from '../components/helpdesk/helpdeskMinutaSimple'
import {
  legacyMinutaSummary,
  minutaDiagnosticoSummary,
  MisProyectosMinutaDisclosure,
} from '../components/helpdesk/MisProyectosMinutaDisclosure'
import { HELPDESK_FINAL_ESTADO_IDX, HELPDESK_TICKET_ESTADOS } from '../constants/helpdeskEstados'
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

function formatActivityShort(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(date)
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

function isTicketActivo(ticket: HelpdeskMisSolicitudTicket): boolean {
  return !ticket.cancelado && ticket.estadoIdx < HELPDESK_FINAL_ESTADO_IDX
}

function isTicketFinalizado(ticket: HelpdeskMisSolicitudTicket): boolean {
  return !ticket.cancelado && ticket.estadoIdx === HELPDESK_FINAL_ESTADO_IDX
}

function isTicketCancelado(ticket: HelpdeskMisSolicitudTicket): boolean {
  return Boolean(ticket.cancelado)
}

function estadoCorto(ticket: HelpdeskMisSolicitudTicket): string {
  if (ticket.cancelado) return 'Cancelado'
  const label = ticket.estado ?? HELPDESK_TICKET_ESTADOS[ticket.estadoIdx]
  if (!label) return '—'
  if (label.length <= 28) return label
  return `${label.slice(0, 27)}…`
}

function parseIsoMs(iso: string | null | undefined): number {
  if (!iso) return 0
  const ms = new Date(iso).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

function lastActivityIso(ticket: HelpdeskMisSolicitudTicket): string | null {
  let best = parseIsoMs(ticket.createdAt)
  let bestIso = ticket.createdAt
  for (const reunion of ticket.reuniones) {
    for (const iso of [
      reunion.createdAt,
      reunion.minuta?.updatedAt,
      reunion.minutaDiagnostico?.updatedAt,
    ]) {
      const ms = parseIsoMs(iso ?? null)
      if (ms >= best) {
        best = ms
        bestIso = iso ?? bestIso
      }
    }
  }
  return bestIso
}

function KpiCard({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        alert
          ? 'border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30'
          : 'border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
      }`}
      data-testid={`helpdesk-mis-proyectos-kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-body-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-heading">{value}</p>
    </div>
  )
}

function SolicitudCardExpandedBody({
  ticket,
  onColaboradoresUpdated,
}: {
  ticket: HelpdeskMisSolicitudTicket
  onColaboradoresUpdated: () => void
}) {
  const miRol = ticket.miRolAcceso ?? 'propio'
  const canCommentBitacora = miRol === 'propio' || miRol === 'editor'
  const assignee =
    ticket.asignadoNombre?.trim() ||
    (ticket.asignadoATeamId ? 'Equipo Sistemas' : 'Sin asignar aún')

  return (
    <div
      className="space-y-4 border-t border-neutral-100 px-4 py-4 dark:border-zinc-800 sm:px-5"
      data-testid="helpdesk-mis-solicitud-expanded-body"
    >
      {ticket.problematica?.trim() ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Problemática</p>
          <HelpdeskProblematicaText text={ticket.problematica} className="mt-1" />
        </div>
      ) : null}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">
          Referente Sistemas
        </p>
        <p className="mt-1 text-sm font-medium text-heading">{assignee}</p>
      </div>

      <HelpdeskTicketTimeline
        estadoIdx={ticket.estadoIdx}
        cancelado={ticket.cancelado === true}
        canceladoMotivo={ticket.canceladoMotivo}
        canceladoPor={ticket.canceladoPor}
      />

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
                <span className="font-medium text-heading">{reunion.tipo}</span>
                <span className="text-body-muted">
                  {reunion.fecha} · {reunion.hora}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-brand-primary dark:bg-zinc-900">
                  {reunionEstadoLabel(reunion.estado)}
                </span>
                {reunion.tipo === HELPDESK_REUNION_TIPO_INICIAL && reunion.minutaDiagnostico ? (
                  <MisProyectosMinutaDisclosure
                    title="Minuta de diagnóstico"
                    summary={minutaDiagnosticoSummary(reunion.minutaDiagnostico)}
                  >
                    <HelpdeskMinutaSimpleView
                      value={minutaSimpleFromDiagnostico(
                        reunion.minutaDiagnostico,
                        ticket.areaNombre,
                      )}
                    />
                  </MisProyectosMinutaDisclosure>
                ) : reunion.minuta ? (
                  <MisProyectosMinutaDisclosure
                    title="Minuta"
                    summary={legacyMinutaSummary(reunion.minuta.texto)}
                  >
                    <p className="whitespace-pre-wrap text-sm text-heading">{reunion.minuta.texto}</p>
                    <p className="mt-2 text-xs text-body-muted">
                      {reunion.minuta.autorNombre} · {formatCreatedAt(reunion.minuta.updatedAt)}
                    </p>
                  </MisProyectosMinutaDisclosure>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <HelpdeskColaboradoresSolicitante
        ticketId={ticket.id}
        miRolAcceso={miRol}
        colaboradores={ticket.colaboradoresSolicitante ?? []}
        onUpdated={onColaboradoresUpdated}
      />

      <HelpdeskBitacoraSection
        ticketId={ticket.id}
        estadoIdx={ticket.estadoIdx}
        mode="mis-proyectos"
        canComment={canCommentBitacora}
      />
    </div>
  )
}

function SolicitudRow({
  ticket,
  expanded,
  onToggle,
  onColaboradoresUpdated,
}: {
  ticket: HelpdeskMisSolicitudTicket
  expanded: boolean
  onToggle: () => void
  onColaboradoresUpdated: () => void
}) {
  const activityIso = lastActivityIso(ticket)
  const activityLabel = formatActivityShort(activityIso)

  return (
    <article
      className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      data-testid="helpdesk-mis-solicitud-card"
      data-ticket-id={ticket.id}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full min-h-11 cursor-pointer items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary dark:hover:bg-zinc-800/80 sm:gap-3 sm:px-4"
        data-testid="helpdesk-mis-solicitud-row"
      >
        <div className="min-w-0 flex-1 space-y-1.5 sm:space-y-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="truncate text-sm font-semibold text-heading sm:text-base">{ticket.areaNombre}</h2>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase sm:text-xs ${urgenciaBadgeClass(ticket.urgencia)}`}
            >
              {urgenciaLabel(ticket.urgencia)}
            </span>
            <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-body sm:text-xs dark:bg-zinc-800">
              {estadoCorto(ticket)}
            </span>
            {ticket.miRolAcceso && ticket.miRolAcceso !== 'propio' ? (
              <span
                className="shrink-0 rounded-full border border-brand-primary/30 bg-brand-primary/5 px-2 py-0.5 text-[10px] font-semibold text-brand-primary sm:text-xs"
                data-testid="helpdesk-mis-solicitud-rol-badge"
              >
                {ticket.miRolAcceso === 'lector' ? 'Colaborador · Lector' : 'Colaborador · Editor'}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <HelpdeskTicketTimelineMini
              estadoIdx={ticket.estadoIdx}
              cancelado={ticket.cancelado === true}
            />
            <span className="text-xs text-body-muted">Actividad {activityLabel}</span>
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-body-muted transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          {expanded ? (
            <SolicitudCardExpandedBody
              ticket={ticket}
              onColaboradoresUpdated={onColaboradoresUpdated}
            />
          ) : null}
        </div>
      </div>
    </article>
  )
}

function ProyectosSection({
  title,
  tickets,
  expandedIds,
  onToggle,
  onColaboradoresUpdated,
  testId,
}: {
  title: string
  tickets: HelpdeskMisSolicitudTicket[]
  expandedIds: Set<string>
  onToggle: (id: string) => void
  onColaboradoresUpdated: () => void
  testId: string
}) {
  if (tickets.length === 0) return null
  return (
    <section className="space-y-3" data-testid={testId}>
      <h2 className="text-lg font-semibold text-heading">{title}</h2>
      <ul className="space-y-2">
        {tickets.map((ticket) => (
          <li key={ticket.id}>
            <SolicitudRow
              ticket={ticket}
              expanded={expandedIds.has(ticket.id)}
              onToggle={() => onToggle(ticket.id)}
              onColaboradoresUpdated={onColaboradoresUpdated}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function MisSolicitudesSistemas() {
  const [loading, setLoading] = useState(true)
  const [tickets, setTickets] = useState<HelpdeskMisSolicitudTicket[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

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

  const { activos, finalizados, cancelados } = useMemo(() => {
    const activosList = tickets.filter(isTicketActivo)
    const finalizadosList = tickets.filter(isTicketFinalizado)
    const canceladosList = tickets.filter(isTicketCancelado)
    const byActivity = (a: HelpdeskMisSolicitudTicket, b: HelpdeskMisSolicitudTicket) =>
      parseIsoMs(lastActivityIso(b)) - parseIsoMs(lastActivityIso(a))
    activosList.sort(byActivity)
    finalizadosList.sort(byActivity)
    canceladosList.sort(byActivity)
    return { activos: activosList, finalizados: finalizadosList, cancelados: canceladosList }
  }, [tickets])

  const urgentesActivos = activos.filter((t) => t.urgencia === 'alta').length

  const reloadTickets = useCallback(async () => {
    try {
      const data = await fetchMisSolicitudes()
      setTickets(data.tickets)
    } catch (err) {
      toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
    }
  }, [])

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-brand-primary">
          <Headphones className="h-6 w-6" aria-hidden />
          <p className="text-xs font-semibold uppercase tracking-[0.14em]">Sistemas · Desarrollo</p>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-heading sm:text-3xl">Mis proyectos</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-body-muted">
          Seguimiento de los pedidos que iniciaste con el equipo de Sistemas. Acá ves el estado y las
          reuniones acordadas.
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
                Cuando Sistemas te invite a cargar un pedido por correo, vas a poder seguirlo desde esta
                pantalla. Si creés que deberías ver algo acá, contactá al equipo de Sistemas.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <div
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            data-testid="helpdesk-mis-proyectos-resumen"
          >
            <KpiCard label="Activos" value={activos.length} />
            <KpiCard label="Urgentes activos" value={urgentesActivos} alert={urgentesActivos > 0} />
            <KpiCard label="Finalizados" value={finalizados.length} />
            <KpiCard label="Cancelados" value={cancelados.length} />
          </div>

          <div className="space-y-8">
            <ProyectosSection
              title="Activos"
              tickets={activos}
              expandedIds={expandedIds}
              onToggle={toggleExpanded}
              onColaboradoresUpdated={() => void reloadTickets()}
              testId="helpdesk-mis-proyectos-seccion-activos"
            />
            <ProyectosSection
              title="Finalizados"
              tickets={finalizados}
              expandedIds={expandedIds}
              onToggle={toggleExpanded}
              onColaboradoresUpdated={() => void reloadTickets()}
              testId="helpdesk-mis-proyectos-seccion-finalizados"
            />
            <ProyectosSection
              title="Cancelados"
              tickets={cancelados}
              expandedIds={expandedIds}
              onToggle={toggleExpanded}
              onColaboradoresUpdated={() => void reloadTickets()}
              testId="helpdesk-mis-proyectos-seccion-cancelados"
            />
          </div>
        </>
      )}
    </div>
  )
}
