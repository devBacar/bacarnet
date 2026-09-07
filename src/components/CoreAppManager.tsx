import { LayoutGrid, Pencil, Trash2 } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { CoreAppIcon, CORE_APP_ICON_MAP } from './CoreAppIcon'
import { useAuth } from '../context'
import {
  createCoreApp,
  deleteCoreApp,
  getCoreApps,
  updateCoreApp,
  type CoreApp,
  type CoreAppLinkKind,
} from '../services/coreAppService'

const CORE_APP_ICONS = Object.entries(CORE_APP_ICON_MAP).map(([name, icon]) => ({
  name,
  icon,
}))

export function CoreAppManager() {
  const { userProfile } = useAuth()
  const isSuperAdmin = userProfile?.permissions.super_admin === true

  const [apps, setApps] = useState<CoreApp[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [icon, setIcon] = useState(CORE_APP_ICONS[0].name)
  const [linkKind, setLinkKind] = useState<CoreAppLinkKind>('app')

  const loadApps = useCallback(async () => {
    try {
      const data = await getCoreApps()
      setApps(data)
    } catch (err) {
      console.error('Error al cargar aplicaciones:', err)
      toast.error('No se pudieron cargar las aplicaciones')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isSuperAdmin) {
      loadApps()
    }
  }, [isSuperAdmin, loadApps])

  if (!isSuperAdmin) {
    return null
  }

  const resetForm = () => {
    setEditingId(null)
    setTitle('')
    setDescription('')
    setUrl('')
    setIcon(CORE_APP_ICONS[0].name)
    setLinkKind('app')
  }

  const handleEdit = (app: CoreApp) => {
    setEditingId(app.id ?? null)
    setTitle(app.title)
    setDescription(app.description)
    setUrl(app.url)
    setIcon(app.icon ?? CORE_APP_ICONS[0].name)
    setLinkKind(app.linkKind ?? 'app')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    const payload = {
      title: title.trim(),
      description: description.trim(),
      url: url.trim(),
      icon,
      linkKind,
    }

    try {
      if (editingId) {
        await updateCoreApp(editingId, payload)
        toast.success('Aplicación actualizada')
      } else {
        await createCoreApp(payload)
        toast.success('Aplicación registrada')
      }

      resetForm()
      await loadApps()
    } catch (err) {
      console.error('Error al guardar aplicación:', err)
      toast.error(editingId ? 'No se pudo actualizar' : 'No se pudo guardar')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string, appTitle: string) => {
    const confirmed = window.confirm(
      `¿Eliminar "${appTitle}" del ecosistema? Esta acción no se puede deshacer.`,
    )
    if (!confirmed) return

    setDeletingId(id)

    try {
      await deleteCoreApp(id)
      toast.success('Aplicación eliminada')
      if (editingId === id) resetForm()
      await loadApps()
    } catch (err) {
      console.error('Error al eliminar aplicación:', err)
      toast.error('No se pudo eliminar la aplicación')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-8">
      <section className="card-minimal overflow-hidden">
        <div className="border-b border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-zinc-950 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary text-white">
              <LayoutGrid className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-gray-100">
                {editingId
                  ? linkKind === 'external_link'
                    ? 'Editar enlace externo'
                    : 'Editar aplicación'
                  : linkKind === 'external_link'
                    ? 'Nuevo enlace externo'
                    : 'Nueva aplicación interna'}
              </h2>
              <p className="text-sm text-neutral-500 dark:text-gray-400">
                {linkKind === 'external_link'
                  ? 'Accesos directos a sitios externos (ARCA, AFIP, etc.)'
                  : 'Accesos principales visibles en el dashboard de la intranet'}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div>
            <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-gray-300">Tipo de acceso</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setLinkKind('app')}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  linkKind === 'app'
                    ? 'border-brand-primary bg-brand-tint text-brand-primary'
                    : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-900'
                }`}
              >
                Aplicación interna
              </button>
              <button
                type="button"
                onClick={() => setLinkKind('external_link')}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  linkKind === 'external_link'
                    ? 'border-brand-primary bg-brand-tint text-brand-primary'
                    : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-900'
                }`}
              >
                Enlace externo
              </button>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <label htmlFor="core-app-title" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300">
                Título de la App
              </label>
              <input
                id="core-app-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: IT Ops Hub"
                className="input-brand-focus w-full rounded-lg border border-neutral-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-sm"
              />
            </div>

            <div>
              <label htmlFor="core-app-url" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300">
                URL del sistema
              </label>
              <input
                id="core-app-url"
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://sistema.empresa.com"
                className="input-brand-focus w-full rounded-lg border border-neutral-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="core-app-description" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300">
              Descripción corta
            </label>
            <textarea
              id="core-app-description"
              required
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Breve descripción de la herramienta..."
              className="input-brand-focus w-full resize-y rounded-lg border border-neutral-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-sm leading-relaxed"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-gray-300">Ícono</p>
            <div className="flex flex-wrap gap-2">
              {CORE_APP_ICONS.map(({ name, icon: Icon }) => {
                const selected = icon === name
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setIcon(name)}
                    aria-label={`Ícono ${name}`}
                    aria-pressed={selected}
                    className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${
                      selected
                        ? 'border-brand-primary bg-brand-tint text-brand-primary'
                        : 'border-neutral-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-neutral-600 dark:text-gray-400 hover:border-neutral-300 dark:border-zinc-700 hover:bg-neutral-50 dark:bg-zinc-950'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                )
              })}
            </div>
            <p className="mt-1.5 text-xs text-neutral-400">Seleccionado: {icon}</p>
          </div>

          <div className="flex justify-end gap-3 border-t border-neutral-100 dark:border-zinc-800 pt-5">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-neutral-300 dark:border-zinc-700 px-5 py-2.5 text-sm font-medium text-neutral-700 dark:text-gray-300 hover:bg-neutral-50 dark:bg-zinc-950"
              >
                Cancelar edición
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary rounded-lg px-6 py-2.5 text-sm font-semibold"
            >
              {submitting ? 'Guardando...' : editingId ? 'Actualizar' : linkKind === 'external_link' ? 'Registrar enlace' : 'Registrar aplicación'}
            </button>
          </div>
        </form>
      </section>

      <section className="card-minimal overflow-hidden">
        <div className="border-b border-neutral-200 dark:border-zinc-800 px-6 py-5">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-gray-100">Ecosistema activo</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
            {apps.length} {apps.length === 1 ? 'aplicación' : 'aplicaciones'} configuradas
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
          </div>
        ) : apps.length === 0 ? (
          <p className="px-6 py-16 text-center text-sm text-neutral-500 dark:text-gray-400">
            Aún no hay aplicaciones registradas en el ecosistema.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {apps.map((app) => (
              <li
                key={app.id}
                className={`flex items-start justify-between gap-4 px-6 py-4 transition-colors hover:bg-neutral-50 dark:bg-zinc-950/80 ${
                  editingId === app.id ? 'bg-brand-tint' : ''
                }`}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 dark:bg-zinc-800 text-brand-primary">
                    <CoreAppIcon name={app.icon} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-900 dark:text-gray-100">{app.title}</p>
                    <p className="mt-0.5 truncate text-xs text-neutral-400">{app.url}</p>
                    <p className="mt-1 text-sm text-neutral-600 dark:text-gray-400">{app.description}</p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => handleEdit(app)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 dark:text-gray-400 transition-colors hover:bg-neutral-100 dark:bg-zinc-800 hover:text-neutral-900 dark:text-gray-100"
                    aria-label={`Editar ${app.title}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => app.id && handleDelete(app.id, app.title)}
                    disabled={deletingId === app.id}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 dark:text-gray-400 transition-colors hover:bg-brand-tint hover:text-brand-primary disabled:opacity-50"
                    aria-label={`Eliminar ${app.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
