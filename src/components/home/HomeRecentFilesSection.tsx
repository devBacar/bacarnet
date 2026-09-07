import { ArrowRight, FileText, Loader2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context'
import { useDriveRecentEntries } from '../../hooks/useDriveRecentEntries'
import { recordDriveRecentOpen } from '../../services/driveRecentFiles'
import { canOpenDriveEmbedded } from '../../utils/googleDriveEmbed'
import { HomeCollapsibleSection } from './HomeCollapsibleSection'

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

export function HomeRecentFilesSection() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { entries, loading } = useDriveRecentEntries(user?.uid)

  if (!loading && entries.length === 0) return null

  const openFile = (entry: (typeof entries)[number]) => {
    if (!canOpenDriveEmbedded(entry.mimeType)) return
    recordDriveRecentOpen(user?.uid, {
      id: entry.id,
      name: entry.name,
      mimeType: entry.mimeType,
      isFolder: false,
    })
    navigate(`/recursos/documento/${entry.id}`)
  }

  return (
    <HomeCollapsibleSection
      title="Archivos Recientes"
      subtitle="Documentos que abriste recientemente en Archivos"
      storageKey="recent-files"
      headerAction={
        <Link
          to="/recursos"
          className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-brand-primary transition-colors hover:opacity-90"
        >
          Ir a Archivos
          <ArrowRight className="h-4 w-4 shrink-0" />
        </Link>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {entries.slice(0, 6).map((entry) => {
            const embeddable = canOpenDriveEmbedded(entry.mimeType)
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => openFile(entry)}
                disabled={!embeddable}
                title={embeddable ? entry.name : 'Este archivo no se abre embebido'}
                className="group flex min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-neutral-200 bg-white p-3.5 text-left transition-colors hover:border-brand-primary/35 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 sm:gap-4 sm:p-4"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition-colors group-hover:bg-brand-tint group-hover:text-brand-primary dark:bg-zinc-800 sm:h-12 sm:w-12">
                  <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-neutral-900 dark:text-gray-100">
                    {entry.name}
                  </h3>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-gray-400">
                    {formatRelative(entry.openedAt)}
                  </p>
                </div>
                <ArrowRight className="hidden h-4 w-4 shrink-0 text-neutral-300 transition-colors group-hover:text-brand-primary sm:block" />
              </button>
            )
          })}
        </div>
      )}
    </HomeCollapsibleSection>
  )
}
