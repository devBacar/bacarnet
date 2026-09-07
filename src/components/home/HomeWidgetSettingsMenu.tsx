import { Settings2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { HOME_WIDGETS, type HomeWidgetPreferences } from '../../constants/homeWidgets'
import { updateHomeWidgetPreferences } from '../../services/userService'

interface HomeWidgetSettingsMenuProps {
  userId: string
  preferences: HomeWidgetPreferences
  onUpdated: (next: HomeWidgetPreferences) => void
  light?: boolean
}

export function HomeWidgetSettingsMenu({
  userId,
  preferences,
  onUpdated,
  light = false,
}: HomeWidgetSettingsMenuProps) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const toggle = async (widgetId: keyof HomeWidgetPreferences, enabled: boolean) => {
    setSaving(true)
    try {
      const next = await updateHomeWidgetPreferences(userId, { [widgetId]: enabled })
      onUpdated(next)
    } catch (err) {
      console.error(err)
      toast.error('No se pudieron guardar las preferencias')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={panelRef} className={`relative shrink-0 ${open ? 'z-50' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Configurar widgets de la home"
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
          light
            ? 'border-white/30 text-white/80 hover:bg-white/15 hover:text-white'
            : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800 dark:border-zinc-700 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-gray-100'
        }`}
      >
        <Settings2 className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Widgets de la home"
          className="absolute top-full right-0 z-50 mt-2 w-72 max-h-[min(24rem,calc(100vh-6rem))] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-neutral-900 dark:text-gray-100">
                Widgets en la home
              </p>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-gray-400">
                Activá o desactivá cada widget
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-zinc-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <ul className="space-y-2">
            {HOME_WIDGETS.map((widget) => {
              const checked = preferences[widget.id]
              return (
                <li key={widget.id}>
                  <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-neutral-100 px-3 py-2.5 hover:bg-neutral-50 dark:border-zinc-800 dark:hover:bg-zinc-950">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-neutral-900 dark:text-gray-100">
                        {widget.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-neutral-500 dark:text-gray-400">
                        {widget.description}
                      </span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={checked}
                      disabled={saving}
                      onClick={() => void toggle(widget.id, !checked)}
                      className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                        checked ? 'bg-brand-primary' : 'bg-neutral-300 dark:bg-zinc-600'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform dark:bg-zinc-900 ${
                          checked ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
