import { ExternalLink, Loader2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  HELPDESK_ANALISIS_DEFAULT_APROBADOR,
  postHelpdeskTicketAnalisis,
  HelpdeskApiError,
  HELPDESK_GENERIC_ERROR_MESSAGE,
  type HelpdeskAnalisisDto,
} from '../../services/helpdeskApi'

function analisisEstadoLabel(estado: HelpdeskAnalisisDto['estado']): string {
  switch (estado) {
    case 'pendiente':
      return 'Pendiente de aprobación'
    case 'aprobado':
      return 'Aprobado'
    case 'rechazado':
      return 'Rechazado'
    default:
      return estado
  }
}

export function HelpdeskPanelAnalisisSection({
  ticketId,
  estadoIdx,
  cancelado,
  analisis,
  onUpdated,
}: {
  ticketId: string
  estadoIdx: number
  cancelado: boolean
  analisis: HelpdeskAnalisisDto[]
  onUpdated: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [aprobadores, setAprobadores] = useState(HELPDESK_ANALISIS_DEFAULT_APROBADOR)
  const [uploading, setUploading] = useState(false)

  const hasPendiente = analisis.some((a) => a.estado === 'pendiente')
  const canUpload = estadoIdx === 2 && !cancelado && !hasPendiente

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      toast.error('Elegí un archivo')
      return
    }
    setUploading(true)
    try {
      await postHelpdeskTicketAnalisis(ticketId, file, aprobadores)
      if (fileRef.current) fileRef.current.value = ''
      toast.success('Análisis enviado a aprobación')
      onUpdated()
    } catch (err) {
      toast.error(err instanceof HelpdeskApiError ? err.message : HELPDESK_GENERIC_ERROR_MESSAGE)
    } finally {
      setUploading(false)
    }
  }

  if (estadoIdx !== 2 && analisis.length === 0) {
    return null
  }

  return (
    <section
      className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5"
      data-testid="helpdesk-analisis-section"
    >
      <h3 className="text-sm font-semibold text-heading">Análisis del proyecto</h3>

      {analisis.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {analisis.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950/60"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{analisisEstadoLabel(row.estado)}</span>
                <span className="text-xs text-body-muted">
                  {row.subidoPorNombre} · {row.subidoFecha ? new Date(row.subidoFecha).toLocaleString('es-AR') : '—'}
                </span>
              </div>
              <a
                href={row.archivoDriveLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"
              >
                Ver documento
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
              {row.estado !== 'pendiente' && row.comentarioDecision ? (
                <p className="mt-1 text-xs text-body-muted">Comentario: {row.comentarioDecision}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-body-muted">Todavía no hay análisis cargados.</p>
      )}

      {canUpload ? (
        <div className="mt-4 space-y-3 rounded-lg border border-dashed border-neutral-200 p-4 dark:border-zinc-700">
          <label className="block text-xs font-semibold uppercase tracking-wide text-body-muted">
            Enviar a (emails, separados por coma)
            <input
              value={aprobadores}
              onChange={(e) => setAprobadores(e.target.value)}
              className="input-brand-focus mt-1 block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              data-testid="helpdesk-analisis-aprobadores"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-body-muted">
            Documento (Office o PDF, máx. 25 MB)
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              className="mt-1 block w-full text-sm"
              data-testid="helpdesk-analisis-file"
            />
          </label>
          <button
            type="button"
            disabled={uploading}
            onClick={() => void handleUpload()}
            className="btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
            data-testid="helpdesk-analisis-upload"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="h-4 w-4" aria-hidden />
            )}
            {uploading ? 'Subiendo…' : 'Enviar a aprobación'}
          </button>
        </div>
      ) : null}

      {estadoIdx === 2 && hasPendiente ? (
        <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
          Hay un análisis esperando decisión. No podés subir otro hasta que se apruebe o rechace.
        </p>
      ) : null}

      {cancelado && estadoIdx === 2 ? (
        <p className="mt-3 text-sm text-body-muted">
          El proyecto está cancelado. Reactivalo para subir un nuevo análisis.
        </p>
      ) : null}
    </section>
  )
}
