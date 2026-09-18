import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  LayoutDashboard,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context'
import { HelpdeskTicketTimeline } from '../components/helpdesk/HelpdeskTicketTimeline'
import {
  fetchTableroProyectos,
  type TableroProyectosTicketRow,
} from '../services/helpdeskTableroProyectosApi'

const AUTO_REFRESH_MS = 5 * 60 * 1000

type SectionFilter = 'todas' | 'en-curso' | 'cancelados' | 'finalizados'
type DetailSection = 'minuta' | 'analisis' | 'avances'

function urgenciaClass(urgencia: string): string {
  if (urgencia === 'alta') return 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200'
  if (urgencia === 'media')
    return 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100'
  return 'bg-neutral-100 text-neutral-700 dark:bg-zinc-800 dark:text-zinc-300'
}

function chipClass(active: boolean): string {
  return `rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
    active
      ? 'border-brand-primary bg-brand-primary text-white'
      : 'border-neutral-200 bg-white text-body hover:bg-neutral-50 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:bg-zinc-800'
  }`
}

function KpiCard({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        alert
          ? 'border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30'
          : 'border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-body-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-heading">{value}</p>
    </div>
  )
}

function availableDetailSections(row: TableroProyectosTicketRow): DetailSection[] {
  const sections: DetailSection[] = []
  if (row.estadoIdx >= 2 && row.minutaResumen) sections.push('minuta')
  if (row.estadoIdx >= 3 && row.analisisResumen) sections.push('analisis')
  if ((row.estadoIdx === 4 || row.estadoIdx === 5) && row.bitacoraResumen) sections.push('avances')
  return sections
}

function DetailPanelContent({ row, section }: { row: TableroProyectosTicketRow; section: DetailSection }) {
  if (section === 'minuta' && row.minutaResumen) {
    const { objetivoSesion, procesosResumen, procesosEvaluadosCount } = row.minutaResumen
    return (
      <div className="space-y-2 text-sm" data-testid="tablero-proyectos-panel-minuta">
        {objetivoSesion ? (
          <p className="text-body">{objetivoSesion}</p>
        ) : (
          <p className="text-body-muted">Sin objetivo de sesión registrado.</p>
        )}
        {procesosResumen ? (
          <p className="text-body-muted">{procesosResumen}</p>
        ) : procesosEvaluadosCount > 0 ? (
          <p className="text-body-muted">{procesosEvaluadosCount} proceso(s) evaluado(s)</p>
        ) : null}
      </div>
    )
  }
  if (section === 'analisis' && row.analisisResumen) {
    const { veredictos, iniciativasResumen, iniciativasTotal } = row.analisisResumen
    return (
      <div className="space-y-2 text-sm" data-testid="tablero-proyectos-panel-analisis">
        <p className="text-body">
          {iniciativasTotal} iniciativa(s): {veredictos.viable} viable · {veredictos.viableConCondiciones}{' '}
          con condiciones · {veredictos.noViable} no viable
        </p>
        {iniciativasResumen ? <p className="text-body">{iniciativasResumen}</p> : null}
      </div>
    )
  }
  if (section === 'avances' && row.bitacoraResumen) {
    const fecha = row.bitacoraResumen.fecha
      ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(row.bitacoraResumen.fecha),
        )
      : null
    return (
      <div className="space-y-1 text-sm" data-testid="tablero-proyectos-panel-avances">
        {fecha ? <p className="text-xs text-body-muted">{fecha}</p> : null}
        <p className="text-body">{row.bitacoraResumen.texto}</p>
      </div>
    )
  }
  return null
}

function EnCursoCard({
  row,
  cardCollapsed,
  onToggleCardCollapsed,
}: {
  row: TableroProyectosTicketRow
  cardCollapsed: boolean
  onToggleCardCollapsed: () => void
}) {
  const [openSection, setOpenSection] = useState<DetailSection | null>(null)
  const stale = row.diasSinActividad > 7
  const sections = availableDetailSections(row)

  const toggleSection = (section: DetailSection) => {
    setOpenSection((prev) => (prev === section ? null : section))
  }

  if (cardCollapsed) {
    return (
      <article
        className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900"
        data-testid="tablero-proyectos-card-en-curso"
        data-ticket-id={row.ticketId}
        data-collapsed="true"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="min-w-0 font-medium text-heading">
            {row.area}
            <span className="font-normal text-body-muted">
              {' '}
              · {row.estado ?? '—'} · {row.responsableNombre ?? 'Sin asignar'}
            </span>
          </p>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${urgenciaClass(row.urgencia)}`}
            >
              {row.urgencia}
            </span>
            <button
              type="button"
              onClick={onToggleCardCollapsed}
              className="rounded-lg p-1 text-body-muted hover:bg-neutral-100 dark:hover:bg-zinc-800"
              aria-label="Expandir tarjeta"
              data-testid="tablero-proyectos-card-expand"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      </article>
    )
  }

  return (
    <div className="space-y-0">
      <article
        className={`rounded-xl border bg-white p-4 dark:bg-zinc-900 ${
          stale
            ? 'border-amber-400 ring-1 ring-amber-200 dark:border-amber-600 dark:ring-amber-900'
            : 'border-neutral-200 dark:border-zinc-800'
        } ${openSection ? 'rounded-b-none border-b-0' : ''}`}
        data-testid="tablero-proyectos-card-en-curso"
        data-ticket-id={row.ticketId}
        data-collapsed="false"
      >
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-1 justify-end">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${urgenciaClass(row.urgencia)}`}
              >
                {row.urgencia}
              </span>
            </div>
            <button
              type="button"
              onClick={onToggleCardCollapsed}
              className="rounded-lg p-1 text-body-muted hover:bg-neutral-100 dark:hover:bg-zinc-800"
              aria-label="Colapsar tarjeta"
              data-testid="tablero-proyectos-card-collapse"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          </div>

          {sections.length > 0 ? (
            <div
              className="flex flex-wrap gap-1.5"
              role="tablist"
              aria-label="Detalle del proyecto"
              data-testid="tablero-proyectos-section-chips"
            >
              {sections.includes('minuta') ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={openSection === 'minuta'}
                  className={chipClass(openSection === 'minuta')}
                  onClick={() => toggleSection('minuta')}
                  data-testid="tablero-proyectos-chip-minuta"
                >
                  Minuta
                </button>
              ) : null}
              {sections.includes('analisis') ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={openSection === 'analisis'}
                  className={chipClass(openSection === 'analisis')}
                  onClick={() => toggleSection('analisis')}
                  data-testid="tablero-proyectos-chip-analisis"
                >
                  Análisis
                </button>
              ) : null}
              {sections.includes('avances') ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={openSection === 'avances'}
                  className={chipClass(openSection === 'avances')}
                  onClick={() => toggleSection('avances')}
                  data-testid="tablero-proyectos-chip-avances"
                >
                  Avances
                </button>
              ) : null}
            </div>
          ) : null}

          <div>
            <h3 className="font-semibold text-heading">{row.area}</h3>
            <p className="mt-0.5 text-xs text-body-muted">
              Responsable: {row.responsableNombre ?? 'Sin asignar'}
            </p>
          </div>
        </div>

        {stale ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {row.diasSinActividad} días sin actividad
          </p>
        ) : null}

        <div className="mt-4">
          <HelpdeskTicketTimeline estadoIdx={row.estadoIdx} />
        </div>
      </article>

      {openSection ? (
        <div
          className="rounded-b-xl border border-t-0 border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
          data-testid="tablero-proyectos-detail-panel"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-body-muted">
            {openSection === 'minuta' ? 'Minuta' : openSection === 'analisis' ? 'Análisis' : 'Avances'}
          </p>
          <DetailPanelContent row={row} section={openSection} />
        </div>
      ) : null}
    </div>
  )
}

function FinalizadoCard({
  row,
  cardCollapsed,
  onToggleCardCollapsed,
}: {
  row: TableroProyectosTicketRow
  cardCollapsed: boolean
  onToggleCardCollapsed: () => void
}) {
  const fecha = row.finalizadoAt
    ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(row.finalizadoAt))
    : '—'

  if (cardCollapsed) {
    return (
      <article
        className="rounded-lg border border-neutral-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900"
        data-testid="tablero-proyectos-card-finalizado"
      >
        <div className="flex items-center justify-between gap-2 text-sm">
          <p className="font-medium text-heading">
            {row.area} · Finalizado ~{fecha}
          </p>
          <button
            type="button"
            onClick={onToggleCardCollapsed}
            aria-label="Expandir"
            className="p-1 text-body-muted"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </article>
    )
  }

  return (
    <article
      className="rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
      data-testid="tablero-proyectos-card-finalizado"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-heading">{row.area}</p>
          <p className="mt-1 text-sm text-body-muted">
            Finalizado ~{fecha} · {row.responsableNombre ?? 'Sin asignar'}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleCardCollapsed}
          aria-label="Colapsar"
          className="p-1 text-body-muted"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>
    </article>
  )
}

const SECTION_TABS: { id: SectionFilter; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'en-curso', label: 'En curso' },
  { id: 'finalizados', label: 'Finalizados' },
  { id: 'cancelados', label: 'Cancelados' },
]

export function DesarrolloProyectosBoard() {
  const { user } = useAuth()
  const [areaFilter, setAreaFilter] = useState('')
  const [responsableFilter, setResponsableFilter] = useState('')
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('todas')
  const [collapsedTicketIds, setCollapsedTicketIds] = useState<Set<string>>(() => new Set())

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['helpdesk', 'tablero-proyectos'],
    queryFn: fetchTableroProyectos,
    enabled: Boolean(user),
    refetchInterval: AUTO_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: (failureCount, err) => {
      if (err instanceof Error && err.message === 'No autenticado') return failureCount < 2
      return failureCount < 1
    },
  })

  const tickets = data?.tickets ?? []

  const areas = useMemo(
    () => [...new Set(tickets.map((t) => t.area))].sort((a, b) => a.localeCompare(b, 'es')),
    [tickets],
  )
  const responsables = useMemo(
    () =>
      [...new Set(tickets.map((t) => t.responsableNombre).filter(Boolean) as string[])].sort((a, b) =>
        a.localeCompare(b, 'es'),
      ),
    [tickets],
  )

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (areaFilter && t.area !== areaFilter) return false
      if (responsableFilter && t.responsableNombre !== responsableFilter) return false
      return true
    })
  }, [tickets, areaFilter, responsableFilter])

  const enCurso = filtered.filter((t) => !t.cancelado && t.estadoIdx < 5)
  const finalizados = filtered.filter((t) => !t.cancelado && t.estadoIdx === 5)
  const cancelados = filtered.filter((t) => t.cancelado)

  const urgentesActivos = enCurso.filter((t) => t.urgencia === 'alta').length
  const sinActividad7 = enCurso.filter((t) => t.diasSinActividad > 7).length

  const toggleTicketCollapsed = useCallback((ticketId: string) => {
    setCollapsedTicketIds((prev) => {
      const next = new Set(prev)
      if (next.has(ticketId)) next.delete(ticketId)
      else next.add(ticketId)
      return next
    })
  }, [])

  const setSectionCollapsed = useCallback((ids: string[], collapse: boolean) => {
    setCollapsedTicketIds((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (collapse) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }, [])

  const showEnCurso = sectionFilter === 'todas' || sectionFilter === 'en-curso'
  const showFinalizados = sectionFilter === 'todas' || sectionFilter === 'finalizados'
  const showCancelados = sectionFilter === 'todas' || sectionFilter === 'cancelados'

  const enCursoAllCollapsed =
    enCurso.length > 0 && enCurso.every((t) => collapsedTicketIds.has(t.ticketId))
  const finalizadosAllCollapsed =
    finalizados.length > 0 && finalizados.every((t) => collapsedTicketIds.has(t.ticketId))

  const lastUpdatedLabel = dataUpdatedAt
    ? new Intl.DateTimeFormat('es-AR', { timeStyle: 'short' }).format(new Date(dataUpdatedAt))
    : null

  return (
    <div className="min-w-0 space-y-8 pb-12" data-testid="tablero-desarrollo-proyectos-page">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-zinc-400">
            Tableros · Desarrollo
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <LayoutDashboard className="h-7 w-7 text-brand-primary" aria-hidden />
            Desarrollo · Proyectos
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-body-muted">
            Vista de solo lectura de proyectos de mesa de ayuda en curso, finalizados y cancelados.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
            data-testid="tablero-proyectos-refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden />
            Actualizar
          </button>
          {lastUpdatedLabel ? (
            <span className="text-xs text-body-muted">Última carga: {lastUpdatedLabel}</span>
          ) : null}
          <Link
            to="/tableros"
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            ← Todos los tableros
          </Link>
        </div>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-body-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando proyectos…
        </div>
      ) : isError ? (
        <div
          className="rounded-xl alert-error px-4 py-6 text-sm"
          data-testid="tablero-proyectos-access-denied"
        >
          {error instanceof Error ? error.message : 'No se pudo cargar el tablero'}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="En curso" value={enCurso.length} />
            <KpiCard label="Urgentes activos" value={urgentesActivos} />
            <KpiCard label="Cancelados" value={cancelados.length} />
            <KpiCard label="Sin actividad &gt; 7 días" value={sinActividad7} alert={sinActividad7 > 0} />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-body-muted">Área</span>
              <select
                value={areaFilter}
                onChange={(e) => setAreaFilter(e.target.value)}
                className="input-brand-focus min-w-[10rem] rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Todas</option>
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-body-muted">Responsable</span>
              <select
                value={responsableFilter}
                onChange={(e) => setResponsableFilter(e.target.value)}
                className="input-brand-focus min-w-[10rem] rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Todos</option>
                {responsables.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <div className="text-sm">
              <span className="mb-1 block font-medium text-body-muted">Sección</span>
              <div
                className="flex flex-wrap gap-1 rounded-lg border border-neutral-200 p-1 dark:border-zinc-700"
                role="tablist"
                aria-label="Filtrar sección"
                data-testid="tablero-proyectos-section-filter"
              >
                {SECTION_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={sectionFilter === tab.id}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                      sectionFilter === tab.id
                        ? 'bg-brand-primary text-white'
                        : 'text-body-muted hover:bg-neutral-100 dark:hover:bg-zinc-800'
                    }`}
                    onClick={() => setSectionFilter(tab.id)}
                    data-testid={`tablero-proyectos-section-${tab.id}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {showEnCurso ? (
            <section data-testid="tablero-proyectos-seccion-en-curso">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-heading">En curso</h2>
                  <p className="text-sm text-body-muted">Estados activos (hasta implementación inclusive).</p>
                </div>
                {enCurso.length > 0 ? (
                  <button
                    type="button"
                    className="text-sm font-medium text-brand-primary hover:underline"
                    onClick={() =>
                      setSectionCollapsed(
                        enCurso.map((t) => t.ticketId),
                        !enCursoAllCollapsed,
                      )
                    }
                    data-testid="tablero-proyectos-toggle-en-curso"
                  >
                    {enCursoAllCollapsed ? 'Expandir todas' : 'Colapsar todas'}
                  </button>
                ) : null}
              </div>
              {enCurso.length === 0 ? (
                <p className="mt-4 text-sm text-body-muted">No hay proyectos en curso con estos filtros.</p>
              ) : (
                <ul className="mt-4 grid gap-4 lg:grid-cols-2">
                  {enCurso.map((row) => (
                    <li key={row.ticketId}>
                      <EnCursoCard
                        row={row}
                        cardCollapsed={collapsedTicketIds.has(row.ticketId)}
                        onToggleCardCollapsed={() => toggleTicketCollapsed(row.ticketId)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {showFinalizados ? (
            <section data-testid="tablero-proyectos-seccion-finalizados">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-heading">Finalizados</h2>
                {finalizados.length > 0 ? (
                  <button
                    type="button"
                    className="text-sm font-medium text-brand-primary hover:underline"
                    onClick={() =>
                      setSectionCollapsed(
                        finalizados.map((t) => t.ticketId),
                        !finalizadosAllCollapsed,
                      )
                    }
                  >
                    {finalizadosAllCollapsed ? 'Expandir todas' : 'Colapsar todas'}
                  </button>
                ) : null}
              </div>
              {finalizados.length === 0 ? (
                <p className="mt-2 text-sm text-body-muted">Ningún proyecto finalizado.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {finalizados.map((row) => (
                    <li key={row.ticketId}>
                      <FinalizadoCard
                        row={row}
                        cardCollapsed={collapsedTicketIds.has(row.ticketId)}
                        onToggleCardCollapsed={() => toggleTicketCollapsed(row.ticketId)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {showCancelados ? (
            <section data-testid="tablero-proyectos-seccion-cancelados">
              <h2 className="text-lg font-semibold text-heading">Cancelados ({cancelados.length})</h2>
              {cancelados.length === 0 ? (
                <p className="mt-2 text-sm text-body-muted">Ningún proyecto cancelado.</p>
              ) : (
                <ul className="mt-3 space-y-2 rounded-xl border border-neutral-200 px-4 py-3 dark:border-zinc-800">
                  {cancelados.map((row) => (
                    <li key={row.ticketId} className="text-sm text-body-muted">
                      {row.area} · {row.responsableNombre ?? 'Sin asignar'}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
