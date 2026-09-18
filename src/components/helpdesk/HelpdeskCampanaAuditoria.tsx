import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, Download, Loader2, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { HelpdeskCampanaAuditoriaTable } from './HelpdeskCampanaAuditoriaTable'
import { formatHelpdeskDateTime } from './helpdeskUi'
import {
  downloadCampanaAuditoriaPdf,
  fetchCampanaArchivoById,
  fetchCampanaArchivos,
  fetchCampanaAuditoria,
  HelpdeskApiError,
  postCampanaArchivar,
  type HelpdeskCampanaArchivoDetail,
  type HelpdeskCampanaArchivoListItem,
  type HelpdeskCampanaAuditoriaRow,
} from '../../services/helpdeskApi'

function sortByEnviadoDesc(rows: HelpdeskCampanaAuditoriaRow[]): HelpdeskCampanaAuditoriaRow[] {
  return [...rows].sort((a, b) => {
    const aTime = a.fecha_envio ? new Date(a.fecha_envio).getTime() : 0
    const bTime = b.fecha_envio ? new Date(b.fecha_envio).getTime() : 0
    return bTime - aTime
  })
}

function triggerPdfDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

type ViewMode = 'live' | 'archived'

export function HelpdeskCampanaAuditoria() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<HelpdeskCampanaAuditoriaRow[]>([])
  const [pdfLoading, setPdfLoading] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const [archivos, setArchivos] = useState<HelpdeskCampanaArchivoListItem[]>([])
  const [archivosLoading, setArchivosLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('live')
  const [selectedAnio, setSelectedAnio] = useState<number | ''>('')
  const [selectedMes, setSelectedMes] = useState<number | ''>('')
  const [selectedArchivoId, setSelectedArchivoId] = useState<string | null>(null)
  const [archivedDetail, setArchivedDetail] = useState<HelpdeskCampanaArchivoDetail | null>(null)
  const [archivedLoading, setArchivedLoading] = useState(false)

  const loadLive = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const data = await fetchCampanaAuditoria()
      setRows(Array.isArray(data.rows) ? data.rows : [])
    } catch (err) {
      setError(
        err instanceof HelpdeskApiError
          ? err.message
          : 'No se pudo obtener el estado de la campaña, intentá de nuevo',
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const loadArchivos = useCallback(async () => {
    setArchivosLoading(true)
    try {
      const data = await fetchCampanaArchivos()
      setArchivos(Array.isArray(data.archivos) ? data.archivos : [])
    } catch {
      setArchivos([])
    } finally {
      setArchivosLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLive(false)
    void loadArchivos()
  }, [loadLive, loadArchivos])

  useEffect(() => {
    if (viewMode !== 'archived' || !selectedArchivoId) {
      setArchivedDetail(null)
      return
    }
    let cancelled = false
    setArchivedLoading(true)
    void fetchCampanaArchivoById(selectedArchivoId)
      .then((detail) => {
        if (!cancelled) setArchivedDetail(detail)
      })
      .catch(() => {
        if (!cancelled) {
          setArchivedDetail(null)
          toast.error('No se pudo cargar el archivo archivado')
        }
      })
      .finally(() => {
        if (!cancelled) setArchivedLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [viewMode, selectedArchivoId])

  const sorted = useMemo(() => sortByEnviadoDesc(rows), [rows])
  const total = sorted.length
  const cumplida = sorted.filter((row) => row.campana_cumplida === true).length
  const porCorreo = sorted.filter((row) => row.respondio_correo === true).length
  const porFormulario = sorted.filter((row) => row.respondio_formulario === true).length

  const anios = useMemo(
    () => [...new Set(archivos.map((a) => a.anio))].sort((a, b) => b - a),
    [archivos],
  )

  const mesesForAnio = useMemo(() => {
    if (selectedAnio === '') return []
    return [
      ...new Set(archivos.filter((a) => a.anio === selectedAnio).map((a) => a.mes)),
    ].sort((a, b) => b - a)
  }, [archivos, selectedAnio])

  const semanasForMes = useMemo(() => {
    if (selectedAnio === '' || selectedMes === '') return []
    return archivos
      .filter((a) => a.anio === selectedAnio && a.mes === selectedMes)
      .sort((a, b) => new Date(b.archivadoEn).getTime() - new Date(a.archivadoEn).getTime())
  }, [archivos, selectedAnio, selectedMes])

  const handleDownloadPdf = async (archivoId?: string) => {
    setPdfLoading(true)
    try {
      const blob = await downloadCampanaAuditoriaPdf(archivoId)
      if (blob.size < 100) {
        throw new Error('El PDF está vacío')
      }
      const stamp = new Date().toISOString().slice(0, 10)
      triggerPdfDownload(
        blob,
        archivoId ? `auditoria-campana-archivo-${stamp}.pdf` : `auditoria-campana-${stamp}.pdf`,
      )
      toast.success('PDF descargado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo generar el PDF')
    } finally {
      setPdfLoading(false)
    }
  }

  const handleArchivar = async () => {
    const ok = window.confirm(
      '¿Archivar el estado actual de la campaña? Esto no borra nada de la tabla original, solo guarda una copia con fecha de hoy.',
    )
    if (!ok) return
    setArchiving(true)
    try {
      const result = await postCampanaArchivar()
      toast.success('Campaña archivada')
      await loadArchivos()
      setViewMode('archived')
      setSelectedAnio(result.anio)
      setSelectedMes(result.mes)
      setSelectedArchivoId(result.id)
    } catch (err) {
      toast.error(err instanceof HelpdeskApiError ? err.message : 'No se pudo archivar')
    } finally {
      setArchiving(false)
    }
  }

  const onSelectAnio = (value: string) => {
    const n = value === '' ? '' : Number(value)
    setSelectedAnio(n)
    setSelectedMes('')
    setSelectedArchivoId(null)
    setViewMode(n === '' ? 'live' : 'archived')
  }

  const onSelectMes = (value: string) => {
    const n = value === '' ? '' : Number(value)
    setSelectedMes(n)
    setSelectedArchivoId(null)
  }

  const onSelectSemanaEntry = (archivo: HelpdeskCampanaArchivoListItem) => {
    setSelectedArchivoId(archivo.id)
    setViewMode('archived')
  }

  const showLiveTable = viewMode === 'live'
  const mesLabel = (m: number) =>
    new Date(2000, m - 1, 1).toLocaleString('es-AR', { month: 'long' })

  return (
    <section
      className="space-y-6"
      data-testid="helpdesk-campana-auditoria"
      aria-labelledby="helpdesk-campana-auditoria-title"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2
            id="helpdesk-campana-auditoria-title"
            className="text-xl font-semibold tracking-tight text-heading"
          >
            Auditoría de campaña
          </h2>
          {showLiveTable ? (
            <>
              <p className="text-sm text-body-muted">
                {total === 0
                  ? 'Sin filas de difusión para mostrar.'
                  : `${cumplida} de ${total} contactos cumplieron la campaña (correo: ${porCorreo}, formulario: ${porFormulario}).`}
              </p>
              <p className="text-xs text-body-muted">
                El formulario se detecta por ticket en BacarNet; el correo, por respuesta al mail de
                difusión (n8n).
              </p>
            </>
          ) : archivedDetail ? (
            <p
              className="text-sm text-amber-800 dark:text-amber-200"
              data-testid="helpdesk-campana-auditoria-archived-banner"
            >
              Vista archivada del{' '}
              {formatHelpdeskDateTime(archivedDetail.archivadoEn)} por{' '}
              {archivedDetail.archivadoPorEmail}. No refleja el estado actual de n8n.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={loading || pdfLoading || (showLiveTable && total === 0)}
            onClick={() => void handleDownloadPdf(showLiveTable ? undefined : selectedArchivoId ?? undefined)}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-heading hover:bg-neutral-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            data-testid="helpdesk-campana-auditoria-pdf"
          >
            {pdfLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4" aria-hidden />
            )}
            Descargar PDF
          </button>
          <button
            type="button"
            disabled={loading || archiving || total === 0}
            onClick={() => void handleArchivar()}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-primary/30 bg-brand-tint px-3 py-2 text-sm font-semibold text-brand-primary hover:bg-brand-primary/10 disabled:opacity-60 dark:border-brand-primary/40 dark:bg-brand-primary/10"
            data-testid="helpdesk-campana-auditoria-archivar"
          >
            {archiving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Archive className="h-4 w-4" aria-hidden />
            )}
            Archivar esta campaña
          </button>
          <button
            type="button"
            disabled={loading || refreshing}
            onClick={() => void loadLive(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-heading hover:bg-neutral-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            data-testid="helpdesk-campana-auditoria-refresh"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
            Actualizar
          </button>
        </div>
      </header>

      <section
        className="rounded-xl border border-neutral-200 bg-neutral-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
        data-testid="helpdesk-campana-auditoria-historial"
      >
        <h3 className="text-sm font-semibold text-heading">Historial archivado</h3>
        <p className="mt-1 text-xs text-body-muted">
          Elegí año, mes y semana para ver una copia guardada. Volvé a “Estado actual” para la tabla
          en vivo.
        </p>
        {archivosLoading ? (
          <p className="mt-3 text-sm text-body-muted">Cargando historial…</p>
        ) : archivos.length === 0 ? (
          <p className="mt-3 text-sm text-body-muted">Todavía no hay campañas archivadas.</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="block text-xs font-medium text-body-muted">
              Año
              <select
                value={selectedAnio === '' ? '' : String(selectedAnio)}
                onChange={(e) => onSelectAnio(e.target.value)}
                className="mt-1 block h-9 min-w-[5rem] rounded-lg border border-neutral-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                data-testid="helpdesk-campana-historial-anio"
              >
                <option value="">Estado actual</option>
                {anios.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            {selectedAnio !== '' ? (
              <label className="block text-xs font-medium text-body-muted">
                Mes
                <select
                  value={selectedMes === '' ? '' : String(selectedMes)}
                  onChange={(e) => onSelectMes(e.target.value)}
                  className="mt-1 block h-9 min-w-[8rem] rounded-lg border border-neutral-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  data-testid="helpdesk-campana-historial-mes"
                >
                  <option value="">Elegir mes</option>
                  {mesesForAnio.map((m) => (
                    <option key={m} value={m}>
                      {mesLabel(m)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {selectedAnio !== '' && selectedMes !== '' && semanasForMes.length > 0 ? (
              <label className="block text-xs font-medium text-body-muted">
                Archivo (semana ISO)
                <select
                  value={selectedArchivoId ?? ''}
                  onChange={(e) => {
                    const id = e.target.value
                    const hit = semanasForMes.find((a) => a.id === id)
                    if (hit) onSelectSemanaEntry(hit)
                  }}
                  className="mt-1 block h-9 min-w-[14rem] rounded-lg border border-neutral-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  data-testid="helpdesk-campana-historial-semana"
                >
                  <option value="">Elegir archivo</option>
                  {semanasForMes.map((a) => (
                    <option key={a.id} value={a.id}>
                      Semana {a.semanaIso} · {formatHelpdeskDateTime(a.archivadoEn)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        )}
      </section>

      {showLiveTable ? (
        loading ? (
          <p className="text-sm text-body-muted">Cargando auditoría…</p>
        ) : error ? (
          <p
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
            data-testid="helpdesk-campana-auditoria-error"
          >
            {error}
          </p>
        ) : (
          <HelpdeskCampanaAuditoriaTable mode="live" rows={sorted} />
        )
      ) : archivedLoading ? (
        <p className="text-sm text-body-muted">Cargando vista archivada…</p>
      ) : archivedDetail ? (
        <HelpdeskCampanaAuditoriaTable mode="archived" rows={archivedDetail.filas} />
      ) : (
        <p className="text-sm text-body-muted">Elegí un archivo del historial para ver la foto guardada.</p>
      )}
    </section>
  )
}
