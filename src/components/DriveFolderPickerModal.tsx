import { ChevronRight, Folder, Loader2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { listDriveFiles, type DriveFileDto } from '../services/driveApi'

interface DriveFolderPickerModalProps {
  title: string
  description?: string
  excludeFolderIds?: string[]
  onClose: () => void
  onSelect: (folderId: string, folderName: string) => void | Promise<void>
}

type Crumb = { id: string | null; name: string }

export function DriveFolderPickerModal({
  title,
  description,
  excludeFolderIds = [],
  onClose,
  onSelect,
}: DriveFolderPickerModalProps) {
  const [path, setPath] = useState<Crumb[]>([{ id: null, name: 'bacarsa' }])
  const [folders, setFolders] = useState<DriveFileDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const currentFolder = path[path.length - 1]!
  const excluded = useMemo(() => new Set(excludeFolderIds), [excludeFolderIds])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    listDriveFiles(currentFolder.id)
      .then((result) => {
        if (cancelled) return
        setFolders(result.files.filter((file) => file.isFolder && !excluded.has(file.id)))
      })
      .catch((err) => {
        if (cancelled) return
        setFolders([])
        setError(err instanceof Error ? err.message : 'No se pudieron cargar las carpetas')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [currentFolder.id, excluded])

  const navigateTo = (index: number) => {
    setPath((prev) => prev.slice(0, index + 1))
  }

  const openFolder = (folder: DriveFileDto) => {
    setPath((prev) => [...prev, { id: folder.id, name: folder.name }])
  }

  const handleSelectHere = async () => {
    if (!currentFolder.id) {
      setError('Elegí una carpeta destino dentro de la unidad compartida')
      return
    }
    setSubmitting(true)
    try {
      await onSelect(currentFolder.id, currentFolder.name)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="app-modal-panel flex max-h-[85vh] w-full max-w-lg flex-col">
        <header className="shrink-0 flex items-start justify-between border-b border-neutral-200 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0 pr-4">
            <h2 className="font-semibold">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-zinc-400">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-zinc-800"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
          <nav aria-label="Ruta de carpetas" className="mb-3 flex flex-wrap items-center gap-1 text-sm">
            {path.map((crumb, index) => (
              <span key={`${crumb.id ?? 'root'}-${index}`} className="flex items-center gap-1">
                {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-neutral-300" />}
                <button
                  type="button"
                  onClick={() => navigateTo(index)}
                  className={`rounded px-1 py-0.5 hover:bg-neutral-100 dark:hover:bg-zinc-800 ${
                    index === path.length - 1
                      ? 'font-medium text-neutral-900 dark:text-gray-100'
                      : 'text-brand-primary'
                  }`}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-neutral-200 dark:border-zinc-800">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
              </div>
            ) : error ? (
              <p className="px-4 py-6 text-sm text-danger">{error}</p>
            ) : folders.length === 0 ? (
              <p className="px-4 py-6 text-sm text-neutral-500 dark:text-zinc-400">
                No hay subcarpetas en esta ubicación.
              </p>
            ) : (
              <ul>
                {folders.map((folder) => (
                  <li key={folder.id}>
                    <button
                      type="button"
                      onClick={() => openFolder(folder)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-neutral-50 dark:hover:bg-zinc-900"
                    >
                      <Folder className="h-4 w-4 shrink-0 text-brand-primary" />
                      <span className="truncate font-medium">{folder.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <footer className="shrink-0 flex justify-end gap-2 border-t border-neutral-200 px-5 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSelectHere()}
            disabled={submitting || loading || !currentFolder.id}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Moviendo…' : `Mover aquí (${currentFolder.name})`}
          </button>
        </footer>
      </div>
    </div>
  )
}
