import { Copy, KeyRound, LockKeyhole, Pencil, Settings2, Shield, Trash2, X } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useUrlEnumParam } from '../hooks/useUrlSearchState'
import toast from 'react-hot-toast'
import { GovernanceExceptionsDrawer } from './GovernanceExceptionsDrawer'
import { PendingUserSetupPanel } from './PendingUserSetupPanel'
import { PendingExternalAccountsPanel } from './PendingExternalAccountsPanel'
import { useAuth } from '../context'
import { useAssignableAreasQuery } from '../hooks/queries/useCatalogQueries'
import { listAssignableRootAreas, type GoverningArea } from '../services/areaService'
import { countActionGrantEntries } from '../services/governanceAccess'
import {
  deleteUser,
  getAllUsers,
  isSuperAdmin,
  isSuperAdminEmail,
  updateManagedAreaIds,
  updateMemberAreaIds,
  updateUserBasicInfo,
  updateUserPermissions,
  updateUserRole,
  type UserPermissions,
  type UserProfile,
} from '../services/userService'
import { resetUserPassword } from '../services/usersApi'
import { isValidReason, REASON_REQUIRED_ERROR, REASON_REQUIRED_LABEL } from '../utils/reasonValidation'

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((value, index) => value === sortedB[index])
}

const PERMISSION_FIELDS: {
  key: 'view_directory' | 'view_drive' | 'rag_assistant'
  label: string
  description: string
}[] = [
  {
    key: 'view_directory',
    label: 'Ver contactos',
    description: 'Muestra Contactos en la barra y permite /directorio',
  },
  {
    key: 'view_drive',
    label: 'Ver archivos',
    description: 'Muestra Archivos en la barra y permite /recursos',
  },
  {
    key: 'rag_assistant',
    label: 'Asistente BacarNet',
    description: 'Muestra el chat del asistente RAG (piloto Sistemas)',
  },
]

function TableSkeleton() {
  return (
    <div className="animate-pulse space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-12 rounded bg-neutral-100 dark:bg-zinc-800" />
      ))}
    </div>
  )
}

function PermissionSwitch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description: string
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-neutral-100 px-4 py-3 transition-colors hover:bg-neutral-50 dark:border-zinc-800 dark:hover:bg-zinc-950">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-900 dark:text-gray-100">{label}</p>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-gray-400">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-brand-primary' : 'bg-neutral-300'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform dark:bg-zinc-900 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  )
}

interface UserPermissionsDrawerProps {
  user: UserProfile
  onClose: () => void
  onSaved: (uid: string) => void
}

function UserPermissionsDrawer({ user, onClose, onSaved }: UserPermissionsDrawerProps) {
  const [permissions, setPermissions] = useState<UserPermissions>({ ...user.permissions })
  const [saving, setSaving] = useState(false)

  useDrawerEscape(onClose)

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateUserPermissions(user.uid, permissions)
      toast.success('Permisos actualizados correctamente')
      onSaved(user.uid)
      onClose()
    } catch (err) {
      console.error('Error al actualizar permisos:', err)
      toast.error('No se pudieron guardar los permisos')
    } finally {
      setSaving(false)
    }
  }

  const togglePermission = (
    key: 'view_directory' | 'view_drive' | 'rag_assistant',
    value: boolean,
  ) => {
    setPermissions((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Cerrar panel"
        className="absolute inset-0 bg-neutral-900/40"
        onClick={onClose}
      />

      <aside className="app-drawer-aside max-w-lg">
        <header className="shrink-0 flex items-start justify-between border-b border-neutral-200 px-6 py-5 dark:border-zinc-800">
          <div>
            <p className="text-brand-primary text-xs font-semibold uppercase tracking-wide">
              Permisos de módulos
            </p>
            <h2 className="mt-1 text-lg font-bold text-neutral-900 dark:text-gray-100">
              {user.displayName}
            </h2>
            <p className="text-sm text-neutral-500 dark:text-gray-400">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-zinc-800 dark:hover:text-gray-300"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="app-drawer-scroll px-6 py-5">
          <p className="mb-3 text-sm font-semibold text-neutral-900 dark:text-gray-100">
            Acceso en la intranet
          </p>
          <div className="space-y-2">
            {PERMISSION_FIELDS.map((field) => (
              <PermissionSwitch
                key={field.key}
                checked={permissions[field.key]}
                onChange={(value) => togglePermission(field.key, value)}
                label={field.label}
                description={field.description}
              />
            ))}
          </div>
        </div>

        <footer className="app-drawer-footer flex gap-3 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-950"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold"
          >
            {saving ? 'Guardando...' : 'Guardar permisos'}
          </button>
        </footer>
      </aside>
    </div>
  )
}

function useDrawerEscape(onClose: () => void) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [onClose])
}

interface EditUserDrawerProps {
  user: UserProfile
  canEditBirthDate: boolean
  onClose: () => void
  onSaved: (uid: string) => void
}

function EditUserDrawer({ user, canEditBirthDate, onClose, onSaved }: EditUserDrawerProps) {
  const { data: areas = [], isLoading: loadingAreas } = useAssignableAreasQuery()
  const [displayName, setDisplayName] = useState(user.displayName)
  const [email, setEmail] = useState(user.email)
  const [department, setDepartment] = useState(user.department)
  const [birthDate, setBirthDate] = useState(user.birthDate ?? '')
  const [selectedMemberAreaIds, setSelectedMemberAreaIds] = useState<string[]>(
    () => [...(user.memberAreaIds ?? [])],
  )
  const [memberAreasReason, setMemberAreasReason] = useState('')
  const [saving, setSaving] = useState(false)

  const departmentOptions = useMemo(() => {
    const names = areas.map((area) => area.name)
    if (department.trim() && !names.includes(department)) {
      return [department, ...names]
    }
    return names
  }, [areas, department])

  useDrawerEscape(onClose)

  const toggleMemberArea = (folderId: string) => {
    setSelectedMemberAreaIds((prev) =>
      prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId],
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const initialMemberAreaIds = user.memberAreaIds ?? []
      const memberAreasChanged = !arraysEqual(selectedMemberAreaIds, initialMemberAreaIds)

      if (memberAreasChanged) {
        if (!isValidReason(memberAreasReason)) {
          toast.error('El motivo de áreas de pertenencia es obligatorio')
          setSaving(false)
          return
        }
      }

      await updateUserBasicInfo(user.uid, {
        displayName,
        email,
        department,
        ...(canEditBirthDate ? { birthDate } : {}),
      })
      if (user.role !== 'super_admin' && memberAreasChanged) {
        await updateMemberAreaIds(user.uid, selectedMemberAreaIds, memberAreasReason.trim())
      }
      toast.success('Datos actualizados correctamente')
      onSaved(user.uid)
      onClose()
    } catch (err) {
      console.error('Error al actualizar usuario:', err)
      toast.error(err instanceof Error ? err.message : 'No se pudieron guardar los cambios')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Cerrar panel"
        className="absolute inset-0 bg-neutral-900/40"
        onClick={onClose}
      />

      <aside className="app-drawer-aside max-w-md shadow-2xl">
        <header className="shrink-0 flex items-start justify-between border-b border-neutral-200 dark:border-zinc-800 px-6 py-5">
          <div>
            <p className="text-brand-primary text-xs font-semibold uppercase tracking-wide">
              Editar usuario
            </p>
            <h2 className="mt-1 text-lg font-bold text-neutral-900 dark:text-gray-100">{user.displayName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-100 dark:bg-zinc-800 hover:text-neutral-700 dark:text-gray-300"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="app-drawer-scroll space-y-5 px-6 py-5">
            <div>
              <label
                htmlFor="edit-display-name"
                className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300"
              >
                Nombre completo
              </label>
              <input
                id="edit-display-name"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="input-brand-focus w-full rounded-lg border border-neutral-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="edit-email"
                className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300"
              >
                Correo electrónico
              </label>
              <input
                id="edit-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-brand-focus w-full rounded-lg border border-neutral-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm"
              />
              <p className="mt-1.5 text-xs text-neutral-400">
                Solo actualiza el perfil en Firestore. Para cambiar la cuenta de Auth en
                producción, usá la consola de Firebase o una Cloud Function.
              </p>
            </div>

            <div>
              <label
                htmlFor="edit-department"
                className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300"
              >
                Departamento
              </label>
              <select
                id="edit-department"
                value={department}
                disabled={loadingAreas || departmentOptions.length === 0}
                onChange={(e) => setDepartment(e.target.value)}
                className="input-brand-focus w-full rounded-lg border border-neutral-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingAreas ? (
                  <option value={department}>Cargando áreas...</option>
                ) : departmentOptions.length === 0 ? (
                  <option value={department}>{department || 'Sin áreas disponibles'}</option>
                ) : (
                  departmentOptions.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))
                )}
              </select>
            </div>

            {canEditBirthDate && (
              <div>
                <label
                  htmlFor="edit-birth-date"
                  className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300"
                >
                  Fecha de nacimiento
                </label>
                <input
                  id="edit-birth-date"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="input-brand-focus w-full rounded-lg border border-neutral-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm [color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>
            )}

            {user.role !== 'super_admin' && (
              <div>
                <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-gray-300">
                  Áreas de pertenencia
                </p>
                <p className="mb-3 text-xs text-neutral-400">
                  Usado para compartir archivos con todo un área. Los jefes del área se incluyen
                  automáticamente aunque no estén listados aquí.
                </p>
                {loadingAreas ? (
                  <p className="text-sm text-neutral-400">Cargando áreas…</p>
                ) : areas.length === 0 ? (
                  <p className="text-sm text-neutral-400">No hay áreas configuradas.</p>
                ) : (
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 p-2 dark:border-zinc-700">
                    {areas.map((folder) => {
                      if (!folder.id) return null
                      const checked = selectedMemberAreaIds.includes(folder.id)
                      return (
                        <li key={folder.id}>
                          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-50 dark:hover:bg-zinc-800">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleMemberArea(folder.id!)}
                              className="rounded border-neutral-300"
                            />
                            <span>{folder.name}</span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}

            {user.role !== 'super_admin' && (
              <div>
                <label
                  htmlFor="edit-member-areas-reason"
                  className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300"
                >
                  Motivo del cambio de áreas de pertenencia
                </label>
                <textarea
                  id="edit-member-areas-reason"
                  value={memberAreasReason}
                  onChange={(e) => setMemberAreasReason(e.target.value)}
                  rows={3}
                  placeholder="Obligatorio si modificás las áreas de pertenencia"
                  className="input-brand-focus w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
            )}
          </div>

          <footer className="app-drawer-footer flex gap-3 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-neutral-300 dark:border-zinc-700 px-4 py-2.5 text-sm font-medium text-neutral-700 dark:text-gray-300 transition-colors hover:bg-neutral-50 dark:bg-zinc-950"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  )
}

type AssignableRole = 'admin' | 'user'

interface RoleAreasDrawerProps {
  user: UserProfile
  onClose: () => void
  onSaved: (uid: string) => void
}

function RoleAreasDrawer({ user, onClose, onSaved }: RoleAreasDrawerProps) {
  useDrawerEscape(onClose)

  const initialRole: AssignableRole = user.role === 'admin' ? 'admin' : 'user'
  const [draftRole, setDraftRole] = useState<AssignableRole>(initialRole)
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>(
    () => [...(user.managedAreaIds ?? [])],
  )
  const [areas, setAreas] = useState<GoverningArea[]>([])
  const [loadingAreas, setLoadingAreas] = useState(true)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saveReason, setSaveReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoadingAreas(true)
    listAssignableRootAreas()
      .then((folders) => {
        if (cancelled) return
        setAreas(folders)
      })
      .catch((err) => {
        console.error('Error al cargar áreas:', err)
        toast.error('No se pudieron cargar las áreas')
        if (!cancelled) setAreas([])
      })
      .finally(() => {
        if (!cancelled) setLoadingAreas(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const areaNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const folder of areas) {
      if (folder.id) map.set(folder.id, folder.name)
    }
    return map
  }, [areas])

  const toggleArea = (folderId: string) => {
    setSelectedAreaIds((prev) =>
      prev.includes(folderId)
        ? prev.filter((id) => id !== folderId)
        : [...prev, folderId],
    )
  }

  const handleConfirm = async () => {
    const initialManagedAreaIds = user.managedAreaIds ?? []
    const roleChanged = draftRole !== initialRole
    const areasChanged = !arraysEqual(selectedAreaIds, initialManagedAreaIds)
    const needsManagedAreasUpdate =
      (draftRole === 'admin' && areasChanged) ||
      (initialRole === 'admin' && draftRole === 'user' && initialManagedAreaIds.length > 0)

    if (!roleChanged && !areasChanged) {
      toast.error('No hay cambios para guardar')
      return
    }

    if (needsManagedAreasUpdate && !isValidReason(saveReason)) {
      toast.error(REASON_REQUIRED_ERROR)
      return
    }

    setSaving(true)
    try {
      if (initialRole === 'admin' && draftRole === 'user') {
        if (initialManagedAreaIds.length > 0) {
          await updateManagedAreaIds(user.uid, [], saveReason.trim())
        }
        if (roleChanged) {
          await updateUserRole(user.uid, 'user')
        }
      } else {
        if (roleChanged) {
          await updateUserRole(user.uid, draftRole)
        }
        if (draftRole === 'admin' && areasChanged) {
          await updateManagedAreaIds(user.uid, selectedAreaIds, saveReason.trim())
        }
      }
      toast.success('Rol actualizado')
      setConfirmOpen(false)
      onSaved(user.uid)
      onClose()
    } catch (err) {
      console.error('Error al guardar rol/áreas:', err)
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar el rol')
    } finally {
      setSaving(false)
    }
  }

  const selectedAreaLabels = selectedAreaIds.map(
    (id) => areaNameById.get(id) ?? id,
  )

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <aside className="app-drawer-aside max-w-md shadow-xl">
        <header className="shrink-0 flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-zinc-800">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-gray-100">
              Gestionar rol
            </h3>
            <p className="mt-0.5 truncate text-sm text-neutral-500 dark:text-gray-400">
              {user.displayName || user.email}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-zinc-800"
            aria-label="Cerrar drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="app-drawer-scroll space-y-6 px-6 py-5">
          <div>
            <label
              htmlFor="assign-role"
              className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300"
            >
              Rol
            </label>
            <select
              id="assign-role"
              value={draftRole}
              onChange={(e) => setDraftRole(e.target.value as AssignableRole)}
              className="input-brand-focus w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="user">Usuario</option>
              <option value="admin">Administrador de área</option>
            </select>
            <p className="mt-1.5 text-xs text-neutral-400">
              Super admin no se asigna desde aquí (solo Firestore Console).
            </p>
          </div>

          {draftRole === 'admin' && (
            <div>
              <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-gray-300">
                Áreas administradas
              </p>
              {loadingAreas ? (
                <p className="text-sm text-neutral-400">Cargando carpetas…</p>
              ) : areas.length === 0 ? (
                <p className="text-sm text-neutral-500">No hay áreas de primer nivel.</p>
              ) : (
                <ul className="space-y-2">
                  {areas.map((folder) => {
                    if (!folder.id) return null
                    const checked = selectedAreaIds.includes(folder.id)
                    return (
                      <li key={folder.id}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-neutral-100 px-3 py-2.5 hover:bg-neutral-50 dark:border-zinc-800 dark:hover:bg-zinc-950">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleArea(folder.id!)}
                            className="h-4 w-4 rounded border-neutral-300 text-brand-primary focus:ring-brand-primary"
                          />
                          <span className="text-sm text-neutral-800 dark:text-gray-200">
                            {folder.name}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        <footer className="app-drawer-footer flex gap-3 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 dark:border-zinc-700 dark:text-gray-300"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold"
          >
            Guardar
          </button>
        </footer>
      </aside>

      {confirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-confirm-title"
            className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <h4
              id="role-confirm-title"
              className="text-lg font-semibold text-neutral-900 dark:text-gray-100"
            >
              Confirmar cambio de rol
            </h4>
            <div className="mt-3 space-y-2 text-sm text-neutral-600 dark:text-gray-300">
              <p>
                <span className="font-medium text-neutral-800 dark:text-gray-100">Usuario:</span>{' '}
                {user.email}
              </p>
              <p>
                <span className="font-medium text-neutral-800 dark:text-gray-100">Rol:</span>{' '}
                {initialRole} → <span className="font-semibold text-brand-primary">{draftRole}</span>
              </p>
              {draftRole === 'admin' && (
                <p>
                  <span className="font-medium text-neutral-800 dark:text-gray-100">Áreas:</span>{' '}
                  {selectedAreaLabels.length > 0
                    ? selectedAreaLabels.join(', ')
                    : '(ninguna)'}
                </p>
              )}
            </div>
            {(draftRole === 'admin' && !arraysEqual(selectedAreaIds, user.managedAreaIds ?? [])) ||
            (initialRole === 'admin' &&
              draftRole === 'user' &&
              (user.managedAreaIds ?? []).length > 0) ? (
              <div className="mt-4">
                <label
                  htmlFor="role-areas-reason"
                  className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300"
                >
                  {REASON_REQUIRED_LABEL}
                </label>
                <textarea
                  id="role-areas-reason"
                  value={saveReason}
                  onChange={(e) => setSaveReason(e.target.value)}
                  rows={3}
                  className="input-brand-focus w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={saving}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-zinc-600"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={saving}
                className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? 'Guardando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PasswordResetDrawer({
  user,
  currentUid,
  onClose,
}: {
  user: UserProfile
  currentUid: string | undefined
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ email: string; temporaryPassword: string } | null>(null)

  const isSelf = user.uid === currentUid

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (isSelf) {
      toast.error('No podés restablecer tu propia contraseña desde acá')
      return
    }
    if (!isValidReason(reason)) {
      toast.error(REASON_REQUIRED_ERROR)
      return
    }
    setSaving(true)
    try {
      const out = await resetUserPassword(user.uid, reason.trim())
      setResult({ email: out.email, temporaryPassword: out.temporaryPassword })
      toast.success('Contraseña restablecida')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo restablecer la contraseña')
    } finally {
      setSaving(false)
    }
  }

  const copyPassword = async () => {
    if (!result?.temporaryPassword) return
    try {
      await navigator.clipboard.writeText(result.temporaryPassword)
      toast.success('Contraseña copiada')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-labelledby="password-reset-title"
        className="w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-zinc-800">
          <h2 id="password-reset-title" className="text-lg font-semibold text-neutral-900 dark:text-gray-100">
            Restablecer contraseña
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-zinc-800"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm text-neutral-600 dark:text-gray-400">
            <span className="font-medium text-neutral-900 dark:text-gray-100">
              {user.displayName || user.email}
            </span>
            <br />
            {user.email}
          </p>

          {isSelf ? (
            <p className="mt-4 text-sm text-amber-800 dark:text-amber-300">
              No podés restablecer tu propia contraseña desde este panel.
            </p>
          ) : result ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-neutral-600 dark:text-gray-400">
                Compartí esta contraseña temporal con la persona. No se volverá a mostrar.
              </p>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
                <p className="text-xs font-medium text-neutral-500 dark:text-gray-400">Contraseña temporal</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 break-all text-sm font-semibold text-neutral-900 dark:text-gray-100">
                    {result.temporaryPassword}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyPassword()}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 hover:bg-white dark:border-zinc-600 dark:text-gray-300 dark:hover:bg-zinc-800"
                    aria-label="Copiar contraseña"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white"
              >
                Listo
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="password-reset-reason"
                  className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300"
                >
                  {REASON_REQUIRED_LABEL}
                </label>
                <textarea
                  id="password-reset-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="input-brand-focus w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  placeholder="Motivo del restablecimiento (ej. usuario olvidó su contraseña)"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-zinc-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? 'Restableciendo…' : 'Restablecer contraseña'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function UserRoleBadge({ role }: { role: UserProfile['role'] }) {
  if (role === 'super_admin') {
    return (
      <span className="inline-flex rounded-full bg-brand-primary/10 px-2.5 py-0.5 text-xs font-semibold text-brand-primary">
        Super admin
      </span>
    )
  }
  if (role === 'admin') {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        Admin de área
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-zinc-800 dark:text-gray-400">
      Usuario
    </span>
  )
}

function RegisteredUserActions({
  user,
  canAssignRoles,
  currentUid,
  deletingId,
  onEdit,
  onRole,
  onPermissions,
  onExceptions,
  onPasswordReset,
  onDelete,
}: {
  user: UserProfile
  canAssignRoles: boolean
  currentUid: string | undefined
  deletingId: string | null
  onEdit: () => void
  onRole: () => void
  onPermissions: () => void
  onExceptions: () => void
  onPasswordReset: () => void
  onDelete: () => void
}) {
  const actionClass =
    'inline-flex h-11 w-11 items-center justify-center rounded-lg text-neutral-600 transition-colors md:h-8 md:w-8 dark:text-gray-400'

  return (
    <>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Editar ${user.displayName}`}
        className={`${actionClass} hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-zinc-800 dark:hover:text-gray-100`}
      >
        <Pencil className="h-4 w-4" />
      </button>
      {canAssignRoles && user.role !== 'super_admin' && (
        <button
          type="button"
          onClick={onRole}
          aria-label={`Gestionar rol de ${user.displayName}`}
          className={`${actionClass} hover:bg-amber-50 hover:text-amber-800 dark:hover:bg-amber-950/40 dark:hover:text-amber-300`}
        >
          <Shield className="h-4 w-4" />
        </button>
      )}
      {canAssignRoles && user.role !== 'super_admin' && (
        <button
          type="button"
          onClick={onPermissions}
          aria-label={`Permisos de módulos de ${user.displayName}`}
          className={`${actionClass} hover:border-brand-primary/25 hover:bg-brand-tint hover:text-brand-primary dark:hover:border-brand-primary/40 dark:hover:bg-brand-primary-hover/40`}
        >
          <Settings2 className="h-4 w-4" />
        </button>
      )}
      {canAssignRoles && user.role !== 'super_admin' && (
        <button
          type="button"
          onClick={onExceptions}
          aria-label={`Excepciones de gobernanza de ${user.displayName}`}
          title="Excepciones de gobernanza"
          className={`${actionClass} hover:bg-violet-50 hover:text-violet-700 dark:hover:bg-violet-950/40 dark:hover:text-violet-300`}
        >
          <KeyRound className="h-4 w-4" />
        </button>
      )}
      {canAssignRoles && user.uid !== currentUid && (
        <button
          type="button"
          onClick={onPasswordReset}
          aria-label={`Restablecer contraseña de ${user.displayName}`}
          title="Restablecer contraseña"
          className={`${actionClass} hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-sky-950/40 dark:hover:text-sky-300`}
        >
          <LockKeyhole className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        disabled={deletingId === user.uid}
        aria-label={`Eliminar ${user.displayName}`}
        className={`${actionClass} text-brand-primary hover:bg-brand-tint disabled:opacity-50`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  )
}

function ManagedAreasCell({
  user,
  areaNameById,
}: {
  user: UserProfile
  areaNameById: Map<string, string>
}) {
  const exceptionCount = countActionGrantEntries(user.actionGrants)

  if (user.role === 'super_admin') {
    return <span className="text-neutral-400">Todo</span>
  }

  const managedIds = user.managedAreaIds ?? []
  if (managedIds.length === 0 && exceptionCount === 0) {
    return <span className="text-neutral-400">—</span>
  }

  const visible = managedIds.slice(0, 2)
  const hiddenCount = managedIds.length - visible.length

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((id) => (
        <span
          key={id}
          className="inline-flex max-w-[8rem] truncate rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          title={areaNameById.get(id) ?? id}
        >
          {areaNameById.get(id) ?? id}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-zinc-800 dark:text-gray-400">
          +{hiddenCount}
        </span>
      )}
      {managedIds.length === 0 && exceptionCount > 0 && (
        <span className="text-neutral-400">—</span>
      )}
      {exceptionCount > 0 && (
        <span
          className="inline-flex rounded-full border border-brand-primary/25 bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand-primary"
          title="Excepciones de gobernanza (acciones puntuales)"
        >
          +{exceptionCount} excepc.{exceptionCount === 1 ? '' : 'es'}
        </span>
      )}
    </div>
  )
}

export function UserManager() {
  const { user: currentAuthUser, userProfile, refreshProfile } = useAuth()
  const canAssignRoles =
    isSuperAdmin(userProfile) || isSuperAdminEmail(userProfile?.email)
  const showPendingTab = isSuperAdmin(userProfile)
  const [activePanel, setActivePanel] = useUrlEnumParam(
    'panel',
    ['registered', 'pending_setup', 'external_approval'],
    'registered',
  )
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [permissionsUser, setPermissionsUser] = useState<UserProfile | null>(null)
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [roleUser, setRoleUser] = useState<UserProfile | null>(null)
  const [exceptionsUser, setExceptionsUser] = useState<UserProfile | null>(null)
  const [passwordResetUser, setPasswordResetUser] = useState<UserProfile | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [governingAreas, setGoverningAreas] = useState<GoverningArea[]>([])

  const areaNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const area of governingAreas) {
      if (area.id) map.set(area.id, area.name)
    }
    return map
  }, [governingAreas])

  useEffect(() => {
    if (!canAssignRoles) return
    let cancelled = false
    listAssignableRootAreas()
      .then((rows) => {
        if (!cancelled) setGoverningAreas(rows)
      })
      .catch((err) => {
        console.error('Error al cargar áreas para listado:', err)
      })
    return () => {
      cancelled = true
    }
  }, [canAssignRoles])

  const loadUsers = useCallback(async () => {
    try {
      const data = await getAllUsers()
      setUsers(data)
      setError(null)
    } catch (err) {
      console.error('Error al cargar usuarios:', err)
      setUsers([])
      setError('No se pudieron cargar los usuarios.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const handleSaved = async (uid: string) => {
    await loadUsers()
    if (currentAuthUser?.uid === uid) {
      await refreshProfile()
    }
  }

  const handleDelete = async (user: UserProfile) => {
    if (user.uid === currentAuthUser?.uid) {
      toast.error('No podés eliminar tu propia cuenta desde aquí')
      return
    }

    const confirmed = window.confirm(
      `¿Eliminar definitivamente a "${user.displayName || user.email}"?\n\n` +
        'Se borrará su perfil en Firestore.\n' +
        'La cuenta en Firebase Authentication deberá eliminarse por separado en la consola de Firebase.',
    )
    if (!confirmed) return

    setDeletingId(user.uid)

    try {
      await deleteUser(user.uid)
      toast.success('Usuario eliminado del sistema')
      await loadUsers()
      if (permissionsUser?.uid === user.uid) setPermissionsUser(null)
      if (editingUser?.uid === user.uid) setEditingUser(null)
      if (roleUser?.uid === user.uid) setRoleUser(null)
      if (exceptionsUser?.uid === user.uid) setExceptionsUser(null)
    } catch (err) {
      console.error('Error al eliminar usuario:', err)
      toast.error('No se pudo eliminar el usuario')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="w-full min-w-0">
      {showPendingTab && (
        <div className="mb-6 max-w-full overflow-x-auto overscroll-x-contain border-b border-neutral-200 dark:border-zinc-800">
          <div className="inline-flex min-w-full gap-2">
          <button
            type="button"
            onClick={() => setActivePanel('registered')}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activePanel === 'registered'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Registrados
          </button>
          <button
            type="button"
            onClick={() => setActivePanel('pending_setup')}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activePanel === 'pending_setup'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <span className="sm:hidden">Conf. pend.</span>
            <span className="hidden sm:inline">Configuración pendiente</span>
          </button>
          <button
            type="button"
            onClick={() => setActivePanel('external_approval')}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activePanel === 'external_approval'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <span className="sm:hidden">Cuentas pend.</span>
            <span className="hidden sm:inline">Cuentas pendientes</span>
          </button>
          </div>
        </div>
      )}

      {activePanel === 'pending_setup' && showPendingTab ? (
        <PendingUserSetupPanel />
      ) : activePanel === 'external_approval' && showPendingTab ? (
        <PendingExternalAccountsPanel />
      ) : (
        <>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-gray-100">Usuarios registrados</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
          Gestioná datos y roles de cada cuenta
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="md:hidden">
          {loading ? (
            <TableSkeleton />
          ) : error ? (
            <p className="px-4 py-12 text-center text-sm text-danger">{error}</p>
          ) : users.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-neutral-500 dark:text-gray-400">
              No hay usuarios registrados.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-zinc-800">
              {users.map((user) => (
                <li key={user.uid} className="p-4">
                  <p className="font-semibold text-neutral-900 dark:text-gray-100">
                    {user.displayName || '—'}
                  </p>
                  <p className="mt-1 break-all text-sm text-neutral-600 dark:text-gray-400">{user.email}</p>

                  <dl className="mt-3 space-y-2.5 text-sm">
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-gray-400">
                        Departamento
                      </dt>
                      <dd className="mt-0.5 text-neutral-700 dark:text-gray-300">{user.department || '—'}</dd>
                    </div>
                    {canAssignRoles ? (
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-gray-400">
                          Rol
                        </dt>
                        <dd className="mt-1">
                          <UserRoleBadge role={user.role} />
                        </dd>
                      </div>
                    ) : null}
                    {canAssignRoles ? (
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-gray-400">
                          Gobierna
                        </dt>
                        <dd className="mt-1">
                          <ManagedAreasCell user={user} areaNameById={areaNameById} />
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  <div className="mt-4 flex flex-wrap gap-1">
                    <RegisteredUserActions
                      user={user}
                      canAssignRoles={canAssignRoles}
                      currentUid={currentAuthUser?.uid}
                      deletingId={deletingId}
                      onEdit={() => setEditingUser(user)}
                      onRole={() => setRoleUser(user)}
                      onPermissions={() => setPermissionsUser(user)}
                      onExceptions={() => setExceptionsUser(user)}
                      onPasswordReset={() => setPasswordResetUser(user)}
                      onDelete={() => void handleDelete(user)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 dark:border-zinc-800 dark:bg-zinc-950">
                <th className="px-5 py-3.5 font-semibold text-neutral-700 dark:text-gray-300">Nombre</th>
                <th className="px-5 py-3.5 font-semibold text-neutral-700 dark:text-gray-300">Email</th>
                <th className="px-5 py-3.5 font-semibold text-neutral-700 dark:text-gray-300">Departamento</th>
                {canAssignRoles && (
                  <th className="px-5 py-3.5 font-semibold text-neutral-700 dark:text-gray-300">Rol</th>
                )}
                {canAssignRoles && (
                  <th className="px-5 py-3.5 font-semibold text-neutral-700 dark:text-gray-300">
                    Gobierna
                  </th>
                )}
                <th className="px-5 py-3.5 text-right font-semibold text-neutral-700 dark:text-gray-300">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canAssignRoles ? 6 : 4}>
                    <TableSkeleton />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td
                    colSpan={canAssignRoles ? 6 : 4}
                    className="px-5 py-12 text-center text-danger"
                  >
                    {error}
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={canAssignRoles ? 6 : 4}
                    className="px-5 py-12 text-center text-neutral-500 dark:text-gray-400"
                  >
                    No hay usuarios registrados.
                  </td>
                </tr>
              ) : (
                users.map((user, index) => (
                  <tr
                    key={user.uid}
                    className={`border-b border-neutral-100 transition-colors hover:bg-neutral-50 dark:border-zinc-800 dark:bg-zinc-950/80 dark:hover:bg-zinc-900/40 ${
                      index === users.length - 1 ? 'border-b-0' : ''
                    }`}
                  >
                    <td className="px-5 py-4 font-medium text-neutral-900 dark:text-gray-100">
                      {user.displayName || '—'}
                    </td>
                    <td className="px-5 py-4 text-neutral-600 dark:text-gray-400">{user.email}</td>
                    <td className="px-5 py-4 text-neutral-600 dark:text-gray-400">{user.department}</td>
                    {canAssignRoles && (
                      <td className="px-5 py-4">
                        <UserRoleBadge role={user.role} />
                      </td>
                    )}
                    {canAssignRoles && (
                      <td className="px-5 py-4">
                        <ManagedAreasCell user={user} areaNameById={areaNameById} />
                      </td>
                    )}
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <RegisteredUserActions
                          user={user}
                          canAssignRoles={canAssignRoles}
                          currentUid={currentAuthUser?.uid}
                          deletingId={deletingId}
                          onEdit={() => setEditingUser(user)}
                          onRole={() => setRoleUser(user)}
                          onPermissions={() => setPermissionsUser(user)}
                          onExceptions={() => setExceptionsUser(user)}
                          onPasswordReset={() => setPasswordResetUser(user)}
                          onDelete={() => void handleDelete(user)}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && users.length > 0 && (
          <div className="border-t border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-zinc-950 px-5 py-3 text-xs text-neutral-500 dark:text-gray-400">
            {users.length} {users.length === 1 ? 'usuario' : 'usuarios'}
          </div>
        )}
      </div>

      {editingUser && (
        <EditUserDrawer
          user={editingUser}
          canEditBirthDate={showPendingTab}
          onClose={() => setEditingUser(null)}
          onSaved={handleSaved}
        />
      )}

      {permissionsUser && (
        <UserPermissionsDrawer
          user={permissionsUser}
          onClose={() => setPermissionsUser(null)}
          onSaved={handleSaved}
        />
      )}

      {roleUser && canAssignRoles && (
        <RoleAreasDrawer
          user={roleUser}
          onClose={() => setRoleUser(null)}
          onSaved={handleSaved}
        />
      )}

      {exceptionsUser && canAssignRoles && (
        <GovernanceExceptionsDrawer
          user={exceptionsUser}
          onClose={() => setExceptionsUser(null)}
          onSaved={handleSaved}
        />
      )}

      {passwordResetUser && canAssignRoles && (
        <PasswordResetDrawer
          user={passwordResetUser}
          currentUid={currentAuthUser?.uid}
          onClose={() => setPasswordResetUser(null)}
        />
      )}
        </>
      )}
    </section>
  )
}
