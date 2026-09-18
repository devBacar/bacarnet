import { ExternalLink, Link2, Plus, Trash2 } from 'lucide-react'
import { type FormEvent, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../context'
import {
  addPersonalLink,
  isValidPersonalLinkUrl,
  MAX_PERSONAL_LINKS,
  removePersonalLink,
  type PersonalLink,
} from '../../services/userService'
import { HomeCollapsibleSection } from './HomeCollapsibleSection'

const inputClassName =
  'input-brand-focus w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-100 dark:placeholder:text-zinc-500 dark:focus:bg-zinc-800'

function sortedLinks(links: PersonalLink[]): PersonalLink[] {
  return [...links].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'es'))
}

export function HomePersonalLinksSection() {
  const { user, userProfile, refreshProfile } = useAuth()
  const links = useMemo(
    () => sortedLinks(userProfile?.personalLinks ?? []),
    [userProfile?.personalLinks],
  )

  const [formOpen, setFormOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault()
    if (!user?.uid) return

    const trimmedTitle = title.trim()
    const trimmedUrl = url.trim()
    if (!trimmedTitle) {
      toast.error('El título es obligatorio')
      return
    }
    if (!isValidPersonalLinkUrl(trimmedUrl)) {
      toast.error('La URL debe empezar con http:// o https://')
      return
    }

    setSaving(true)
    try {
      await addPersonalLink(user.uid, { title: trimmedTitle, url: trimmedUrl })
      await refreshProfile()
      setTitle('')
      setUrl('')
      setFormOpen(false)
      toast.success('Enlace agregado')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'No se pudo agregar el enlace')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (link: PersonalLink) => {
    if (!user?.uid) return
    const ok = window.confirm(`¿Eliminar «${link.title}» de tus enlaces?`)
    if (!ok) return

    setRemovingId(link.id)
    try {
      await removePersonalLink(user.uid, link.id)
      await refreshProfile()
      toast.success('Enlace eliminado')
    } catch (err) {
      console.error(err)
      toast.error('No se pudo eliminar el enlace')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <HomeCollapsibleSection
      title="Mis enlaces"
      subtitle="Accesos que vos cargás para tu día a día (no pasan por el catálogo del admin)"
      storageKey="personal-links"
      headerAction={
        links.length < MAX_PERSONAL_LINKS ? (
          <button
            type="button"
            data-testid="personal-links-add-toggle"
            onClick={() => setFormOpen((open) => !open)}
            className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-brand-primary transition-colors hover:opacity-90"
          >
            <Plus className="h-4 w-4 shrink-0" />
            Agregar enlace
          </button>
        ) : null
      }
    >
      {formOpen && (
        <form
          onSubmit={(e) => void handleAdd(e)}
          className="mb-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 dark:border-zinc-600 dark:bg-zinc-950/50"
          data-testid="personal-links-form"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-gray-400">
                Título
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputClassName}
                placeholder="Ej. ARCA"
                data-testid="personal-links-title"
                maxLength={120}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-gray-400">
                URL
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={inputClassName}
                placeholder="https://..."
                data-testid="personal-links-url"
                required
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              data-testid="personal-links-submit"
              className="rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Guardando…' : 'Guardar enlace'}
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 dark:border-zinc-600 dark:text-gray-300"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {links.length === 0 ? (
        <div
          className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-8 text-center dark:border-zinc-700 dark:bg-zinc-950/40"
          data-testid="personal-links-empty"
        >
          <Link2 className="mx-auto mb-3 h-8 w-8 text-neutral-300 dark:text-zinc-600" />
          <p className="text-sm font-medium text-neutral-800 dark:text-gray-200">
            Todavía no agregaste enlaces personales
          </p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
            Ej: ARCA, tu banco o un sistema que uses seguido.
          </p>
          {!formOpen && links.length < MAX_PERSONAL_LINKS && (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primary hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Agregar el primero
            </button>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="personal-links-list">
          {links.map((link) => (
            <li
              key={link.id}
              data-testid={`personal-link-${link.id}`}
              className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950/30"
            >
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-neutral-900 dark:text-gray-100"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint/50 text-brand-primary dark:bg-brand-primary-hover/25">
                  <ExternalLink className="h-4 w-4" />
                </span>
                <span className="min-w-0 truncate" data-testid="personal-link-title">
                  {link.title}
                </span>
              </a>
              <button
                type="button"
                onClick={() => void handleRemove(link)}
                disabled={removingId === link.id}
                aria-label={`Eliminar ${link.title}`}
                data-testid={`personal-link-remove-${link.id}`}
                className="rounded-lg border border-red-200 p-2 text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </HomeCollapsibleSection>
  )
}
