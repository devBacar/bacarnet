import { Settings2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../context'
import { useGlobalSettings } from '../context/GlobalSettingsContext'
import {
  updateGlobalSettings,
  type GlobalModuleFlag,
  type GlobalSettings,
} from '../services/configService'

interface ModuleToggleProps {
  id: GlobalModuleFlag
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function ModuleToggle({ id, label, description, checked, onChange }: ModuleToggleProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-sm font-semibold text-neutral-900 dark:text-gray-100">
          {label}
        </label>
        <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 ${
          checked ? 'bg-brand-primary' : 'bg-neutral-300'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-zinc-900 shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

const MODULE_TOGGLES: {
  key: GlobalModuleFlag
  label: string
  description: string
}[] = [
  {
    key: 'resourcesEnabled',
    label: 'Mostrar Archivos',
    description: 'Visible en la navegación y accesible la ruta /recursos para empleados.',
  },
  {
    key: 'directoryEnabled',
    label: 'Mostrar Contactos',
    description: 'Incluye la pestaña Contactos y el widget de cumpleaños en el inicio.',
  },
  {
    key: 'boardsEnabled',
    label: 'Mostrar Tableros',
    description: 'Sección Mis Tableros en el inicio, enlace en la navegación y rutas /tableros.',
  },
  {
    key: 'notificationsEnabled',
    label: 'Mostrar Notificaciones',
    description: 'Campana de notificaciones en la barra superior para todos los empleados.',
  },
  {
    key: 'newsEnabled',
    label: 'Mostrar Noticias',
    description: 'Feed de noticias internas y widget de noticias externas en el inicio.',
  },
  {
    key: 'kudosEnabled',
    label: 'Mostrar Reconocimientos (Kudos)',
    description: 'Muro de reconocimientos y envío de kudos en el dashboard principal.',
  },
  {
    key: 'pollsEnabled',
    label: 'Mostrar Encuestas Rápidas',
    description: 'Widget de encuesta activa en la columna lateral del inicio.',
  },
]

export function ModuleSettings() {
  const { userProfile } = useAuth()
  const { settings: liveSettings, loading, permissionDenied } = useGlobalSettings()
  const isSuperAdmin = userProfile?.permissions.super_admin === true

  const [draft, setDraft] = useState<GlobalSettings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!loading) {
      setDraft(liveSettings)
    }
  }, [liveSettings, loading])

  if (!isSuperAdmin) {
    return null
  }

  const handleToggle = (key: GlobalModuleFlag, value: boolean) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const handleSave = async () => {
    if (!draft) return

    setSaving(true)
    try {
      await updateGlobalSettings(draft)
      toast.success('Configuración global guardada')
    } catch (err) {
      console.error('Error al guardar configuración:', err)
      const code = (err as { code?: string }).code
      if (code === 'permission-denied') {
        toast.error(
          'Sin permisos en Firestore. Publicá las reglas de global_settings en Firebase Console.',
        )
      } else {
        toast.error('No se pudo guardar la configuración')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card-minimal overflow-hidden">
      <div className="border-b border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-zinc-950 px-4 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary text-white">
            <Settings2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-gray-100">Visibilidad de módulos</h2>
            <p className="text-sm text-neutral-500 dark:text-gray-400">
              Activá o desactivá secciones de la intranet para todos los empleados
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        {permissionDenied && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">Reglas de Firestore pendientes</p>
            <p className="mt-1 text-amber-800 dark:text-amber-300">
              Publicá en Firebase Console → Firestore → Reglas el bloque{' '}
              <code className="rounded bg-amber-100 px-1">global_settings</code>. Mientras tanto
              se usan valores por defecto (todos los módulos activos).
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
          </div>
        ) : !draft ? (
          <p className="text-sm text-neutral-500 dark:text-gray-400">No se pudo cargar la configuración.</p>
        ) : (
          <>
            <div className="space-y-3">
              {MODULE_TOGGLES.map(({ key, label, description }) => (
                <ModuleToggle
                  key={key}
                  id={key}
                  label={label}
                  description={description}
                  checked={draft[key]}
                  onChange={(value) => handleToggle(key, value)}
                />
              ))}
            </div>

            <div className="flex justify-end border-t border-neutral-100 dark:border-zinc-800 pt-6">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="btn-primary w-full rounded-lg px-6 py-3 text-sm font-semibold sm:w-auto"
              >
                {saving ? 'Guardando...' : 'Guardar configuración global'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
