import { CalendarDays, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { HELPDESK_TICKET_ESTADOS } from '../../constants/helpdeskEstados'
import { HELPDESK_REUNION_TIPO_INICIAL } from '../../constants/helpdeskReunion'
import type { HelpdeskMinutaDiagnostico } from '../../types/helpdeskMinutaDiagnostico'
import {
  deleteHelpdeskTicket,
  fetchDisponibilidadTeamMember,
  fetchHelpdeskTicketDetail,
  HelpdeskApiError,
  HELPDESK_GENERIC_ERROR_MESSAGE,
  patchHelpdeskReunionMinuta,
  patchHelpdeskTicketAsignado,
  patchHelpdeskTicketEstado,
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
import { HelpdeskProblematicaText } from './HelpdeskProblematicaText'
import { HelpdeskSlotGrid } from './HelpdeskSlotGrid'
import { HelpdeskBitacoraSection } from './HelpdeskBitacoraSection'
import { HelpdeskPanelAnalisisSection } from './HelpdeskPanelAnalisisSection'
import { HelpdeskPanelCancelacion } from './HelpdeskPanelCancelacion'
import { HelpdeskTicketTimeline } from './HelpdeskTicketTimeline'
import {
  buildMinutaDiagnosticoPayload,
  createEmptyMinutaDiagnostico,
  HelpdeskMinutaDiagnosticoForm,
} from './HelpdeskMinutaDiagnosticoForm'

export function HelpdeskPanelTicketDetail({
  ticketId,
  teamMembers,
  onTicketUpdated,
  onTicketDeleted,
}: {
  ticketId: string
  teamMembers: HelpdeskTeamMemberDto[]
  onTicketUpdated: () => void
  onTicketDeleted: (deletedTicketId: string) => void
}) {
  const [ticket, setTicket] = useState<HelpdeskTicketDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [reunionTipo, setReunionTipo] = useState('Seguimiento')
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [slots, setSlots] = useState<{ fecha: string; hora: string; libre: boolean }[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<{ fecha: string; hora: string } | null>(null)
  const [minutaDrafts, setMinutaDrafts] = useState<Record<string, string>>({})
  const [minutaDiagnosticoDrafts, setMinutaDiagnosticoDrafts] = useState<
    Record<string, HelpdeskMinutaDiagnostico>
  >({})
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [savingMinutaId, setSavingMinutaId] = useState<string | null>(null)

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

  const getMinutaDiagnosticoDraft = (
    reunion: HelpdeskTicketDetail['reuniones'][number],
  ): HelpdeskMinutaDiagnostico => {
    const existing = minutaDiagnosticoDrafts[reunion.id]
    if (existing) return existing
    if (reunion.minutaDiagnostico) {
      return reunion.minutaDiagnostico
    }
    const facilitador =
      ticket?.asignadoNombre ??
      teamMembers.find((m) => m.id === ticket?.asignadoATeamId)?.nombre ??
      ''
    return createEmptyMinutaDiagnostico(reunion.fecha, facilitador)
  }

  const handleSaveMinutaTexto = async (reunionId: string, currentText: string) => {
    const texto = minutaDrafts[reunionId] ?? currentText
    setSavingMinutaId(reunionId)
    try {
      await patchHelpdeskReunionMinuta(ticketId, reunionId, { texto })
      await loadDetail()
      toast.success(texto.trim() ? 'Minuta guardada' : 'Minuta eliminada')
    } catch (err) {
      toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
    } finally {
      setSavingMinutaId(null)
    }
  }

  const handleConfirmDeleteProject = async () => {
    setDeleting(true)
    try {
      await deleteHelpdeskTicket(ticketId)
      toast.success('Proyecto eliminado')
      setDeleteModalOpen(false)
      onTicketDeleted(ticketId)
    } catch (err) {
      toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
    } finally {
      setDeleting(false)
    }
  }

  const handleSaveMinutaDiagnostico = async (reunionId: string) => {
    const reunion = ticket?.reuniones.find((r) => r.id === reunionId)
    if (!reunion) return
    const draft = getMinutaDiagnosticoDraft(reunion)
    setSavingMinutaId(reunionId)
    try {
      await patchHelpdeskReunionMinuta(ticketId, reunionId, {
        minutaDiagnostico: buildMinutaDiagnosticoPayload(draft),
      })
      await loadDetail()
      toast.success('Minuta de diagnóstico guardada')
    } catch (err) {
      toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
    } finally {
      setSavingMinutaId(null)
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
      <div
        className="before:pointer-events-none sticky top-0 z-10 -mx-4 -mt-4 space-y-2 border-b border-neutral-100 bg-white px-4 pb-4 pt-4 before:absolute before:inset-x-0 before:-top-5 before:h-5 before:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:before:bg-zinc-900 sm:-mx-5 sm:-mt-5 sm:px-5 sm:pt-5"
        data-testid="helpdesk-ticket-sticky-header"
      >
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
        <HelpdeskProblematicaText text={ticket.problematica} />
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
        <HelpdeskTicketTimeline
          estadoIdx={ticket.estadoIdx}
          editable
          disabled={busy}
          cancelado={ticket.cancelado === true}
          canceladoMotivo={ticket.canceladoMotivo}
          canceladoPor={ticket.canceladoPor}
          onChangeEstado={(idx) => void handleEstadoChange(idx)}
        />
      </section>

      <HelpdeskPanelCancelacion
        ticketId={ticketId}
        cancelado={ticket.cancelado === true}
        canceladoMotivo={ticket.canceladoMotivo}
        onUpdated={() => {
          void loadDetail()
          onTicketUpdated()
        }}
      />

      <HelpdeskPanelAnalisisSection
        ticketId={ticketId}
        estadoIdx={ticket.estadoIdx}
        cancelado={ticket.cancelado === true}
        analisis={ticket.analisis ?? []}
        onUpdated={() => {
          void loadDetail()
          onTicketUpdated()
        }}
      />

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

      <HelpdeskBitacoraSection ticketId={ticketId} estadoIdx={ticket.estadoIdx} mode="panel" />

      <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
        <h3 className="text-sm font-semibold text-heading">Reuniones</h3>
        {ticket.reuniones.length === 0 ? (
          <p className="mt-2 text-sm text-body-muted">Sin reuniones registradas.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {ticket.reuniones.map((reunion) => (
              <li
                key={reunion.id}
                className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950/60"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-brand-primary" aria-hidden />
                  <span className="font-medium">{reunion.tipo}</span>
                  <span className="text-body-muted">
                    {reunion.fecha} · {reunion.hora}
                  </span>
                  <span className="text-xs font-medium text-brand-primary">
                    {helpdeskReunionEstadoLabel(reunion.estado)}
                  </span>
                </div>
                <details className="mt-2" data-testid="helpdesk-reunion-minuta" open={reunion.tipo === HELPDESK_REUNION_TIPO_INICIAL}>
                  <summary className="cursor-pointer text-xs font-semibold text-brand-primary">
                    {reunion.tipo === HELPDESK_REUNION_TIPO_INICIAL
                      ? reunion.minutaDiagnostico
                        ? 'Ver o editar minuta de diagnóstico'
                        : 'Completar minuta de diagnóstico'
                      : reunion.minuta
                        ? 'Ver o editar minuta'
                        : 'Agregar minuta'}
                  </summary>
                  <div className="mt-3 space-y-3">
                    {reunion.tipo === HELPDESK_REUNION_TIPO_INICIAL ? (
                      <>
                        {reunion.minuta?.texto?.trim() ? (
                          <p className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                            Hay una minuta anterior en formato libre; se conservará visible para
                            referencia al guardar la nueva.
                          </p>
                        ) : null}
                        {reunion.minutaDiagnostico?.generadoPorIA ? (
                          <p
                            className="rounded-md border border-sky-200 bg-sky-50/90 px-3 py-2 text-xs text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100"
                            data-testid="helpdesk-minuta-ia-banner"
                          >
                            Borrador generado automáticamente a partir de la problemática — revisá y
                            completá antes de la reunión.
                          </p>
                        ) : null}
                        <HelpdeskMinutaDiagnosticoForm
                          areaNombre={ticket.areaNombre}
                          reunionFecha={reunion.fecha}
                          disabled={savingMinutaId === reunion.id}
                          value={getMinutaDiagnosticoDraft(reunion)}
                          onChange={(next) =>
                            setMinutaDiagnosticoDrafts((drafts) => ({
                              ...drafts,
                              [reunion.id]: next,
                            }))
                          }
                        />
                        <button
                          type="button"
                          disabled={savingMinutaId === reunion.id}
                          onClick={() => void handleSaveMinutaDiagnostico(reunion.id)}
                          data-testid="helpdesk-reunion-minuta-save"
                          className="btn-primary rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60"
                        >
                          {savingMinutaId === reunion.id ? 'Guardando…' : 'Guardar minuta'}
                        </button>
                      </>
                    ) : (
                      <>
                        <textarea
                          rows={4}
                          value={minutaDrafts[reunion.id] ?? reunion.minuta?.texto ?? ''}
                          onChange={(event) =>
                            setMinutaDrafts((drafts) => ({
                              ...drafts,
                              [reunion.id]: event.target.value,
                            }))
                          }
                          placeholder="Escribí la minuta de la reunión…"
                          data-testid="helpdesk-reunion-minuta-input"
                          className="input-brand-focus w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-heading dark:border-zinc-700 dark:bg-zinc-900"
                        />
                        {reunion.minuta ? (
                          <p className="text-xs text-body-muted">
                            Última edición: {reunion.minuta.autorNombre} ·{' '}
                            {formatHelpdeskDateTime(reunion.minuta.updatedAt)}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          disabled={savingMinutaId === reunion.id}
                          onClick={() =>
                            void handleSaveMinutaTexto(reunion.id, reunion.minuta?.texto ?? '')
                          }
                          data-testid="helpdesk-reunion-minuta-save"
                          className="btn-primary rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60"
                        >
                          {savingMinutaId === reunion.id ? 'Guardando…' : 'Guardar minuta'}
                        </button>
                      </>
                    )}
                  </div>
                </details>
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

      <section className="rounded-xl border border-red-200 bg-red-50/40 p-4 dark:border-red-900/40 dark:bg-red-950/20 sm:p-5">
        <h3 className="text-sm font-semibold text-red-900 dark:text-red-100">Zona de riesgo</h3>
        <p className="mt-1 text-sm text-red-800/90 dark:text-red-200/90">
          Eliminá el proyecto solo si fue creado por error o es un duplicado de prueba.
        </p>
        <button
          type="button"
          disabled={busy || deleting}
          onClick={() => setDeleteModalOpen(true)}
          data-testid="helpdesk-delete-project-open"
          className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-800 transition-colors hover:bg-red-100 disabled:opacity-60 dark:border-red-800 dark:bg-zinc-950 dark:text-red-200 dark:hover:bg-red-950/40"
        >
          Eliminar proyecto
        </button>
      </section>

      {deleteModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="helpdesk-delete-project-title"
          data-testid="helpdesk-delete-project-modal"
        >
          <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <h3 id="helpdesk-delete-project-title" className="text-lg font-semibold text-heading">
              ¿Seguro que querés eliminar este proyecto?
            </h3>
            <p className="mt-2 text-sm text-body-muted">
              Esta acción no se puede deshacer. Se borrarán reuniones, minutas, análisis, bitácora y
              el evento de calendario asociado.
            </p>
            <p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm font-medium text-heading dark:bg-zinc-950">
              {ticket.areaNombre}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteModalOpen(false)}
                className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-heading dark:border-zinc-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleConfirmDeleteProject()}
                data-testid="helpdesk-delete-project-confirm"
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
              >
                {deleting ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-body-muted">
        Estado actual: {HELPDESK_TICKET_ESTADOS[ticket.estadoIdx] ?? ticket.estado}
      </p>
    </div>
  )
}
