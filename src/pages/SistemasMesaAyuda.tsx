import { Headphones, Loader2, ShieldX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { HelpdeskPanelTicketDetail } from '../components/helpdesk/HelpdeskPanelTicketDetail'
import {
  formatHelpdeskDateTime,
  helpdeskUrgenciaBadgeClass,
  helpdeskUrgenciaLabel,
} from '../components/helpdesk/helpdeskUi'
import { HELPDESK_FINAL_ESTADO_IDX, HELPDESK_TICKET_ESTADOS } from '../constants/helpdeskEstados'
import {
  fetchHelpdeskTeam,
  fetchHelpdeskTickets,
  HelpdeskApiError,
  HELPDESK_GENERIC_ERROR_MESSAGE,
  type HelpdeskPanelTicket,
  type HelpdeskTeamMemberDto,
  type HelpdeskUrgencia,
} from '../services/helpdeskApi'

type AccessState = 'loading' | 'forbidden' | 'ready'

function computeKpis(tickets: HelpdeskPanelTicket[]) {
  const now = Date.now()
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
  const activos = tickets.filter((t) => t.estadoIdx !== HELPDESK_FINAL_ESTADO_IDX)
  const nuevos7d = tickets.filter((t) => {
    if (!t.createdAt) return false
    const ms = new Date(t.createdAt).getTime()
    return Number.isFinite(ms) && now - ms <= sevenDaysMs
  })
  const urgentesActivos = activos.filter((t) => t.urgencia === 'alta')
  const porEstado = HELPDESK_TICKET_ESTADOS.map((label, idx) => ({
    idx,
    label,
    count: tickets.filter((t) => t.estadoIdx === idx).length,
  }))
  return {
    totalActivos: activos.length,
    nuevos7d: nuevos7d.length,
    urgentesActivos: urgentesActivos.length,
    porEstado,
  }
}

export function SistemasMesaAyuda() {
  const [access, setAccess] = useState<AccessState>('loading')
  const [teamMembers, setTeamMembers] = useState<HelpdeskTeamMemberDto[]>([])
  const [tickets, setTickets] = useState<HelpdeskPanelTicket[]>([])
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [filterEstado, setFilterEstado] = useState<string>('')
  const [filterUrgencia, setFilterUrgencia] = useState<string>('')
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)

  const loadTickets = useCallback(async () => {
    setTicketsLoading(true)
    try {
      const data = await fetchHelpdeskTickets()
      setTickets(data.tickets)
    } catch (err) {
      toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
    } finally {
      setTicketsLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const team = await fetchHelpdeskTeam()
        if (cancelled) return
        setTeamMembers(team.members)
        setAccess('ready')
        await loadTickets()
      } catch (err) {
        if (cancelled) return
        if (err instanceof HelpdeskApiError && err.status === 403) {
          setAccess('forbidden')
          return
        }
        toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
        setAccess('forbidden')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadTickets])

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (filterEstado !== '' && t.estadoIdx !== Number.parseInt(filterEstado, 10)) {
        return false
      }
      if (filterUrgencia !== '' && t.urgencia !== filterUrgencia) {
        return false
      }
      return true
    })
  }, [tickets, filterEstado, filterUrgencia])

  const kpis = useMemo(() => computeKpis(tickets), [tickets])

  if (access === 'loading') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-body-muted">
        <Loader2 className="h-6 w-6 animate-spin text-brand-primary" aria-hidden />
        Verificando acceso…
      </div>
    )
  }

  if (access === 'forbidden') {
    return (
      <div className="mx-auto max-w-lg py-16" data-testid="helpdesk-mesa-forbidden">
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/60">
          <ShieldX className="mx-auto h-10 w-10 text-brand-primary" aria-hidden />
          <h1 className="mt-4 text-xl font-semibold text-heading">No tenés acceso</h1>
          <p className="mt-2 text-sm leading-relaxed text-body-muted">
            La mesa de ayuda de Sistemas es solo para el equipo interno. Si creés que deberías
            entrar, contactá a Dirección de Sistemas.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 pb-8" data-testid="helpdesk-mesa-panel">
      <header className="scroll-mt-24 space-y-3">
        <div className="flex items-center gap-2 text-brand-primary">
          <Headphones className="h-6 w-6" aria-hidden />
          <p className="text-xs font-semibold uppercase tracking-[0.14em]">Sistemas</p>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-heading sm:text-3xl">
          Mesa de ayuda
        </h1>
        <p className="max-w-2xl text-sm text-body-muted">
          Panel interno para gestionar solicitudes de áreas, reuniones y seguimiento.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Activos</p>
          <p className="mt-1 text-2xl font-semibold text-heading">{kpis.totalActivos}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Nuevos (7 días)</p>
          <p className="mt-1 text-2xl font-semibold text-heading">{kpis.nuevos7d}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Urgentes activos</p>
          <p className="mt-1 text-2xl font-semibold text-heading">{kpis.urgentesActivos}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:col-span-2 xl:col-span-1">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-body-muted">Por estado</p>
          <ul className="space-y-1 text-xs text-body-muted">
            {kpis.porEstado.map((row) => (
              <li key={row.idx} className="flex justify-between gap-2">
                <span className="truncate">{row.label}</span>
                <span className="font-semibold text-heading">{row.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-body-muted">
                Estado
              </span>
              <select
                value={filterEstado}
                onChange={(e) => setFilterEstado(e.target.value)}
                className="input-brand-focus rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Todos</option>
                {HELPDESK_TICKET_ESTADOS.map((label, idx) => (
                  <option key={label} value={String(idx)}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-body-muted">
                Urgencia
              </span>
              <select
                value={filterUrgencia}
                onChange={(e) => setFilterUrgencia(e.target.value)}
                className="input-brand-focus rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Todas</option>
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </label>
          </div>

          {ticketsLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-body-muted">
              <Loader2 className="h-5 w-5 animate-spin text-brand-primary" aria-hidden />
              Actualizando lista…
            </div>
          ) : filteredTickets.length === 0 ? (
            <p className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-body-muted dark:border-zinc-800 dark:bg-zinc-900">
              No hay tickets con estos filtros.
            </p>
          ) : (
            <ul className="space-y-2">
              {filteredTickets.map((ticket) => {
                const selected = selectedTicketId === ticket.id
                return (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedTicketId(ticket.id)}
                      data-testid="helpdesk-mesa-ticket-row"
                      className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                        selected
                          ? 'border-brand-primary bg-brand-tint/30 dark:bg-brand-tint/10'
                          : 'border-neutral-200 bg-white hover:border-brand-primary/30 dark:border-zinc-800 dark:bg-zinc-900'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-heading">{ticket.areaNombre}</p>
                          <p className="text-sm text-body-muted">
                            {ticket.estado ?? HELPDESK_TICKET_ESTADOS[ticket.estadoIdx]}
                          </p>
                          <p className="mt-1 text-xs text-body-muted">
                            {ticket.asignadoNombre ?? 'Sin asignar'} ·{' '}
                            {formatHelpdeskDateTime(ticket.createdAt)}
                          </p>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${helpdeskUrgenciaBadgeClass(ticket.urgencia)}`}
                        >
                          {helpdeskUrgenciaLabel(ticket.urgencia as HelpdeskUrgencia)}
                        </span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section
          className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5 xl:sticky xl:top-20 xl:z-[1] xl:max-h-[calc(100dvh-5.5rem)] xl:min-h-[24rem] xl:overflow-y-auto xl:overscroll-contain"
          data-testid="helpdesk-mesa-detail-scroll"
        >
          {selectedTicketId ? (
            <HelpdeskPanelTicketDetail
              ticketId={selectedTicketId}
              teamMembers={teamMembers}
              onTicketUpdated={() => void loadTickets()}
            />
          ) : (
            <p className="flex h-full min-h-[12rem] items-center justify-center text-sm text-body-muted">
              Elegí un ticket de la lista para ver el detalle.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
