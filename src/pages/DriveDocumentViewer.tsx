import { ExternalLink, KeyRound, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { RequestMorePermissionsModal } from '../components/RequestMorePermissionsModal'
import { getDriveFile, type DriveFileDetailDto } from '../services/driveApi'
import { recordDriveRecentOpen } from '../services/driveRecentFiles'
import {
  DRIVE_EXPLORER_DEFAULT_PATH,
  resolveDocumentViewerReturn,
  type DriveDocumentViewerLocationState,
} from '../utils/driveExplorerNavigation'
import { resolveGoogleDriveViewer } from '../utils/googleDriveEmbed'
import { useAuth } from '../context'

const DEFAULT_RETURN = DRIVE_EXPLORER_DEFAULT_PATH

function useViewerNavigation() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const state = location.state as DriveDocumentViewerLocationState | null
  return useMemo(
    () =>
      resolveDocumentViewerReturn({
        searchParams,
        state,
      }),
    [searchParams, state],
  )
}

function DriveDocumentViewer({ fileId }: { fileId: string }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { returnTo, driveBreadcrumb } = useViewerNavigation()
  const [file, setFile] = useState<DriveFileDetailDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showMorePermissions, setShowMorePermissions] = useState(false)

  const goBack = useCallback(() => {
    navigate(returnTo, {
      replace: true,
      state: driveBreadcrumb?.length ? { driveBreadcrumb } : undefined,
    })
  }, [navigate, returnTo, driveBreadcrumb])

  const viewer = useMemo(() => {
    if (!file) return null
    return resolveGoogleDriveViewer(file.mimeType, file.id, file.webViewLink)
  }, [file])

  const driveLink = file?.webViewLink ?? viewer?.nativeUrl ?? null

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      goBack()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [goBack])

  useEffect(() => {
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const detail = await getDriveFile(fileId)
        if (cancelled) return
        setFile(detail)
        recordDriveRecentOpen(user?.uid, {
          id: detail.id,
          name: detail.name,
          mimeType: detail.mimeType,
          isFolder: false,
        })
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo abrir el archivo')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [fileId, user?.uid])

  const headerButtonClass =
    'inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-neutral-200/80 bg-white/90 px-3 py-2 text-sm font-medium shadow-sm backdrop-blur-sm transition-colors hover:bg-white dark:border-zinc-700/80 dark:bg-zinc-900/90 dark:hover:bg-zinc-900'

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white dark:bg-zinc-950">
      <header className="relative z-20 shrink-0 border-b border-neutral-200/80 bg-white/95 px-3 py-2 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95 sm:px-4">
        <p className="min-w-0 truncate text-center text-sm font-medium text-neutral-800 dark:text-zinc-200 sm:text-left">
          {loading ? 'Preparando documento…' : file?.name ?? 'Documento'}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={goBack} className={headerButtonClass}>
            ← Volver
          </button>
          {file && !file.canEdit && (
            <button
              type="button"
              onClick={() => setShowMorePermissions(true)}
              className={`${headerButtonClass} text-neutral-700 dark:text-zinc-200`}
            >
              <KeyRound className="h-4 w-4" />
              <span className="hidden min-[420px]:inline">Pedir más permisos</span>
              <span className="min-[420px]:hidden">Permisos</span>
            </button>
          )}
          {driveLink && (
            <a
              href={driveLink}
              target="_blank"
              rel="noopener noreferrer"
              className={`${headerButtonClass} ml-auto text-brand-primary`}
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span className="hidden min-[420px]:inline">Abrir en Google Drive</span>
              <span className="min-[420px]:hidden">Drive</span>
            </a>
          )}
        </div>
      </header>

      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <div className="max-w-md rounded-xl alert-error px-4 py-6 text-sm text-danger">
            {error}
          </div>
          <Link
            to={returnTo}
            state={driveBreadcrumb?.length ? { driveBreadcrumb } : undefined}
            className="text-sm font-medium text-brand-primary hover:underline"
          >
            Volver a Archivos
          </Link>
        </div>
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-neutral-500 dark:text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparando documento…
        </div>
      ) : !viewer?.embedUrl ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="max-w-md text-sm text-neutral-600 dark:text-zinc-400">
            Este tipo de archivo no se puede mostrar embebido. Abrilo en Google Drive.
          </p>
          {driveLink && (
            <a
              href={driveLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir en Google Drive
            </a>
          )}
        </div>
      ) : (
        <iframe
          title={file?.name ?? 'Documento'}
          src={viewer.embedUrl}
          className="min-h-0 w-full flex-1 border-0 bg-white"
          allow="clipboard-read; clipboard-write; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}

      {showMorePermissions && file && (
        <RequestMorePermissionsModal
          fileId={file.id}
          fileName={file.name}
          onClose={() => setShowMorePermissions(false)}
        />
      )}
    </div>
  )
}

export function DriveDocumentViewerPage() {
  const { fileId } = useParams()

  if (!fileId) return <Navigate to={DEFAULT_RETURN} replace />

  return <DriveDocumentViewer fileId={fileId} />
}
