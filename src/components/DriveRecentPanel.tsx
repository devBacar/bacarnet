import { FileText, Loader2 } from 'lucide-react'
import { useDriveRecentEntries } from '../hooks/useDriveRecentEntries'
import { type DriveRecentEntry } from '../services/driveRecentFiles'
import { canOpenDriveEmbedded } from '../utils/googleDriveEmbed'

function formatRelative(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'Ahora'
  if (minutes < 60) return `Hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `Hace ${days} d`
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(date)
}

interface DriveRecentPanelProps {
  uid: string | undefined
  onOpen: (entry: DriveRecentEntry) => void
}

export function DriveRecentPanel({ uid, onOpen }: DriveRecentPanelProps) {
  const { entries, loading } = useDriveRecentEntries(uid)

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <header className="shrink-0 border-b border-neutral-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-gray-100">Recientes</h2>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-gray-400">
          Archivos que abriste en esta intranet
        </p>
      </header>

      <div className="app-drawer-scroll px-2 py-2">
        {loading && entries.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando…
          </div>
        ) : entries.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-neutral-500 dark:text-gray-400">
            Todavía no abriste archivos desde acá. Al abrir uno con el visor embebido, aparecerá
            en esta lista.
          </p>
        ) : (
          <ul className="space-y-1">
            {entries.map((entry) => {
              const embeddable = canOpenDriveEmbedded(entry.mimeType)
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(entry)}
                    disabled={!embeddable}
                    title={embeddable ? entry.name : 'Este archivo no se abre embebido'}
                    className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-900"
                  >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-neutral-800 dark:text-gray-100">
                        {entry.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-neutral-500 dark:text-gray-400">
                        {formatRelative(entry.openedAt)}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
