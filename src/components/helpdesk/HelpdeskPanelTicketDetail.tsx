import { CalendarDays, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { HELPDESK_TICKET_ESTADOS } from '../../constants/helpdeskEstados'
import {
  fetchDisponibilidadTeamMember,
  fetchHelpdeskTicketDetail,
  HelpdeskApiError,
  HELPDESK_GENERIC_ERROR_MESSAGE,
  patchHelpdeskTicketAsignado,
  patchHelpdeskTicketEstado,
  postHelpdeskTicketNota,
  postHelpdeskTicketReunion,
  type HelpdeskTeamMemberDto,
  type HelpdeskTicketDetail,
} from '../../services/helpdeskApi'
import {
  formatHelpdeskDateTime,
  helpdeskReunionEstadoLabel,
  helpdeskUrgenciaBadgeClass,
  helpdeskUrgenciaLabel,
} from './helpdeskUi'
import { HelpdeskSlotGrid } from './HelpdeskSlotGrid'
import { HelpdeskTicketTimeline } from './HelpdeskTicketTimeline'

export function HelpdeskPanelTicketDetail({
  ticketId,
  teamMembers,
  onTicketUpdated,
}: {
  ticketId: string
  teamMembers: HelpdeskTeamMemberDto[]
  onTicketUpdated: () => void
}) {
  const [ticket, setTicket] = useState<HelpdeskTicketDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notaTexto, setNotaTexto] = useState('')
  const [showSchedule, setShowSchedule] = useState(false)
  const [reunionTipo, setReunionTipo] = useState('Seguimiento')
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [slots, setSlots] = useState<{ fecha: string; hora: string; libre: boolean }[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<{ fecha: string; hora: string } | null>(null)

  const loadDetail = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchHelpdeskTicketDetail(ticketId)
      setTicket(data.ticket)
    } catch (err) {
      const message =
        err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE
      toast.error(message)
      setTicket(null)
    } finally {
      setLoading(false)
    }
  }, [ticketId])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  const loadSlots = useCallback(async () => {
    if (!ticket?.asignadoATeamId) return
    setSlotsLoading(true)
    setSelectedSlot(null)
    try {
      const data = await fetchDisponibilidadTeamMember(ticket.asignadoATeamId, semanaOffset)
      setSlots(data.slots)
    } catch (err) {
      const message =
        err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE
      toast.error(message)
    } finally {
      setSlotsLoading(false)
    }
  }, [ticket?.asignadoATeamId, semanaOffset])

  useEffect(() => {
    if (showSchedule && ticket?.asignadoATeamId) {
      void loadSlots()
    }
  }, [showSchedule, ticket?.asignadoATeamId, loadSlots])

  const handleEstadoChange = async (estadoIdx: number) => {
    if (!ticket || ticket.estadoIdx === estadoIdx) return
    setBusy(true)
    try {
      await patchHelpdeskTicketEstado(ticketId, estadoIdx)
      await loadDetail()
      onTicketUpdated()
      toast.success('Estado actualizado')
    } catch (err) {
      toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
    } finally {
      setBusy(false)
    }
  }

  const handleAsignadoChange = async (teamMemberId: string) => {
    if (!ticket || ticket.asignadoATeamId === teamMemberId) return
    setBusy(true)
    try {
      await patchHelpdeskTicketAsignado(ticketId, teamMemberId)
      await loadDetail()
      onTicketUpdated()
      toast.success('Responsable actualizado')
    } catch (err) {
      toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
    } finally {
      setBusy(false)
    }
  }

  const handleAddNota = async () => {
    const texto = notaTexto.trim()
    if (!texto) return
    setBusy(true)
    try {
      await postHelpdeskTicketNota(ticketId, texto)
      setNotaTexto('')
      await loadDetail()
      toast.success('Nota agregada')
    } catch (err) {
      toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
    } finally {
      setBusy(false)
    }
  }

  const handleConfirmReunion = async () => {
    if (!ticket?.asignadoATeamId || !selectedSlot || !reunionTipo.trim()) return
    setBusy(true)
    try {
      await postHelpdeskTicketReunion(ticketId, {
        tipo: reunionTipo.trim(),
        teamMemberId: ticket.asignadoATeamId,
        fecha: selectedSlot.fecha,
        hora: selectedSlot.hora,
      })
      setShowSchedule(false)
      setSelectedSlot(null)
      await loadDetail()
      onTicketUpdated()
      toast.success('Reunión agendada')
    } catch (err) {
      if (err instanceof HelpdeskApiError && err.status === 409) {
        toast.error(err.message)
        await loadSlots()
        return
      }
      toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-body-muted">
        <Loader2 className="h-5 w-5 animate-spin text-brand-primary" aria-hidden />
        Cargando ticket…
      </div>
    )
  }

  if (!ticket) {
    return (
      <p className="py-8 text-center text-sm text-body-muted">No se pudo cargar el detalle.</p>
    )
  }

  const assigneeLabel =
    ticket.asignadoNombre ??
    teamMembers.find((m) => m.id === ticket.asignadoATeamId)?.nombre ??
    'Sin asignar'

  return (
    <div className="space-y-6" data-testid="helpdesk-mesa-detail">
      <div className="sticky top-0 z-10 -mx-4 space-y-2 border-b border-neutral-100 bg-white px-4 pb-4 pt-0 dark:border-zinc-800 dark:bg-zinc-900 sm:-mx-5 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Ticket</p>
            <h2 className="text-xl font-semibold text-heading">{ticket.areaNombre}</h2>
            <p className="mt-1 text-sm text-body-muted">
              {ticket.requesterNombre} · {ticket.requesterEmail}
            </p>
            <p className="mt-2 text-sm text-body-muted">{formatHelpdeskDateTime(ticket.createdAt)}</p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${helpdeskUrgenciaBadgeClass(ticket.urgencia)}`}
          >
            {helpdeskUrgenciaLabel(ticket.urgencia)}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-heading">{ticket.problematica}</p>
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
        <HelpdeskTicketTimeline
          estadoIdx={ticket.estadoIdx}
          editable
          disabled={busy}
          onChangeEstado={(idx) => void handleEstadoChange(idx)}
        />
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
        <label className="block text-xs font-semibold uppercase tracking-wide text-body-muted">
          Responsable
          <select
            value={ticket.asignadoATeamId ?? ''}
            disabled={busy}
            onChange={(e) => void handleAsignadoChange(e.target.value)}
            className="input-brand-focus mt-2 block w-full max-w-md rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-heading dark:border-zinc-700 dark:bg-zinc-950"
            data-testid="helpdesk-mesa-asignado-select"
          >
            <option value="" disabled>
              Elegí un miembro del equipo
            </option>
            {teamMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.nombre} — {member.rol}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-sm text-body-muted">Actual: {assigneeLabel}</p>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
        <h3 className="text-sm font-semibold text-heading">Reuniones</h3>
        {ticket.reuniones.length === 0 ? (
          <p className="mt-2 text-sm text-body-muted">Sin reuniones registradas.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {ticket.reuniones.map((reunion) => (
              <li
                key={reunion.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950/60"
              >
                <CalendarDays className="h-4 w-4 text-brand-primary" aria-hidden />
                <span className="font-medium">{reunion.tipo}</span>
                <span className="text-body-muted">
                  {reunion.fecha} · {reunion.hora}
                </span>
                <span className="text-xs font-medium text-brand-primary">
                  {helpdeskReunionEstadoLabel(reunion.estado)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {!ticket.asignadoATeamId ? (
          <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
            Asigná un responsable antes de agendar una reunión.
          </p>
        ) : (
          <div className="mt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowSchedule((v) => !v)}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-brand-primary transition-colors hover:bg-brand-tint/30 dark:border-zinc-700 dark:bg-zinc-950"
            >
              {showSchedule ? 'Ocultar grilla' : 'Agendar nueva reunión'}
            </button>
            {showSchedule ? (
              <div className="mt-4 space-y-4 rounded-lg border border-neutral-100 bg-neutral-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
                <label className="block text-sm font-medium text-heading">
                  Tipo de reunión
                  <input
                    value={reunionTipo}
                    onChange={(e) => setReunionTipo(e.target.value)}
                    className="input-brand-focus mt-1 w-full max-w-md rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </label>
                <HelpdeskSlotGrid
                  slots={slots}
                  semanaOffset={semanaOffset}
                  loading={slotsLoading}
                  selectedSlot={selectedSlot}
                  onSelectSlot={setSelectedSlot}
                  onNextWeek={() => setSemanaOffset((o) => o + 1)}
                />
                <button
                  type="button"
                  disabled={busy || !selectedSlot}
                  onClick={() => void handleConfirmReunion()}
                  className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  Confirmar reunión
                </button>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
        <h3 className="text-sm font-semibold text-heading">Notas internas</h3>
        <ul className="mt-3 space-y-3">
          {ticket.notas.length === 0 ? (
            <li className="text-sm text-body-muted">Todavía no hay notas.</li>
          ) : (
            ticket.notas.map((nota) => (
              <li
                key={nota.id}
                className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/60"
                data-testid="helpdesk-mesa-nota-item"
              >
                <p className="text-sm text-heading">{nota.texto}</p>
                <p className="mt-1 text-xs text-body-muted">
                  {nota.autorNombre} · {formatHelpdeskDateTime(nota.createdAt)}
                </p>
              </li>
            ))
          )}
        </ul>
        <div className="mt-4 space-y-2">
          <textarea
            value={notaTexto}
            onChange={(e) => setNotaTexto(e.target.value)}
            rows={3}
            placeholder="Agregar una nota…"
            data-testid="helpdesk-mesa-nota-input"
            className="input-brand-focus w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <button
            type="button"
            disabled={busy || !notaTexto.trim()}
            onClick={() => void handleAddNota()}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            Guardar nota
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
        <h3 className="text-sm font-semibold text-heading">Correos enviados</h3>
        {ticket.emailLog.length === 0 ? (
          <p className="mt-2 text-sm text-body-muted">Sin registros de correo para este ticket.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-body-muted dark:border-zinc-800">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2">Destinatarios</th>
                </tr>
              </thead>
              <tbody>
                {ticket.emailLog.map((row) => (
                  <tr key={row.id} className="border-b border-neutral-50 dark:border-zinc-800/80">
                    <td className="py-2 pr-3 whitespace-nowrap text-body-muted">
                      {formatHelpdeskDateTime(row.fecha)}
                    </td>
                    <td className="py-2 pr-3 font-medium text-heading">{row.tipo}</td>
                    <td className="py-2 text-body-muted">{row.destinatarios.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-body-muted">
        Estado actual: {HELPDESK_TICKET_ESTADOS[ticket.estadoIdx] ?? ticket.estado}
      </p>
    </div>
  )
}
