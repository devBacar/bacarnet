import { CalendarDays, Loader2, Mail } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { HelpdeskTicketNovedades, HelpdeskVistoSeccion } from '../../services/helpdeskApi'
import toast from 'react-hot-toast'
import { HELPDESK_TICKET_ESTADOS } from '../../constants/helpdeskEstados'
import { HELPDESK_REUNION_TIPO_INICIAL } from '../../constants/helpdeskReunion'
import {
  deleteHelpdeskTicket,
  fetchDisponibilidadTeamMember,
  fetchHelpdeskTicketDetail,
  HelpdeskApiError,
  HELPDESK_GENERIC_ERROR_MESSAGE,
  patchHelpdeskReunionMinuta,
  patchHelpdeskTicketAsignado,
  patchHelpdeskTicketEstado,
  patchHelpdeskTicketVistoPor,
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
import {
  helpdeskEmailLogSourceLabel,
  helpdeskEmailLogTipoLabel,
} from './helpdeskEmailLogUi'
import { HelpdeskProblematicaText } from './HelpdeskProblematicaText'
import { HelpdeskSlotGrid } from './HelpdeskSlotGrid'
import { HelpdeskBitacoraSection } from './HelpdeskBitacoraSection'
import { HelpdeskColaboradoresSistemas } from './HelpdeskColaboradoresSistemas'
import { HelpdeskPanelAnalisisSection } from './HelpdeskPanelAnalisisSection'
import { HelpdeskPanelCancelacion } from './HelpdeskPanelCancelacion'
import { HelpdeskPanelSectionCollapsible } from './HelpdeskPanelSectionCollapsible'
import { HelpdeskTicketTimeline } from './HelpdeskTicketTimeline'
import { buildMinutaDiagnosticoPayload } from './HelpdeskMinutaDiagnosticoForm'
import { HelpdeskMinutaSimpleForm } from './HelpdeskMinutaSimpleForm'
import { HelpdeskPanelModal } from './HelpdeskPanelModal'
import { HelpdeskProyectoEquipoStrip } from './HelpdeskProyectoEquipoStrip'
import { HelpdeskReunionMinutaBlock } from './HelpdeskReunionMinutaBlock'
import {
  createMinutaSimpleBase,
  diagnosticoFromMinutaSimple,
  emptyHelpdeskMinutaSimple,
  minutaSimpleFromDiagnostico,
  type HelpdeskMinutaSimple,
} from './helpdeskMinutaSimple'

type HelpdeskPanelSectionKey =
  | 'problematica'
  | 'seguimiento'
  | 'analisis'
  | 'reuniones'
  | 'bitacora'
  | 'correos'
  | 'riesgo'

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
  const [minutaSimpleDrafts, setMinutaSimpleDrafts] = useState<
    Record<string, HelpdeskMinutaSimple>
  >({})
  const [openSection, setOpenSection] = useState<HelpdeskPanelSectionKey | null>(null)
  const [equipoModalOpen, setEquipoModalOpen] = useState(false)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [estadoManualModalOpen, setEstadoManualModalOpen] = useState(false)
  const [estadoManualIdx, setEstadoManualIdx] = useState(0)
  const [minutaModalReunionId, setMinutaModalReunionId] = useState<string | null>(null)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [savingMinutaId, setSavingMinutaId] = useState<string | null>(null)
  const [novedades, setNovedades] = useState<HelpdeskTicketNovedades | null>(null)

  const markSeccionVista = useCallback(
    (seccion: HelpdeskVistoSeccion) => {
      setNovedades((prev) => (prev ? { ...prev, [seccion]: false } : prev))
      void patchHelpdeskTicketVistoPor(ticketId, seccion).catch(() => {
        /* silencioso: el detalle se refresca al recargar */
      })
    },
    [ticketId],
  )

  const detailLoadedOnceRef = useRef(false)

  const loadDetail = useCallback(async () => {
    const showBlockingLoader = !detailLoadedOnceRef.current
    if (showBlockingLoader) setLoading(true)
    try {
      const data = await fetchHelpdeskTicketDetail(ticketId)
      setTicket(data.ticket)
      setNovedades(data.novedades)
      detailLoadedOnceRef.current = true
    } catch (err) {
      const message =
        err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE
      toast.error(message)
      setTicket(null)
      detailLoadedOnceRef.current = false
    } finally {
      if (showBlockingLoader) setLoading(false)
    }
  }, [ticketId])

  useEffect(() => {
    detailLoadedOnceRef.current = false
    setOpenSection(null)
    setMinutaModalReunionId(null)
    void loadDetail()
  }, [ticketId, loadDetail])

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
    if ((showSchedule || scheduleModalOpen) && ticket?.asignadoATeamId) {
      void loadSlots()
    }
  }, [showSchedule, scheduleModalOpen, ticket?.asignadoATeamId, loadSlots])

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
      setScheduleModalOpen(false)
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

  const getMinutaSimpleDraft = (
    reunion: HelpdeskTicketDetail['reuniones'][number],
  ): HelpdeskMinutaSimple => {
    const existing = minutaSimpleDrafts[reunion.id]
    if (existing) return existing
    if (reunion.minutaDiagnostico) {
      return minutaSimpleFromDiagnostico(reunion.minutaDiagnostico, ticket?.areaNombre ?? '')
    }
    return emptyHelpdeskMinutaSimple(ticket?.areaNombre ?? '')
  }

  const sectionAccordion = (key: HelpdeskPanelSectionKey) => ({
    open: openSection === key,
    onOpenChange: (open: boolean) => setOpenSection(open ? key : null),
  })

  const handleSaveMinutaTexto = async (reunionId: string, currentText: string) => {
    const texto = minutaDrafts[reunionId] ?? currentText
    setSavingMinutaId(reunionId)
    try {
      await patchHelpdeskReunionMinuta(ticketId, reunionId, { texto })
      await loadDetail()
      setMinutaModalReunionId(null)
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
    if (!reunion || !ticket) return
    const simple = getMinutaSimpleDraft(reunion)
    if (!simple.analisisConversacion.trim()) {
      toast.error('Completá el análisis de lo conversado en la reunión')
      return
    }
    if (!simple.procesosActuales.trim() && !simple.problemasDetectados.trim()) {
      toast.error('Indicá los procesos actuales o los problemas detectados')
      return
    }
    const facilitador =
      ticket.asignadoNombre ??
      teamMembers.find((m) => m.id === ticket.asignadoATeamId)?.nombre ??
      'Facilitador'
    const base = createMinutaSimpleBase(reunion.fecha, facilitador)
    const draft = buildMinutaDiagnosticoPayload(
      diagnosticoFromMinutaSimple(simple, base, ticket.areaNombre),
    )
    setSavingMinutaId(reunionId)
    try {
      await patchHelpdeskReunionMinuta(ticketId, reunionId, {
        minutaDiagnostico: draft,
      })
      await loadDetail()
      setMinutaModalReunionId(null)
      toast.success('Minuta guardada')
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

  const analisisList = ticket.analisis ?? []
  const hasPendienteAnalisis = analisisList.some((a) => a.estado === 'pendiente')
  const showAnalisisSection = ticket.estadoIdx === 2 || analisisList.length > 0
  const bitacoraVisible = ticket.estadoIdx >= 3 && ticket.estadoIdx <= 5

  const problemSummary = (() => {
    const t = ticket.problematica.trim().replace(/\s+/g, ' ')
    if (!t) return 'Sin descripción'
    return t.length > 100 ? `${t.slice(0, 99)}…` : t
  })()

  const reunionesSummary =
    ticket.reuniones.length === 0
      ? 'Sin reuniones registradas'
      : `${ticket.reuniones.length} reunión(es) · ${ticket.reuniones[ticket.reuniones.length - 1]?.tipo ?? ''}`

  const colaboradores = ticket.colaboradoresSistemas ?? []
  const equipoResumen =
    colaboradores.length > 0
      ? `${assigneeLabel} + ${colaboradores.length} colaborador(es)`
      : assigneeLabel
  const seguimientoSummary = `${HELPDESK_TICKET_ESTADOS[ticket.estadoIdx] ?? ticket.estado} · ${equipoResumen}`

  const minutaModalReunion =
    minutaModalReunionId != null
      ? ticket.reuniones.find((r) => r.id === minutaModalReunionId) ?? null
      : null

  return (
    <div className="space-y-3" data-testid="helpdesk-mesa-detail">
      <div
        className="flex flex-wrap items-start justify-between gap-2 border-b border-neutral-100 pb-3 dark:border-zinc-800"
        data-testid="helpdesk-ticket-sticky-header"
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Ticket</p>
          <h2 className="text-lg font-semibold text-heading sm:text-xl">{ticket.areaNombre}</h2>
          <p className="mt-1 text-xs text-body-muted sm:text-sm">
            {ticket.requesterNombre} · {ticket.requesterEmail}
          </p>
          <p className="text-xs text-body-muted">{formatHelpdeskDateTime(ticket.createdAt)}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase sm:px-3 sm:py-1 sm:text-xs ${helpdeskUrgenciaBadgeClass(ticket.urgencia)}`}
          >
            {helpdeskUrgenciaLabel(ticket.urgencia)}
          </span>
          <p
            className="max-w-[14rem] text-right text-[11px] font-medium leading-snug text-brand-primary sm:max-w-xs sm:text-xs"
            data-testid="helpdesk-ticket-header-estado"
          >
            {HELPDESK_TICKET_ESTADOS[ticket.estadoIdx] ?? ticket.estado}
          </p>
        </div>
      </div>

      <HelpdeskPanelSectionCollapsible
        title="Problemática"
        summary={problemSummary}
        testId="helpdesk-mesa-problematica"
        {...sectionAccordion('problematica')}
      >
        <HelpdeskProblematicaText text={ticket.problematica} />
      </HelpdeskPanelSectionCollapsible>

      <HelpdeskPanelSectionCollapsible
        title="Seguimiento"
        summary={seguimientoSummary}
        testId="helpdesk-mesa-seguimiento"
        showNovedad={novedades?.seguimiento === true}
        novedadSeccion="seguimiento"
        onSectionOpened={() => markSeccionVista('seguimiento')}
        {...sectionAccordion('seguimiento')}
      >
        <HelpdeskTicketTimeline
          estadoIdx={ticket.estadoIdx}
          editable
          disabled={busy}
          cancelado={ticket.cancelado === true}
          canceladoMotivo={ticket.canceladoMotivo}
          canceladoPor={ticket.canceladoPor}
          showCanceledBanner={false}
          onChangeEstado={(idx) => void handleEstadoChange(idx)}
          onOpenManualEstado={() => {
            setEstadoManualIdx(ticket.estadoIdx)
            setEstadoManualModalOpen(true)
          }}
        />
        <HelpdeskProyectoEquipoStrip
          responsableNombre={assigneeLabel}
          colaboradores={colaboradores}
          disabled={busy}
          onManage={() => setEquipoModalOpen(true)}
        />
      </HelpdeskPanelSectionCollapsible>

      {showAnalisisSection ? (
        <HelpdeskPanelSectionCollapsible
          title="Análisis del proyecto"
          badge={analisisList.length}
          summary={
            hasPendienteAnalisis
              ? 'Hay análisis pendiente de aprobación'
              : analisisList.length > 0
                ? `${analisisList.length} documento(s) cargado(s)`
                : 'Listo para subir análisis'
          }
          testId="helpdesk-mesa-analisis"
          showNovedad={novedades?.analisis === true}
          novedadSeccion="analisis"
          onSectionOpened={() => markSeccionVista('analisis')}
          {...sectionAccordion('analisis')}
        >
          <HelpdeskPanelAnalisisSection
            embedded
            ticketId={ticketId}
            estadoIdx={ticket.estadoIdx}
            cancelado={ticket.cancelado === true}
            analisis={analisisList}
            onUpdated={() => {
              void loadDetail()
              onTicketUpdated()
            }}
          />
        </HelpdeskPanelSectionCollapsible>
      ) : null}

      <HelpdeskPanelSectionCollapsible
        title="Reuniones"
        badge={ticket.reuniones.length}
        summary={reunionesSummary}
        testId="helpdesk-mesa-reuniones"
        showNovedad={novedades?.reuniones === true}
        novedadSeccion="reuniones"
        onSectionOpened={() => markSeccionVista('reuniones')}
        {...sectionAccordion('reuniones')}
      >
        <h3 className="sr-only">Reuniones</h3>
        {ticket.reuniones.length === 0 ? (
          <p className="text-sm text-body-muted">Sin reuniones registradas.</p>
        ) : (
          <ul className="space-y-3">
            {ticket.reuniones.map((reunion) => (
              <li
                key={reunion.id}
                className="rounded-xl border border-neutral-100 bg-neutral-50/80 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/50"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <CalendarDays className="h-4 w-4 shrink-0 text-brand-primary" aria-hidden />
                  <span className="font-semibold text-heading">{reunion.tipo}</span>
                  <span className="text-sm text-body-muted">
                    {reunion.fecha} · {reunion.hora}
                  </span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-primary dark:bg-zinc-900">
                    {helpdeskReunionEstadoLabel(reunion.estado)}
                  </span>
                </div>
                <HelpdeskReunionMinutaBlock
                  reunion={reunion}
                  areaNombre={ticket.areaNombre}
                  onOpenMinutaModal={() => setMinutaModalReunionId(reunion.id)}
                />
              </li>
            ))}
          </ul>
        )}

        {!ticket.asignadoATeamId ? (
          <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
            Asigná un responsable (Seguimiento → Gestionar equipo) antes de agendar.
          </p>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setShowSchedule(true)
              setScheduleModalOpen(true)
            }}
            data-testid="helpdesk-mesa-agendar-reunion-open"
            className="btn-primary mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-semibold sm:w-auto"
          >
            Agendar nueva reunión
          </button>
        )}
      </HelpdeskPanelSectionCollapsible>

      {bitacoraVisible ? (
        <HelpdeskPanelSectionCollapsible
          title="Bitácora del proyecto"
          summary="Avances y comentarios del área"
          testId="helpdesk-mesa-bitacora"
          showNovedad={novedades?.bitacora === true}
          novedadSeccion="bitacora"
          onSectionOpened={() => markSeccionVista('bitacora')}
          {...sectionAccordion('bitacora')}
        >
          <HelpdeskBitacoraSection
            embedded
            ticketId={ticketId}
            estadoIdx={ticket.estadoIdx}
            mode="panel"
          />
        </HelpdeskPanelSectionCollapsible>
      ) : null}

      <HelpdeskPanelSectionCollapsible
        title="Correos enviados"
        badge={ticket.emailLog.length}
        summary={
          ticket.emailLog.length === 0
            ? 'Sin registros'
            : `${ticket.emailLog.length} correo(s) registrado(s)`
        }
        testId="helpdesk-mesa-correos"
        showNovedad={novedades?.correos === true}
        novedadSeccion="correos"
        onSectionOpened={() => markSeccionVista('correos')}
        {...sectionAccordion('correos')}
      >
        {ticket.emailLog.length === 0 ? (
          <p className="text-sm text-body-muted">Sin registros de correo para este ticket.</p>
        ) : (
          <ul className="space-y-2">
            {ticket.emailLog.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-neutral-100 bg-neutral-50/80 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950/40"
                data-testid="helpdesk-email-log-row"
                data-email-log-tipo={row.tipo}
              >
                <div className="flex items-start gap-2">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-body-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-heading">
                      {helpdeskEmailLogTipoLabel(row.tipo)}
                    </p>
                    <p className="mt-0.5 text-xs text-body-muted">
                      {formatHelpdeskDateTime(row.fecha)} ·{' '}
                      {helpdeskEmailLogSourceLabel(row.source)}
                    </p>
                    <p className="mt-1 text-sm text-body-muted">{row.destinatarios.join(', ')}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </HelpdeskPanelSectionCollapsible>

      <HelpdeskPanelSectionCollapsible
        title="Zona de riesgo"
        summary="Cancelar o eliminar proyecto"
        testId="helpdesk-mesa-zona-riesgo"
        {...sectionAccordion('riesgo')}
      >
        <HelpdeskPanelCancelacion
          embedded
          embeddedInRiskZone
          ticketId={ticketId}
          cancelado={ticket.cancelado === true}
          canceladoMotivo={ticket.canceladoMotivo}
          canceladoPor={ticket.canceladoPor}
          onUpdated={() => {
            void loadDetail()
            onTicketUpdated()
          }}
        />
        <div
          className="mt-6 border-t border-red-100 pt-5 dark:border-red-950/50"
          data-testid="helpdesk-zona-riesgo-eliminar"
        >
          <h3 className="text-sm font-semibold text-heading">Eliminar proyecto</h3>
          <p className="mt-1 text-sm text-red-800/90 dark:text-red-200/90">
            Eliminá el proyecto solo si fue creado por error o es un duplicado de prueba. Esta acción
            es irreversible.
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
        </div>
      </HelpdeskPanelSectionCollapsible>

      <HelpdeskPanelModal
        open={equipoModalOpen}
        title="Equipo del proyecto"
        titleId="helpdesk-equipo-modal-title"
        testId="helpdesk-mesa-equipo-modal"
        onClose={() => setEquipoModalOpen(false)}
        footer={
          <button
            type="button"
            onClick={() => setEquipoModalOpen(false)}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Listo
          </button>
        }
      >
        <label className="block text-xs font-semibold uppercase tracking-wide text-body-muted">
          Responsable
          <select
            value={ticket.asignadoATeamId ?? ''}
            disabled={busy}
            onChange={(e) => void handleAsignadoChange(e.target.value)}
            className="input-brand-focus mt-2 block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-heading dark:border-zinc-700 dark:bg-zinc-950"
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
        <HelpdeskColaboradoresSistemas
          ticketId={ticketId}
          asignadoATeamId={ticket.asignadoATeamId}
          colaboradores={ticket.colaboradoresSistemas ?? []}
          teamMembers={teamMembers}
          embedded
          onUpdated={() => {
            void loadDetail()
            onTicketUpdated()
          }}
        />
      </HelpdeskPanelModal>

      <HelpdeskPanelModal
        open={estadoManualModalOpen}
        title="Cambiar etapa del pedido"
        titleId="helpdesk-estado-modal-title"
        testId="helpdesk-ticket-estado-modal"
        onClose={() => setEstadoManualModalOpen(false)}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setEstadoManualModalOpen(false)}
              className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium dark:border-zinc-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  await handleEstadoChange(estadoManualIdx)
                  setEstadoManualModalOpen(false)
                })()
              }}
              className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              Aplicar etapa
            </button>
          </div>
        }
      >
        <p className="mb-3 text-sm text-body-muted">
          Elegí la etapa que corresponde hoy. Para avanzar de a un paso usá los botones del
          seguimiento.
        </p>
        <label className="block text-sm font-medium text-heading">
          Etapa
          <select
            value={estadoManualIdx}
            disabled={busy || ticket.cancelado === true}
            onChange={(e) => setEstadoManualIdx(Number.parseInt(e.target.value, 10))}
            className="input-brand-focus mt-2 block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            data-testid="helpdesk-ticket-estado-select"
          >
            {HELPDESK_TICKET_ESTADOS.map((label, index) => (
              <option key={label} value={index}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </HelpdeskPanelModal>

      <HelpdeskPanelModal
        open={scheduleModalOpen}
        title="Agendar reunión"
        titleId="helpdesk-agendar-modal-title"
        testId="helpdesk-mesa-agendar-reunion-modal"
        onClose={() => {
          setScheduleModalOpen(false)
          setShowSchedule(false)
        }}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setScheduleModalOpen(false)
                setShowSchedule(false)
              }}
              className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium dark:border-zinc-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy || !selectedSlot}
              onClick={() => void handleConfirmReunion()}
              className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              Confirmar reunión
            </button>
          </div>
        }
      >
        <label className="block text-sm font-medium text-heading">
          Tipo de reunión
          <input
            value={reunionTipo}
            onChange={(e) => setReunionTipo(e.target.value)}
            className="input-brand-focus mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <div className="mt-4">
          <HelpdeskSlotGrid
            slots={slots}
            semanaOffset={semanaOffset}
            loading={slotsLoading}
            selectedSlot={selectedSlot}
            onSelectSlot={setSelectedSlot}
            onNextWeek={() => setSemanaOffset((o) => o + 1)}
          />
        </div>
      </HelpdeskPanelModal>

      {minutaModalReunion ? (
        <HelpdeskPanelModal
          open
          title={`Minuta · ${minutaModalReunion.tipo}`}
          titleId="helpdesk-minuta-modal-title"
          testId="helpdesk-reunion-minuta-modal"
          onClose={() => setMinutaModalReunionId(null)}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={savingMinutaId === minutaModalReunion.id}
                onClick={() => setMinutaModalReunionId(null)}
                className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium dark:border-zinc-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingMinutaId === minutaModalReunion.id}
                onClick={() =>
                  minutaModalReunion.tipo === HELPDESK_REUNION_TIPO_INICIAL
                    ? void handleSaveMinutaDiagnostico(minutaModalReunion.id)
                    : void handleSaveMinutaTexto(
                        minutaModalReunion.id,
                        minutaModalReunion.minuta?.texto ?? '',
                      )
                }
                data-testid="helpdesk-reunion-minuta-save"
                className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {savingMinutaId === minutaModalReunion.id ? 'Guardando…' : 'Guardar minuta'}
              </button>
            </div>
          }
        >
          {minutaModalReunion.tipo === HELPDESK_REUNION_TIPO_INICIAL ? (
            <>
              {minutaModalReunion.minutaDiagnostico?.generadoPorIA ? (
                <p
                  className="mb-3 rounded-md border border-sky-200 bg-sky-50/90 px-3 py-2 text-xs text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100"
                  data-testid="helpdesk-minuta-ia-banner"
                >
                  Hay un borrador automático: revisá el texto y guardá.
                </p>
              ) : null}
              <HelpdeskMinutaSimpleForm
                disabled={savingMinutaId === minutaModalReunion.id}
                value={getMinutaSimpleDraft(minutaModalReunion)}
                onChange={(next) =>
                  setMinutaSimpleDrafts((drafts) => ({
                    ...drafts,
                    [minutaModalReunion.id]: next,
                  }))
                }
              />
            </>
          ) : (
            <textarea
              rows={8}
              value={minutaDrafts[minutaModalReunion.id] ?? minutaModalReunion.minuta?.texto ?? ''}
              onChange={(event) =>
                setMinutaDrafts((drafts) => ({
                  ...drafts,
                  [minutaModalReunion.id]: event.target.value,
                }))
              }
              placeholder="Resumen de acuerdos, decisiones y próximos pasos…"
              data-testid="helpdesk-reunion-minuta-input"
              className="input-brand-focus w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-heading dark:border-zinc-700 dark:bg-zinc-900"
            />
          )}
        </HelpdeskPanelModal>
      ) : null}

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
    </div>
  )
}
