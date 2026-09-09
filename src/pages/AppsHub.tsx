import { LayoutGrid, Pin, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { CoreAppIcon } from '../components/CoreAppIcon'
import { useAuth } from '../context'
import { useUrlSearchParam } from '../hooks/useUrlSearchState'
import { getCoreApps, type CoreApp, type CoreAppLinkKind } from '../services/coreAppService'
import { toggleFavoriteApp } from '../services/userService'

function AppsGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-44 animate-pulse rounded-xl border border-neutral-100 dark:border-zinc-800 bg-neutral-50 dark:bg-zinc-950"
        />
      ))}
    </div>
  )
}

function AppCard({
  app,
  isFavorite,
  onToggleFavorite,
  toggling,
  linkKind = 'app',
}: {
  app: CoreApp
  isFavorite: boolean
  onToggleFavorite: () => void
  toggling: boolean
  linkKind?: CoreAppLinkKind
}) {
  return (
    <article className="relative overflow-hidden rounded-xl border border-neutral-200 bg-white transition-colors hover:border-brand-primary/40 dark:border-zinc-800 dark:bg-zinc-900">
      <button
        type="button"
        onClick={onToggleFavorite}
        disabled={toggling}
        aria-label={isFavorite ? `Quitar ${app.title} de favoritos` : `Anclar ${app.title}`}
        aria-pressed={isFavorite}
        className="absolute top-3 right-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-400 transition-colors hover:border-brand-primary/30 hover:bg-brand-tint hover:text-brand-primary disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-brand-primary-hover/40"
      >
        <Pin
          className={`h-4 w-4 ${isFavorite ? 'fill-brand-primary text-brand-primary' : ''}`}
        />
      </button>

      <a
        href={app.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex h-full flex-col p-6 pr-12"
      >
        <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 dark:bg-zinc-800 text-brand-primary transition-colors group-hover:bg-brand-tint">
          {app.imageUrl ? (
            <img src={app.imageUrl} alt="" className="h-8 w-8 object-contain" />
          ) : (
            <CoreAppIcon name={app.icon} className="h-7 w-7" />
          )}
        </span>
        <h3 className="text-lg font-bold text-neutral-900 dark:text-gray-100">{app.title}</h3>
        {linkKind === 'external_link' && (
          <span className="mt-1 inline-flex w-fit rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:bg-zinc-800 dark:text-zinc-400">
            Externo
          </span>
        )}
        <p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-500 dark:text-gray-400">{app.description}</p>
      </a>
    </article>
  )
}

export function AppsHub() {
  const { user, userProfile, refreshProfile } = useAuth()
  const [apps, setApps] = useState<CoreApp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [search, setSearch] = useUrlSearchParam('q')
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const favoriteApps = userProfile?.favoriteApps ?? []

  useEffect(() => {
    getCoreApps()
      .then(setApps)
      .catch((err) => {
        console.error('Error al cargar aplicaciones:', err)
        setApps([])
        setError(true)
      })
      .finally(() => setLoading(false))
  }, [])

  const filteredApps = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return apps

    return apps.filter(
      (app) =>
        app.title.toLowerCase().includes(term) ||
        app.description.toLowerCase().includes(term),
    )
  }, [apps, search])

  const internalApps = useMemo(
    () => filteredApps.filter((app) => (app.linkKind ?? 'app') === 'app'),
    [filteredApps],
  )

  const externalLinks = useMemo(
    () => filteredApps.filter((app) => app.linkKind === 'external_link'),
    [filteredApps],
  )

  const handleToggleFavorite = async (appId: string) => {
    if (!user?.uid) return

    setTogglingId(appId)

    try {
      await toggleFavoriteApp(user.uid, appId)
      await refreshProfile()
    } catch (err) {
      console.error('Error al anclar aplicación:', err)
      toast.error('No se pudo actualizar tus favoritos')
    } finally {
      setTogglingId(null)
    }
  }

  const renderGrid = (items: CoreApp[], kind: CoreAppLinkKind) => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((app) => (
        <AppCard
          key={app.id}
          app={app}
          linkKind={kind}
          isFavorite={!!app.id && favoriteApps.includes(app.id)}
          onToggleFavorite={() => app.id && void handleToggleFavorite(app.id)}
          toggling={togglingId === app.id}
        />
      ))}
    </div>
  )

  return (
    <div className="w-full">
      <header className="mb-8 border-b border-neutral-200 dark:border-zinc-800 pb-8">
        <p className="text-brand-primary mb-1 text-sm font-medium uppercase tracking-wide">
          Ecosistema
        </p>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-gray-100">
              Accesos directos
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-600 dark:text-gray-400">
              Aplicaciones internas y enlaces externos. Usá la chincheta para anclar tus favoritas en el
              inicio.
            </p>
          </div>
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título o descripción..."
              className="input-brand-focus w-full rounded-lg border border-neutral-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-2.5 pr-9 pl-9 text-sm text-neutral-900 dark:text-gray-100 placeholder:text-neutral-400 dark:placeholder:text-gray-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-neutral-400 hover:bg-neutral-100 dark:bg-zinc-800 hover:text-neutral-600 dark:text-gray-400"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {loading ? (
        <AppsGridSkeleton />
      ) : error ? (
        <p className="rounded-lg alert-error px-4 py-3 text-sm text-danger">
          No se pudieron cargar las aplicaciones. Intentá nuevamente más tarde.
        </p>
      ) : apps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-zinc-950 px-6 py-16 text-center">
          <LayoutGrid className="mx-auto mb-4 h-10 w-10 text-neutral-300" />
          <p className="text-sm font-medium text-neutral-700 dark:text-gray-300">
            Aún no hay aplicaciones configuradas
          </p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
            El administrador puede cargarlas desde el panel de ecosistema.
          </p>
        </div>
      ) : filteredApps.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-16 text-center">
          <p className="text-sm font-medium text-neutral-700 dark:text-gray-300">
            No hay resultados para &ldquo;{search.trim()}&rdquo;
          </p>
          <button
            type="button"
            onClick={() => setSearch('')}
            className="mt-3 text-sm font-semibold text-brand-primary hover:opacity-90"
          >
            Limpiar búsqueda
          </button>
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-neutral-500 dark:text-gray-400">
            {filteredApps.length}{' '}
            {filteredApps.length === 1 ? 'acceso' : 'accesos'}
            {search.trim() ? ' encontrados' : ' disponibles'}
            {favoriteApps.length > 0 && (
              <span className="text-neutral-400"> · {favoriteApps.length} anclados en tu inicio</span>
            )}
          </p>

          {internalApps.length > 0 && (
            <section className={externalLinks.length > 0 ? 'mb-10' : undefined}>
              {externalLinks.length > 0 && (
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-gray-400">
                  Aplicaciones internas
                </h2>
              )}
              {renderGrid(internalApps, 'app')}
            </section>
          )}

          {externalLinks.length > 0 && (
            <section>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-gray-400">
                Enlaces externos
              </h2>
              {renderGrid(externalLinks, 'external_link')}
            </section>
          )}
        </>
      )}
    </div>
  )
}
