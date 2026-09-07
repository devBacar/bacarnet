import { ExternalLink, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getOfficeUploadStagingPreview } from '../services/approvalRequestsService'
import { isLegacyOfficeFileName, resolveOfficeEmbedUrl } from '../utils/officeEmbed'

export function OfficeUploadPreviewPage() {
  const { requestId } = useParams<{ requestId: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!requestId) {
      setError('Solicitud inválida')
      setLoading(false)
      return
    }

    getOfficeUploadStagingPreview(requestId)
      .then((result) => {
        setFileName(result.fileName)
        setPreviewUrl(result.previewUrl)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'No se pudo cargar la vista previa')
      })
      .finally(() => setLoading(false))
  }, [requestId])

  const embedUrl = useMemo(
    () => (previewUrl && fileName ? resolveOfficeEmbedUrl(previewUrl, fileName) : null),
    [previewUrl, fileName],
  )

  const legacyOffice = isLegacyOfficeFileName(fileName)

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-5xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-primary">
            Vista previa · staging
          </p>
          <h1 className="mt-1 text-xl font-semibold text-neutral-900 dark:text-gray-100">
            {fileName || 'Archivo Office pendiente'}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {embedUrl && (
            <a
              href={embedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium dark:border-zinc-700"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir en nueva pestaña
            </a>
          )}
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium dark:border-zinc-700"
            >
              Descargar
            </a>
          )}
          <Link
            to="/recursos"
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
          >
            Volver a Archivos
          </Link>
        </div>
      </div>

      {legacyOffice && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
          Formato Office clásico ({fileName.split('.').pop()?.toUpperCase()}). Si la vista embebida falla,
          usá «Abrir en nueva pestaña» o «Descargar».
        </p>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
        </div>
      ) : error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger dark:border-red-900/40 dark:bg-red-950/30">
          {error}
        </p>
      ) : previewUrl ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          {embedUrl ? (
            <iframe
              title={`Vista previa de ${fileName}`}
              src={embedUrl}
              className="min-h-[70vh] w-full flex-1 border-0"
              allow="fullscreen"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-sm text-neutral-600 dark:text-gray-400">
                No se pudo embeber la vista previa. Podés abrir el archivo directamente.
              </p>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-brand-primary"
              >
                Abrir archivo
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
