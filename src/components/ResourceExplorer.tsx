import {
  ChevronRight,
  FolderOpen,
  FormInput,
  HardDrive,
  KeyRound,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  createFolder,
  createResourceItem,
  deleteFolder,
  deleteResourceItem,
  getFoldersAndItems,
  isFolderPublic,
  isResourcePublic,
  resolveRootAreaIdForFolder,
  getFolderById,
  updateFolderName,
  updateResourceItem,
  updateFolderPermissions,
  updateResourcePermissions,
  type Folder,
  type ResourceItem,
} from '../services/folderService'
import {
  getAllUsers,
  isAdminOfArea,
  type UserProfile,
} from '../services/userService'
import { useAuth } from '../context'

type BreadcrumbItem = { id: string | null; name: string }

type PermissionTarget =
  | { kind: 'folder'; item: Folder }
  | { kind: 'resource'; item: ResourceItem }

type EditTarget =
  | { kind: 'folder'; item: Folder }
  | { kind: 'resource'; item: ResourceItem }

const RESOURCE_TYPES: { value: ResourceItem['type']; label: string }[] = [
  { value: 'link', label: 'Enlace' },
  { value: 'drive', label: 'Google Drive' },
  { value: 'form', label: 'Formulario' },
]

function ResourceTypeIcon({
  type,
  className,
}: {
  type: ResourceItem['type'] | 'folder'
  className?: string
}) {
  switch (type) {
    case 'folder':
      return <FolderOpen className={className} />
    case 'drive':
      return <HardDrive className={className} />
    case 'form':
      return <FormInput className={className} />
    default:
      return <Link2 className={className} />
  }
}

function accessLabel(allowedUsers: string[]) {
  if (allowedUsers.length === 0) return 'Público'
  return `${allowedUsers.length} usuario${allowedUsers.length === 1 ? '' : 's'}`
}

interface PermissionsModalProps {
  target: PermissionTarget
  onClose: () => void
  onUpdated: () => void
}

function PermissionsModal({ target, onClose, onUpdated }: PermissionsModalProps) {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [allowedUsers, setAllowedUsers] = useState<string[]>(target.item.allowedUsers)
  const [loading, setLoading] = useState(true)
  const [togglingUid, setTogglingUid] = useState<string | null>(null)

  const targetName = target.item.name
  const targetId = target.item.id!

  useEffect(() => {
    getAllUsers()
      .then(setUsers)
      .catch((err) => {
        console.error('Error al cargar usuarios:', err)
        toast.error('No se pudieron cargar los usuarios')
      })
      .finally(() => setLoading(false))
  }, [])

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

  const handleToggle = async (uid: string, granted: boolean) => {
    setTogglingUid(uid)

    const next = granted
      ? allowedUsers.includes(uid)
        ? allowedUsers
        : [...allowedUsers, uid]
      : allowedUsers.filter((id) => id !== uid)

    try {
      if (target.kind === 'folder') {
        await updateFolderPermissions(targetId, next)
      } else {
        await updateResourcePermissions(targetId, next)
      }
      setAllowedUsers(next)
      onUpdated()
      toast.success(granted ? 'Acceso concedido' : 'Acceso revocado')
    } catch (err) {
      console.error('Error al actualizar permisos:', err)
      toast.error('No se pudo actualizar el acceso')
    } finally {
      setTogglingUid(null)
    }
  }

  const isPublic = allowedUsers.length === 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-neutral-900/50"
        onClick={onClose}
      />

      <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white dark:bg-zinc-900 shadow-2xl">
        <header className="flex items-start justify-between border-b border-neutral-200 dark:border-zinc-800 px-6 py-5">
          <div>
            <div className="mb-2 flex items-center gap-2 text-brand-primary">
              <KeyRound className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-wide">Permisos de acceso</p>
            </div>
            <h2 className="text-lg font-bold text-neutral-900 dark:text-gray-100">{targetName}</h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
              {isPublic
                ? 'Público — visible para todos los usuarios'
                : `Restringido — ${accessLabel(allowedUsers)}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 dark:bg-zinc-800 hover:text-neutral-700 dark:text-gray-300"
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="mb-3 text-xs text-neutral-500 dark:text-gray-400">
            Sin usuarios marcados el recurso es público. Al marcar usuarios, solo ellos podrán
            acceder.
          </p>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
            </div>
          ) : users.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-gray-400">No hay usuarios registrados.</p>
          ) : (
            <ul className="space-y-1">
              {users.map((user) => {
                const checked = allowedUsers.includes(user.uid)
                return (
                  <li key={user.uid}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                        checked
                          ? 'border-brand-primary/25 dark:border-brand-primary/40 bg-brand-tint'
                          : 'border-neutral-100 dark:border-zinc-800 hover:bg-neutral-50 dark:bg-zinc-950'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={togglingUid === user.uid}
                        onChange={(e) => handleToggle(user.uid, e.target.checked)}
                        className="h-4 w-4 rounded border-neutral-300 dark:border-zinc-700 text-brand-primary focus:ring-brand-primary/20"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900 dark:text-gray-100">
                          {user.displayName || user.email}
                        </p>
                        <p className="truncate text-xs text-neutral-500 dark:text-gray-400">{user.email}</p>
                      </div>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <footer className="border-t border-neutral-200 dark:border-zinc-800 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="btn-primary w-full rounded-lg py-2.5 text-sm font-semibold"
          >
            Listo
          </button>
        </footer>
      </div>
    </div>
  )
}

interface EditModalProps {
  target: EditTarget
  onClose: () => void
  onSaved: (folderId?: string, newName?: string) => void
}

function EditModal({ target, onClose, onSaved }: EditModalProps) {
  const [name, setName] = useState(target.item.name)
  const [url, setUrl] = useState(target.kind === 'resource' ? target.item.url : '')
  const [type, setType] = useState<ResourceItem['type']>(
    target.kind === 'resource' ? target.item.type : 'link',
  )
  const [saving, setSaving] = useState(false)

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (target.kind === 'resource' && !url.trim()) return

    setSaving(true)
    try {
      if (target.kind === 'folder') {
        await updateFolderName(target.item.id!, name.trim())
        toast.success('Carpeta actualizada')
        onSaved(target.item.id, name.trim())
      } else {
        await updateResourceItem(target.item.id!, {
          name: name.trim(),
          url: url.trim(),
          type,
        })
        toast.success('Recurso actualizado')
        onSaved()
      }
      onClose()
    } catch (err) {
      console.error('Error al actualizar:', err)
      toast.error('No se pudieron guardar los cambios')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-neutral-900/50"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md app-modal-panel shadow-2xl">
        <header className="shrink-0 flex items-start justify-between border-b border-neutral-200 dark:border-zinc-800 px-6 py-5">
          <div>
            <p className="text-brand-primary text-xs font-semibold uppercase tracking-wide">
              {target.kind === 'folder' ? 'Editar carpeta' : 'Editar recurso'}
            </p>
            <h2 className="mt-1 text-lg font-bold text-neutral-900 dark:text-gray-100">{target.item.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 dark:bg-zinc-800 hover:text-neutral-700 dark:text-gray-300"
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div>
            <label htmlFor="edit-name" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300">
              Nombre
            </label>
            <input
              id="edit-name"
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-brand-focus w-full rounded-lg border border-neutral-300 dark:border-zinc-700 px-3 py-2.5 text-sm"
            />
          </div>

          {target.kind === 'resource' && (
            <>
              <div>
                <label htmlFor="edit-url" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300">
                  URL
                </label>
                <input
                  id="edit-url"
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="input-brand-focus w-full rounded-lg border border-neutral-300 dark:border-zinc-700 px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="edit-type" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300">
                  Tipo
                </label>
                <select
                  id="edit-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as ResourceItem['type'])}
                  className="input-brand-focus w-full rounded-lg border border-neutral-300 dark:border-zinc-700 px-3 py-2.5 text-sm"
                >
                  {RESOURCE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <footer className="flex gap-3 border-t border-neutral-200 dark:border-zinc-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-neutral-300 dark:border-zinc-700 px-4 py-2.5 text-sm font-medium text-neutral-700 dark:text-gray-300 hover:bg-neutral-50 dark:bg-zinc-950"
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
      </div>
    </div>
  )
}

export type ResourceExplorerMode = 'super' | 'areaAdmin'

export function ResourceExplorer({ mode = 'super' }: { mode?: ResourceExplorerMode }) {
  const { userProfile } = useAuth()
  const isAreaMode = mode === 'areaAdmin'
  // Evitar `?? []` suelto: nueva referencia cada render → loadContents en loop infinito
  const managedAreaIds = useMemo(
    () => userProfile?.managedAreaIds ?? [],
    [userProfile?.managedAreaIds],
  )

  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([
    { id: null, name: isAreaMode ? 'Mis áreas' : 'Raíz' },
  ])
  const [folders, setFolders] = useState<Folder[]>([])
  const [items, setItems] = useState<ResourceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [permissionTarget, setPermissionTarget] = useState<PermissionTarget | null>(null)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)

  const [showFolderForm, setShowFolderForm] = useState(false)
  const [showResourceForm, setShowResourceForm] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [resourceName, setResourceName] = useState('')
  const [resourceUrl, setResourceUrl] = useState('')
  const [resourceType, setResourceType] = useState<ResourceItem['type']>('link')
  const [submitting, setSubmitting] = useState(false)

  const currentFolderId = breadcrumb[breadcrumb.length - 1].id
  const atRoot = currentFolderId === null
  const canCreateHere = !isAreaMode || !atRoot
  const loadGenerationRef = useRef(0)

  const assertAreaAccess = useCallback(
    async (folder: Folder): Promise<boolean> => {
      if (!isAreaMode) return true
      const areaId =
        folder.rootAreaId ??
        (folder.parentFolderId === null ? folder.id : null) ??
        (folder.id ? await resolveRootAreaIdForFolder(folder.id) : null)

      if (!areaId || !isAdminOfArea(userProfile, areaId)) {
        toast.error('No tenés permiso sobre esta área')
        return false
      }
      return true
    },
    [isAreaMode, userProfile],
  )

  const loadContents = useCallback(async () => {
    const generation = ++loadGenerationRef.current
    setLoading(true)
    try {
      if (isAreaMode && currentFolderId === null) {
        const data = await getFoldersAndItems(null)
        if (generation !== loadGenerationRef.current) return
        const filtered = data.folders.filter(
          (folder) =>
            Boolean(folder.id) &&
            managedAreaIds.includes(folder.id!) &&
            isAdminOfArea(userProfile, folder.id!),
        )
        setFolders(filtered)
        setItems([])
      } else if (isAreaMode && currentFolderId) {
        const areaId = await resolveRootAreaIdForFolder(currentFolderId)
        if (generation !== loadGenerationRef.current) return
        if (!areaId || !isAdminOfArea(userProfile, areaId)) {
          toast.error('No tenés permiso sobre esta área')
          setBreadcrumb([{ id: null, name: 'Mis áreas' }])
          setFolders([])
          setItems([])
          return
        }
        const data = await getFoldersAndItems(currentFolderId)
        if (generation !== loadGenerationRef.current) return
        setFolders(data.folders)
        setItems(data.items)
      } else {
        const data = await getFoldersAndItems(currentFolderId)
        if (generation !== loadGenerationRef.current) return
        setFolders(data.folders)
        setItems(data.items)
      }
    } catch (err) {
      if (generation !== loadGenerationRef.current) return
      const firestoreErr = err as { code?: string; message?: string }
      console.error('Error al cargar recursos:', {
        err,
        code: firestoreErr?.code,
        message: firestoreErr?.message ?? (err instanceof Error ? err.message : String(err)),
        currentFolderId,
        mode: isAreaMode ? 'areaAdmin' : 'super',
      })
      toast.error('No se pudieron cargar los recursos')
      setFolders([])
      setItems([])
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false)
      }
    }
  }, [currentFolderId, isAreaMode, managedAreaIds, userProfile])

  useEffect(() => {
    loadContents()
  }, [loadContents])

  const enterFolder = async (folder: Folder) => {
    if (!folder.id) return
    const ok = await assertAreaAccess(folder)
    if (!ok) return
    setBreadcrumb((prev) => [...prev, { id: folder.id!, name: folder.name }])
  }

  const navigateToBreadcrumb = (index: number) => {
    setBreadcrumb((prev) => prev.slice(0, index + 1))
  }

  const handleEditSaved = async (folderId?: string, newName?: string) => {
    if (folderId && newName) {
      setBreadcrumb((prev) =>
        prev.map((crumb) => (crumb.id === folderId ? { ...crumb, name: newName } : crumb)),
      )
    }
    await loadContents()
  }

  const handleCreateFolder = async (e: FormEvent) => {
    e.preventDefault()
    if (!folderName.trim()) return
    if (isAreaMode && atRoot) {
      toast.error('No podés crear carpetas de primer nivel')
      return
    }

    setSubmitting(true)
    try {
      await createFolder(folderName.trim(), currentFolderId)
      toast.success('Carpeta creada')
      setFolderName('')
      setShowFolderForm(false)
      await loadContents()
    } catch (err) {
      console.error('Error al crear carpeta:', err)
      toast.error(err instanceof Error ? err.message : 'No se pudo crear la carpeta')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateResource = async (e: FormEvent) => {
    e.preventDefault()
    if (!resourceName.trim() || !resourceUrl.trim()) return
    if (isAreaMode && atRoot) {
      toast.error('Entrá a un área para crear recursos')
      return
    }

    setSubmitting(true)
    try {
      await createResourceItem({
        name: resourceName.trim(),
        url: resourceUrl.trim(),
        type: resourceType,
        folderId: currentFolderId,
        allowedUsers: [],
      })
      toast.success('Recurso creado')
      setResourceName('')
      setResourceUrl('')
      setResourceType('link')
      setShowResourceForm(false)
      await loadContents()
    } catch (err) {
      console.error('Error al crear recurso:', err)
      toast.error(err instanceof Error ? err.message : 'No se pudo crear el recurso')
    } finally {
      setSubmitting(false)
    }
  }

  const openPermissions = async (target: PermissionTarget) => {
    if (isAreaMode) {
      const folder =
        target.kind === 'folder'
          ? target.item
          : target.item.folderId
            ? await getFolderById(target.item.folderId)
            : null
      if (folder) {
        const ok = await assertAreaAccess(folder)
        if (!ok) return
      } else if (target.kind === 'resource') {
        const areaId = target.item.rootAreaId
        if (!areaId || !isAdminOfArea(userProfile, areaId)) {
          toast.error('No tenés permiso sobre este recurso')
          return
        }
      }
    }
    setPermissionTarget(target)
  }

  /** Super: siempre. Area admin: no carpetas de primer nivel; sí dentro de sus áreas. */
  const canDeleteFolderRow = (folder: Folder): boolean => {
    if (!isAreaMode) return true
    if (folder.parentFolderId === null) return false
    const areaId = folder.rootAreaId
    return Boolean(areaId && isAdminOfArea(userProfile, areaId))
  }

  const canRenameFolderRow = (folder: Folder): boolean => canDeleteFolderRow(folder)

  const canDeleteResourceRow = (item: ResourceItem): boolean => {
    if (!isAreaMode) return true
    const areaId = item.rootAreaId
    return Boolean(areaId && isAdminOfArea(userProfile, areaId))
  }

  const handleDeleteFolder = async (folder: Folder) => {
    if (!folder.id || !canDeleteFolderRow(folder)) return
    if (
      !window.confirm(
        `¿Eliminar la carpeta "${folder.name}"?\n\nSolo se puede borrar si está vacía.`,
      )
    ) {
      return
    }
    try {
      await deleteFolder(folder.id)
      toast.success('Carpeta eliminada')
      await loadContents()
    } catch (err) {
      console.error('Error al eliminar carpeta:', err)
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar la carpeta')
    }
  }

  const handleDeleteResource = async (item: ResourceItem) => {
    if (!item.id || !canDeleteResourceRow(item)) return
    if (!window.confirm(`¿Eliminar el recurso "${item.name}"? Esta acción no se puede deshacer.`)) {
      return
    }
    try {
      await deleteResourceItem(item.id)
      toast.success('Recurso eliminado')
      await loadContents()
    } catch (err) {
      console.error('Error al eliminar recurso:', err)
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar el recurso')
    }
  }

  const isEmpty = !loading && folders.length === 0 && items.length === 0

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <nav
          aria-label="Ruta de navegación"
          className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm"
        >
          {breadcrumb.map((crumb, index) => (
            <span key={crumb.id ?? 'root'} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />}
              <button
                type="button"
                onClick={() => navigateToBreadcrumb(index)}
                className={`truncate rounded px-1.5 py-0.5 transition-colors ${
                  index === breadcrumb.length - 1
                    ? 'font-semibold text-neutral-900 dark:text-gray-100'
                    : 'text-neutral-500 dark:text-gray-400 hover:bg-neutral-100 dark:bg-zinc-800 hover:text-brand-primary'
                }`}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>

        {canCreateHere && (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => {
                setShowResourceForm(false)
                setShowFolderForm(true)
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2 text-sm font-medium text-neutral-800 dark:text-gray-100 transition-colors hover:border-neutral-400 dark:hover:border-zinc-500 hover:bg-neutral-50 dark:bg-zinc-950"
            >
              <Plus className="h-4 w-4" />
              Nueva carpeta
            </button>
            <button
              type="button"
              onClick={() => {
                setShowFolderForm(false)
                setShowResourceForm(true)
              }}
              className="btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
            >
              <Plus className="h-4 w-4" />
              Nuevo recurso
            </button>
          </div>
        )}
      </div>

      {showFolderForm && (
        <form
          onSubmit={handleCreateFolder}
          className="card-minimal mb-4 flex flex-wrap items-end gap-3 p-4"
        >
          <div className="min-w-[200px] flex-1">
            <label htmlFor="new-folder-name" className="mb-1 block text-xs font-medium text-neutral-600 dark:text-gray-400">
              Nombre de la carpeta
            </label>
            <input
              id="new-folder-name"
              type="text"
              required
              autoFocus
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Ej: RRHH"
              className="input-brand-focus w-full rounded-lg border border-neutral-300 dark:border-zinc-700 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowFolderForm(false)}
              className="rounded-lg border border-neutral-300 dark:border-zinc-700 px-4 py-2 text-sm text-neutral-700 dark:text-gray-300 hover:bg-neutral-50 dark:bg-zinc-950"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold"
            >
              {submitting ? 'Creando...' : 'Crear'}
            </button>
          </div>
        </form>
      )}

      {showResourceForm && (
        <form
          onSubmit={handleCreateResource}
          className="card-minimal mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div>
            <label htmlFor="new-resource-name" className="mb-1 block text-xs font-medium text-neutral-600 dark:text-gray-400">
              Nombre
            </label>
            <input
              id="new-resource-name"
              type="text"
              required
              value={resourceName}
              onChange={(e) => setResourceName(e.target.value)}
              className="input-brand-focus w-full rounded-lg border border-neutral-300 dark:border-zinc-700 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="new-resource-url" className="mb-1 block text-xs font-medium text-neutral-600 dark:text-gray-400">
              URL
            </label>
            <input
              id="new-resource-url"
              type="url"
              required
              value={resourceUrl}
              onChange={(e) => setResourceUrl(e.target.value)}
              className="input-brand-focus w-full rounded-lg border border-neutral-300 dark:border-zinc-700 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="new-resource-type" className="mb-1 block text-xs font-medium text-neutral-600 dark:text-gray-400">
              Tipo
            </label>
            <select
              id="new-resource-type"
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value as ResourceItem['type'])}
              className="input-brand-focus w-full rounded-lg border border-neutral-300 dark:border-zinc-700 px-3 py-2 text-sm"
            >
              {RESOURCE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => setShowResourceForm(false)}
              className="flex-1 rounded-lg border border-neutral-300 dark:border-zinc-700 px-3 py-2 text-sm text-neutral-700 dark:text-gray-300 hover:bg-neutral-50 dark:bg-zinc-950"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary flex-1 rounded-lg px-3 py-2 text-sm font-semibold"
            >
              Crear
            </button>
          </div>
        </form>
      )}

      <div className="card-minimal overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          </div>
        ) : isEmpty ? (
          <div className="px-6 py-20 text-center">
            <FolderOpen className="mx-auto mb-3 h-10 w-10 text-neutral-300" />
            <p className="text-sm font-medium text-neutral-600 dark:text-gray-400">Esta carpeta está vacía</p>
            <p className="mt-1 text-sm text-neutral-400">
              Creá una subcarpeta o agregá un recurso con los botones de arriba.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-zinc-950 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-gray-400">
                  <th className="px-5 py-3">Nombre</th>
                  <th className="px-5 py-3">Tipo</th>
                  <th className="px-5 py-3">Acceso</th>
                  <th className="px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {folders.map((folder) => (
                  <tr
                    key={folder.id}
                    className="cursor-pointer transition-colors hover:bg-neutral-50 dark:bg-zinc-950"
                    onDoubleClick={() => enterFolder(folder)}
                  >
                    <td className="px-5 py-3.5">
                      <button
                        type="button"
                        onClick={() => enterFolder(folder)}
                        className="flex items-center gap-3 text-left font-medium text-neutral-900 dark:text-gray-100 hover:text-brand-primary"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-tint text-brand-primary">
                          <FolderOpen className="h-4 w-4" />
                        </span>
                        {folder.name}
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-neutral-500 dark:text-gray-400">Carpeta</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`text-xs font-medium ${
                          isFolderPublic(folder) ? 'text-neutral-500 dark:text-gray-400' : 'text-brand-primary'
                        }`}
                      >
                        {accessLabel(folder.allowedUsers)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-1">
                        {canRenameFolderRow(folder) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditTarget({ kind: 'folder', item: folder })
                            }}
                            aria-label={`Editar ${folder.name}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 dark:text-gray-400 transition-colors hover:bg-neutral-100 dark:bg-zinc-800 hover:text-neutral-900 dark:text-gray-100"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            openPermissions({ kind: 'folder', item: folder })
                          }}
                          aria-label={`Permisos de ${folder.name}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 dark:text-gray-400 transition-colors hover:bg-brand-tint hover:text-brand-primary"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        {canDeleteFolderRow(folder) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              void handleDeleteFolder(folder)
                            }}
                            aria-label={`Eliminar ${folder.name}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover-danger dark:text-gray-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {items.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-neutral-50 dark:bg-zinc-950">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3 font-medium text-neutral-900 dark:text-gray-100">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-100 dark:bg-zinc-800 text-neutral-600 dark:text-gray-400">
                          <ResourceTypeIcon type={item.type} className="h-4 w-4" />
                        </span>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-brand-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {item.name}
                        </a>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 capitalize text-neutral-500 dark:text-gray-400">
                      {RESOURCE_TYPES.find((t) => t.value === item.type)?.label ?? item.type}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`text-xs font-medium ${
                          isResourcePublic(item) ? 'text-neutral-500 dark:text-gray-400' : 'text-brand-primary'
                        }`}
                      >
                        {accessLabel(item.allowedUsers)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditTarget({ kind: 'resource', item })}
                          aria-label={`Editar ${item.name}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 dark:text-gray-400 transition-colors hover:bg-neutral-100 dark:bg-zinc-800 hover:text-neutral-900 dark:text-gray-100"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openPermissions({ kind: 'resource', item })}
                          aria-label={`Permisos de ${item.name}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 dark:text-gray-400 transition-colors hover:bg-brand-tint hover:text-brand-primary"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        {canDeleteResourceRow(item) && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteResource(item)}
                            aria-label={`Eliminar ${item.name}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover-danger dark:text-gray-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editTarget && (
        <EditModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={handleEditSaved}
        />
      )}

      {permissionTarget && (
        <PermissionsModal
          target={permissionTarget}
          onClose={() => setPermissionTarget(null)}
          onUpdated={loadContents}
        />
      )}
    </div>
  )
}
