import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderInput,
  KeyRound,
  Grid2X2,
  List,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Share2,
  Shield,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { DriveFolderPickerModal } from '../components/DriveFolderPickerModal'
import { DrivePermissionsModal } from '../components/DrivePermissionsModal'
import { DriveRecentPanel } from '../components/DriveRecentPanel'
import { RequestMorePermissionsModal } from '../components/RequestMorePermissionsModal'
import { UserMultiPicker } from '../components/access/UserMultiPicker'
import { useAuth } from '../context'
import {
  createOfficeUploadRequest,
  isOfficeUploadFile,
} from '../services/approvalRequestsService'
import { isInstallerUploadFile } from '../utils/installerUpload'
import {
  approveDriveFile,
  moveDriveFile,
  updateDriveClassification,
  uploadDriveFile,
  type DriveClassification as Classification,
  type DriveCreateType,
  type DriveFileDto,
  type FolderAccessMode,
} from '../services/driveApi'
import { useDriveFolderMutations } from '../hooks/queries/useDriveFolderMutations'
import {
  invalidateDriveFolderListing,
  useDriveFilesQuery,
} from '../hooks/queries/useDriveFilesQuery'
import { recordDriveRecentOpen, type DriveRecentEntry } from '../services/driveRecentFiles'
import { canPerformGovernanceAction } from '../services/governanceAccess'
import { getAllUsers, type UserProfile } from '../services/userService'
import { canOpenDriveEmbedded } from '../utils/googleDriveEmbed'
import {
  DRIVE_EXPLORER_DEFAULT_PATH,
  parseDriveBreadcrumb,
  type DriveBreadcrumbItem,
} from '../utils/driveExplorerNavigation'

type FileKind = 'folder' | 'document' | 'spreadsheet' | 'pdf' | 'image'

type BreadcrumbItem = DriveBreadcrumbItem
type FileAction = 'trash' | 'approve' | 'classification' | 'rename'

const kindIcon: Record<FileKind, typeof FileText> = {
  folder: Folder,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  pdf: FileText,
  image: FileImage,
}

const kindColor: Record<FileKind, string> = {
  folder: 'text-amber-500',
  document: 'text-blue-600 dark:text-blue-400',
  spreadsheet: 'text-emerald-600 dark:text-emerald-400',
  pdf: 'text-danger',
  image: 'text-violet-600 dark:text-violet-400',
}

const classificationStyle: Record<Classification, string> = {
  RESTRINGIDO:
    'alert-error',
  CONFIDENCIAL:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300',
  USO_INTERNO:
    'border-neutral-200 bg-neutral-100 text-neutral-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
}

const classificationLabel: Record<Classification, string> = {
  RESTRINGIDO: 'Restringido',
  CONFIDENCIAL: 'Confidencial',
  USO_INTERNO: 'Uso interno',
}

const kindFilterLabel: Record<FileKind, string> = {
  folder: 'Carpeta',
  document: 'Documento',
  spreadsheet: 'Hoja de cálculo',
  pdf: 'PDF',
  image: 'Imagen',
}

type StatusFilter = 'BORRADOR' | 'APROBADO'

const statusFilterLabel: Record<StatusFilter, string> = {
  BORRADOR: 'Borrador',
  APROBADO: 'Aprobado',
}

const allClassifications: Classification[] = ['USO_INTERNO', 'CONFIDENCIAL', 'RESTRINGIDO']
const allKinds: FileKind[] = ['folder', 'document', 'spreadsheet', 'pdf', 'image']
const allStatuses: StatusFilter[] = ['BORRADOR', 'APROBADO']

function kindFor(file: DriveFileDto): FileKind {
  if (file.isFolder) return 'folder'
  if (file.mimeType === 'application/vnd.google-apps.spreadsheet') return 'spreadsheet'
  if (file.mimeType === 'application/vnd.google-apps.document') return 'document'
  if (file.mimeType === 'application/pdf') return 'pdf'
  if (file.mimeType.startsWith('image/')) return 'image'
  return 'document'
}

function formatModified(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function AdminDriveLab() {
  const { user, userProfile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isSuperAdmin = userProfile?.role === 'super_admin'
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [showFilters, setShowFilters] = useState(false)
  const [filterClassifications, setFilterClassifications] = useState<Set<Classification>>(
    () => new Set(),
  )
  const [filterKinds, setFilterKinds] = useState<Set<FileKind>>(() => new Set())
  const [filterStatuses, setFilterStatuses] = useState<Set<StatusFilter>>(() => new Set())
  const filtersRef = useRef<HTMLDivElement>(null)
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([
    { id: null, name: 'bacarsa' },
  ])
  const [showCreate, setShowCreate] = useState(false)
  const [showNewMenu, setShowNewMenu] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createType, setCreateType] = useState<DriveCreateType>('google_doc')
  const [createClassification, setCreateClassification] =
    useState<Classification>('USO_INTERNO')
  const [createReason, setCreateReason] = useState('')
  const [createFolderAccessMode, setCreateFolderAccessMode] =
    useState<FolderAccessMode>('restricted')
  const [createFolderGrantEmails, setCreateFolderGrantEmails] = useState<string[]>([])
  const [createFolderGrantQuery, setCreateFolderGrantQuery] = useState('')
  const [createPrivateFolder, setCreatePrivateFolder] = useState(false)
  const [createDirectoryUsers, setCreateDirectoryUsers] = useState<UserProfile[]>([])
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadFileValue, setUploadFileValue] = useState<File | null>(null)
  const [uploadClassification, setUploadClassification] =
    useState<Classification>('USO_INTERNO')
  const [uploadReason, setUploadReason] = useState('')
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const menuWidth = 208
  const [action, setAction] = useState<{ kind: FileAction; file: DriveFileDto } | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [renameName, setRenameName] = useState('')
  const [actionClassification, setActionClassification] =
    useState<Classification>('USO_INTERNO')
  const [acting, setActing] = useState(false)
  const [permissionsTarget, setPermissionsTarget] = useState<DriveFileDto | null>(null)
  const [moveTarget, setMoveTarget] = useState<DriveFileDto | null>(null)
  const [morePermissionsTarget, setMorePermissionsTarget] = useState<DriveFileDto | null>(null)

  useEffect(() => {
    const restored = parseDriveBreadcrumb(
      (location.state as { driveBreadcrumb?: DriveBreadcrumbItem[] } | null)?.driveBreadcrumb,
    )
    if (!restored) return
    setBreadcrumb(restored)
    navigate(`${location.pathname}${location.search}`, { replace: true, state: {} })
  }, [location.pathname, location.search, location.state, navigate])

  const currentFolder = breadcrumb[breadcrumb.length - 1]
  const isAtDriveRoot = currentFolder.id === null
  const showCreateUploadActions = isSuperAdmin || !isAtDriveRoot

  const {
    data: folderData,
    isLoading: loading,
    isError,
    error: queryError,
  } = useDriveFilesQuery(user?.uid, currentFolder.id)

  const files = folderData?.files ?? []
  const resolvedFolderId = folderData?.folderId ?? null
  const error = isError
    ? queryError instanceof Error
      ? queryError.message
      : 'No se pudo cargar la carpeta'
    : null

  const { trashMutation, renameMutation, createMutation } = useDriveFolderMutations(
    user?.uid,
    currentFolder.id,
  )

  const refreshFolderListing = async () => {
    await invalidateDriveFolderListing(user?.uid, currentFolder.id)
  }

  const activeFilterCount =
    filterClassifications.size + filterKinds.size + filterStatuses.size

  const toggleFilter = <T,>(current: Set<T>, value: T, setter: (next: Set<T>) => void) => {
    const next = new Set(current)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    setter(next)
  }

  const clearFilters = () => {
    setFilterClassifications(new Set())
    setFilterKinds(new Set())
    setFilterStatuses(new Set())
  }

  useEffect(() => {
    if (!showFilters) return
    const onPointerDown = (event: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
        setShowFilters(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [showFilters])

  const visibleFiles = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es')
    return files.filter((file) => {
      if (
        normalized &&
        !`${file.name} ${file.ownerLabel}`.toLocaleLowerCase('es').includes(normalized)
      ) {
        return false
      }
      if (filterClassifications.size > 0) {
        if (!file.classification || !filterClassifications.has(file.classification)) {
          return false
        }
      }
      if (filterKinds.size > 0 && !filterKinds.has(kindFor(file))) {
        return false
      }
      if (filterStatuses.size > 0) {
        if (file.isFolder) return false
        const status = file.status ?? 'BORRADOR'
        if (!filterStatuses.has(status)) return false
      }
      return true
    })
  }, [files, query, filterClassifications, filterKinds, filterStatuses])

  const openItem = (file: DriveFileDto) => {
    if (file.isFolder) {
      setBreadcrumb((current) => [...current, { id: file.id, name: file.name }])
      setQuery('')
      return
    }

    if (canOpenDriveEmbedded(file.mimeType)) {
      recordDriveRecentOpen(user?.uid, file)
      navigate(`/recursos/documento/${file.id}`, {
        state: {
          returnTo: DRIVE_EXPLORER_DEFAULT_PATH,
          driveBreadcrumb: breadcrumb,
        },
      })
      return
    }

    if (file.webViewLink) window.open(file.webViewLink, '_blank', 'noopener,noreferrer')
  }

  const openRecentFile = (entry: DriveRecentEntry) => {
    if (!canOpenDriveEmbedded(entry.mimeType)) return
    recordDriveRecentOpen(user?.uid, {
      id: entry.id,
      name: entry.name,
      mimeType: entry.mimeType,
      isFolder: false,
    })
    navigate(`/recursos/documento/${entry.id}`, {
      state: {
        returnTo: DRIVE_EXPLORER_DEFAULT_PATH,
        driveBreadcrumb: breadcrumb,
      },
    })
  }

  const navigateToCrumb = (index: number) => {
    setBreadcrumb((current) => current.slice(0, index + 1))
    setQuery('')
  }

  const openCreate = (type: DriveCreateType) => {
    setCreateType(type)
    setCreateFolderAccessMode('restricted')
    setCreateFolderGrantEmails([])
    setCreateFolderGrantQuery('')
    setCreatePrivateFolder(false)
    setShowNewMenu(false)
    setShowCreate(true)
  }

  useEffect(() => {
    if (!showCreate || createType !== 'folder') return
    let cancelled = false
    void getAllUsers()
      .then((users) => {
        if (!cancelled) setCreateDirectoryUsers(users)
      })
      .catch(() => {
        if (!cancelled) setCreateDirectoryUsers([])
      })
    return () => {
      cancelled = true
    }
  }, [showCreate, createType])

  const handleCreate = (event: FormEvent) => {
    event.preventDefault()
    if (!resolvedFolderId || !createName.trim()) return
    if (createType === 'folder' && createFolderAccessMode === 'selected' && createFolderGrantEmails.length === 0) {
      toast.error('Elegí al menos una persona para el acceso específico')
      return
    }

    const payload = {
      name: createName.trim(),
      type: createType,
      parentFolderId: resolvedFolderId,
      ...(createType === 'folder'
        ? {
            folderAccessMode: createFolderAccessMode,
            privateFolder: createPrivateFolder,
            ...(createFolderAccessMode === 'selected'
              ? { initialGrantEmails: createFolderGrantEmails }
              : {}),
          }
        : { classification: createClassification }),
      reason: createReason.trim(),
    }

    setShowCreate(false)
    setCreateName('')
    setCreateReason('')
    setCreateFolderAccessMode('restricted')
    setCreateFolderGrantEmails([])
    setCreateFolderGrantQuery('')
    setCreatePrivateFolder(false)

    createMutation.mutate(payload)
  }

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault()
    if (!resolvedFolderId || !uploadFileValue) return
    setUploading(true)
    try {
      if (isOfficeUploadFile(uploadFileValue)) {
        await createOfficeUploadRequest({
          file: uploadFileValue,
          parentFolderId: resolvedFolderId,
          classification: uploadClassification,
          reason: uploadReason.trim(),
        })
        toast.success('Solicitud enviada — un jefe de área debe aprobar la subida')
      } else if (isInstallerUploadFile(uploadFileValue)) {
        await uploadDriveFile({
          file: uploadFileValue,
          parentFolderId: resolvedFolderId,
          classification: uploadClassification,
          reason: uploadReason.trim(),
        })
        toast.success('Instalador subido a Drive')
        await refreshFolderListing()
      } else {
        await uploadDriveFile({
          file: uploadFileValue,
          parentFolderId: resolvedFolderId,
          classification: uploadClassification,
          reason: uploadReason.trim(),
        })
        toast.success('Archivo subido a Drive')
        await refreshFolderListing()
      }
      setShowUpload(false)
      setUploadFileValue(null)
      setUploadReason('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo completar la operación')
    } finally {
      setUploading(false)
    }
  }

  const canApprove = (file: DriveFileDto) =>
    !file.isFolder &&
    file.status === 'BORRADOR' &&
    canPerformGovernanceAction(userProfile, 'approval', file.governingAreaId)

  const canManagePermissions = (file: DriveFileDto) =>
    canPerformGovernanceAction(userProfile, 'permission_grant', file.governingAreaId)

  const canChangeClassification = (file: DriveFileDto) =>
    !file.isFolder &&
    canPerformGovernanceAction(userProfile, 'classification_change', file.governingAreaId)

  const canAuthorizedCopy = (file: DriveFileDto) =>
    !file.isFolder &&
    canPerformGovernanceAction(userProfile, 'authorized_copy', file.governingAreaId)

  const hasRowMenuActions = (file: DriveFileDto) =>
    Boolean(
      (!file.isFolder && file.webViewLink) ||
        canApprove(file) ||
        canChangeClassification(file) ||
        canManagePermissions(file) ||
        canAuthorizedCopy(file) ||
        file.capabilities.canRename ||
        file.capabilities.canEdit ||
        file.capabilities.canTrash ||
        !file.capabilities.canEdit,
    )

  const closeRowMenu = () => {
    setActiveMenuId(null)
    setMenuPosition(null)
  }

  const openAction = (kind: FileAction, file: DriveFileDto) => {
    closeRowMenu()
    setAction({ kind, file })
    setActionReason('')
    setRenameName(file.name)
    setActionClassification(file.classification ?? 'USO_INTERNO')
  }

  const handleAction = async (event: FormEvent) => {
    event.preventDefault()
    if (!action) return

    if (action.kind === 'trash') {
      const file = action.file
      setAction(null)
      trashMutation.mutate({ fileId: file.id, reason: actionReason })
      return
    }

    if (action.kind === 'rename') {
      const file = action.file
      const nextName = renameName.trim()
      setAction(null)
      renameMutation.mutate({ fileId: file.id, name: nextName })
      return
    }

    setActing(true)
    try {
      if (action.kind === 'approve') {
        await approveDriveFile(action.file.id, actionReason.trim())
        toast.success('Archivo aprobado')
      } else {
        await updateDriveClassification(
          action.file.id,
          actionClassification,
          actionReason.trim(),
        )
        toast.success('Clasificación actualizada')
      }
      setAction(null)
      void refreshFolderListing()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo completar la acción')
    } finally {
      setActing(false)
    }
  }

  const trashReasonOptional =
    action?.kind === 'trash' &&
    ['application/pdf', 'image/png', 'image/jpeg'].includes(action.file.mimeType)

  const activeMenuFile = useMemo(
    () => visibleFiles.find((file) => file.id === activeMenuId) ?? null,
    [activeMenuId, visibleFiles],
  )

  const toggleRowMenu = (file: DriveFileDto, button: HTMLButtonElement) => {
    if (!hasRowMenuActions(file)) return
    if (activeMenuId === file.id) {
      closeRowMenu()
      return
    }
    const rect = button.getBoundingClientRect()
    const itemCount = [
      !file.isFolder && file.webViewLink,
      canApprove(file),
      canChangeClassification(file),
      canManagePermissions(file),
      canAuthorizedCopy(file),
      file.capabilities.canRename,
      file.capabilities.canEdit,
      file.capabilities.canTrash,
    ].filter(Boolean).length
    const estimatedHeight = Math.max(itemCount, 1) * 40 + 8
    let top = rect.bottom + 4
    if (top + estimatedHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - estimatedHeight - 4)
    }
    setMenuPosition({
      top,
      left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
    })
    setActiveMenuId(file.id)
  }

  useLayoutEffect(() => {
    if (!activeMenuId) return
    const close = () => closeRowMenu()
    window.addEventListener('scroll', close, { passive: true })
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close)
      window.removeEventListener('resize', close)
    }
  }, [activeMenuId])

  const renderRowMenuItems = (file: DriveFileDto) => (
    <>
      {!file.isFolder && file.webViewLink && (
        <button
          type="button"
          onClick={() => {
            closeRowMenu()
            openItem(file)
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-zinc-800"
        >
          <FileText className="h-4 w-4" />
          Abrir en Drive
        </button>
      )}
      {canApprove(file) && (
        <button
          type="button"
          onClick={() => openAction('approve', file)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-zinc-800"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Aprobar
        </button>
      )}
      {canChangeClassification(file) && (
        <button
          type="button"
          onClick={() => openAction('classification', file)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-zinc-800"
        >
          <Shield className="h-4 w-4" />
          Clasificación
        </button>
      )}
      {canManagePermissions(file) && (
        <button
          type="button"
          onClick={() => {
            closeRowMenu()
            setPermissionsTarget(file)
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-zinc-800"
        >
          <Share2 className="h-4 w-4" />
          Permisos
        </button>
      )}
      {canAuthorizedCopy(file) && (
        <button
          type="button"
          onClick={() => {
            closeRowMenu()
            toast('La copia autorizada llega en el próximo corte')
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-zinc-800"
        >
          <Copy className="h-4 w-4" />
          Copia autorizada
        </button>
      )}
      {file.capabilities.canRename && (
        <button
          type="button"
          onClick={() => openAction('rename', file)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-zinc-800"
        >
          <Pencil className="h-4 w-4" />
          Renombrar
        </button>
      )}
      {file.capabilities.canEdit && (
        <button
          type="button"
          onClick={() => {
            closeRowMenu()
            setMoveTarget(file)
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-zinc-800"
        >
          <FolderInput className="h-4 w-4" />
          Mover a…
        </button>
      )}
      {!file.capabilities.canEdit && (
        <button
          type="button"
          onClick={() => {
            closeRowMenu()
            setMorePermissionsTarget(file)
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-zinc-800"
        >
          <KeyRound className="h-4 w-4" />
          Pedir más permisos
        </button>
      )}
      {file.capabilities.canTrash && (
        <button
          type="button"
          onClick={() => openAction('trash', file)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-brand-tint dark:hover:bg-brand-primary-hover/30"
        >
          <Trash2 className="h-4 w-4" />
          Enviar a papelera
        </button>
      )}
    </>
  )

  return (
    <div className="min-w-0 text-neutral-900 dark:text-zinc-100">
      <header className="sticky top-0 z-20 mb-6 border-b border-neutral-200 bg-white/95 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-zinc-400">
              Unidad compartida
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight">Archivos</h1>
          </div>

          <label className="relative order-last w-full md:order-none md:ml-5 md:max-w-xl md:flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Buscar en ${currentFolder.name}`}
              className="h-11 w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-11 pr-4 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15 dark:focus:border-brand-primary"
            />
          </label>
        </div>
      </header>

      <nav aria-label="Ruta actual" className="flex items-center gap-1 text-sm">
        {breadcrumb.map((crumb, index) => (
          <span key={crumb.id ?? 'drive-root'} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronRight className="h-4 w-4 text-neutral-300 dark:text-zinc-600" />
            )}
            <button
              type="button"
              onClick={() => navigateToCrumb(index)}
              className={`rounded px-1.5 py-1 ${
                index === breadcrumb.length - 1
                  ? 'font-medium text-neutral-900 dark:text-zinc-100'
                  : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        {showCreateUploadActions && (
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNewMenu((open) => !open)}
              className="btn-primary inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium"
              aria-expanded={showNewMenu}
              aria-haspopup="menu"
            >
              <Plus className="h-4 w-4" />
              Nuevo
              <ChevronDown className="h-3.5 w-3.5 opacity-80" />
            </button>
            {showNewMenu && (
              <>
                <button
                  type="button"
                  aria-label="Cerrar menú"
                  className="app-dropdown-backdrop"
                  onClick={() => setShowNewMenu(false)}
                />
                <div
                  role="menu"
                  className="app-dropdown-menu absolute left-0 top-full mt-1 min-w-[220px] overflow-hidden"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openCreate('google_doc')}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-zinc-800"
                  >
                    <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    Documento de Google
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openCreate('google_sheet')}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-zinc-800"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Hoja de cálculo
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openCreate('folder')}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-zinc-800"
                  >
                    <Folder className="h-4 w-4 text-amber-500" />
                    Carpeta
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            <Upload className="h-4 w-4" />
            Subir
          </button>
        </div>
        )}

        <div className={`relative flex items-center gap-2 ${showCreateUploadActions ? '' : 'ml-auto w-full justify-end'}`} ref={filtersRef}>
          <button
            type="button"
            onClick={() => setShowFilters((open) => !open)}
            aria-expanded={showFilters}
            className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors hover:bg-neutral-50 dark:hover:bg-zinc-900 ${
              activeFilterCount > 0
                ? 'border-brand-primary/40 bg-brand-tint text-brand-primary dark:border-brand-primary/30'
                : 'border-neutral-200 text-neutral-600 dark:border-zinc-800 dark:text-zinc-400'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-brand-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          {showFilters && (
            <div className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-4 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-neutral-900 dark:text-zinc-100">Filtros</p>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-xs font-medium text-brand-primary hover:underline"
                  >
                    Limpiar
                  </button>
                )}
              </div>
              <div className="space-y-4">
                <fieldset>
                  <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-zinc-500">
                    Clasificación
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {allClassifications.map((value) => (
                      <label
                        key={value}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs dark:border-zinc-700"
                      >
                        <input
                          type="checkbox"
                          checked={filterClassifications.has(value)}
                          onChange={() =>
                            toggleFilter(filterClassifications, value, setFilterClassifications)
                          }
                          className="accent-brand-primary"
                        />
                        {classificationLabel[value]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-zinc-500">
                    Tipo
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {allKinds.map((value) => (
                      <label
                        key={value}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs dark:border-zinc-700"
                      >
                        <input
                          type="checkbox"
                          checked={filterKinds.has(value)}
                          onChange={() => toggleFilter(filterKinds, value, setFilterKinds)}
                          className="accent-brand-primary"
                        />
                        {kindFilterLabel[value]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-zinc-500">
                    Estado
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {allStatuses.map((value) => (
                      <label
                        key={value}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs dark:border-zinc-700"
                      >
                        <input
                          type="checkbox"
                          checked={filterStatuses.has(value)}
                          onChange={() => toggleFilter(filterStatuses, value, setFilterStatuses)}
                          className="accent-brand-primary"
                        />
                        {statusFilterLabel[value]}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            </div>
          )}
          <div className="flex rounded-lg border border-neutral-200 p-0.5 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setView('list')}
              aria-label="Vista de lista"
              className={`rounded-md p-1.5 ${view === 'list' ? 'bg-neutral-100 text-neutral-900 dark:bg-zinc-800 dark:text-white' : 'text-neutral-400'}`}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView('grid')}
              aria-label="Vista de cuadrícula"
              className={`rounded-md p-1.5 ${view === 'grid' ? 'bg-neutral-100 text-neutral-900 dark:bg-zinc-800 dark:text-white' : 'text-neutral-400'}`}
            >
              <Grid2X2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-[7] pb-2">
        <section className="overflow-visible rounded-xl border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          {view === 'list' && (
            <div className="grid grid-cols-[minmax(250px,2fr)_minmax(120px,0.8fr)_minmax(160px,1fr)_minmax(72px,auto)] border-b border-neutral-200 bg-neutral-50/70 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-500">
              <span>Nombre</span>
              <span className="hidden md:block">Propietario</span>
              <span className="hidden sm:block">Última modificación</span>
              <span />
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-neutral-500 dark:text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando archivos…
            </div>
          ) : error ? (
            <div className="px-6 py-14 text-center">
              <p className="text-sm font-medium text-danger">{error}</p>
              <button
                type="button"
                onClick={() => void refreshFolderListing()}
                className="mt-3 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Reintentar
              </button>
            </div>
          ) : visibleFiles.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <Search className="mx-auto h-8 w-8 text-neutral-300 dark:text-zinc-700" />
              <p className="mt-3 text-sm font-medium">No encontramos archivos</p>
              <p className="mt-1 text-sm text-neutral-500 dark:text-zinc-500">
                {activeFilterCount > 0 || query.trim()
                  ? 'Probá con otros filtros o términos de búsqueda.'
                  : 'Esta carpeta está vacía.'}
              </p>
            </div>
          ) : view === 'grid' ? (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
              {visibleFiles.map((file) => {
                const kind = kindFor(file)
                const Icon = kindIcon[kind]
                const menuOpen = activeMenuId === file.id
                return (
                  <div
                    key={file.id}
                    onDoubleClick={() => openItem(file)}
                    className="group relative flex flex-col rounded-xl border border-neutral-200 bg-neutral-50/40 p-4 transition-colors hover:border-brand-primary/30 hover:bg-neutral-50 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-zinc-900"
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-zinc-950">
                        <Icon className={`h-8 w-8 ${kindColor[kind]}`} />
                      </span>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                        {canManagePermissions(file) && (
                          <button
                            type="button"
                            onClick={() => {
                              closeRowMenu()
                              setPermissionsTarget(file)
                            }}
                            aria-label={`Permisos de ${file.name}`}
                            title="Permisos"
                            className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-brand-primary dark:hover:bg-zinc-800"
                          >
                            <Share2 className="h-4 w-4" />
                          </button>
                        )}
                        {hasRowMenuActions(file) && (
                          <button
                            type="button"
                            onClick={(event) => toggleRowMenu(file, event.currentTarget)}
                            aria-label={`Más acciones para ${file.name}`}
                            aria-expanded={menuOpen}
                            className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openItem(file)}
                      className="mb-2 line-clamp-2 text-left text-sm font-medium hover:text-brand-primary"
                    >
                      {file.name}
                    </button>
                    {!file.isFolder && (
                      <div className="mb-2 flex flex-wrap gap-1">
                        {file.classification && (
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${classificationStyle[file.classification]}`}
                          >
                            {classificationLabel[file.classification]}
                          </span>
                        )}
                        {file.status && (
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              file.status === 'APROBADO'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'border-neutral-200 bg-white text-neutral-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400'
                            }`}
                          >
                            {file.status === 'APROBADO' ? 'Aprobado' : 'Borrador'}
                          </span>
                        )}
                      </div>
                    )}
                    <p className="mt-auto truncate text-xs text-neutral-500 dark:text-zinc-400">
                      {file.ownerLabel}
                    </p>
                  </div>
                )
              })}
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100 overflow-visible dark:divide-zinc-800">
              {visibleFiles.map((file) => {
                const kind = kindFor(file)
                const Icon = kindIcon[kind]
                const menuOpen = activeMenuId === file.id
                return (
                  <li
                    key={file.id}
                    onDoubleClick={() => openItem(file)}
                    className="grid min-h-16 grid-cols-[minmax(250px,2fr)_minmax(120px,0.8fr)_minmax(160px,1fr)_minmax(72px,auto)] items-center overflow-visible px-4 transition-colors hover:bg-neutral-50 dark:hover:bg-zinc-900/70"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Icon className={`h-5 w-5 shrink-0 ${kindColor[kind]}`} />
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => openItem(file)}
                          className="block max-w-full truncate text-left text-sm font-medium hover:text-brand-primary"
                        >
                          {file.name}
                        </button>
                        {!file.isFolder && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {file.classification && (
                              <span
                                className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${classificationStyle[file.classification]}`}
                              >
                                {classificationLabel[file.classification]}
                              </span>
                            )}
                            {file.status && (
                              <span
                                className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                  file.status === 'APROBADO'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300'
                                    : 'border-neutral-200 bg-white text-neutral-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400'
                                }`}
                              >
                                {file.status === 'APROBADO' ? 'Aprobado' : 'Borrador'}
                              </span>
                            )}
                            {file.directAccess && (
                              <span className="rounded-md border border-brand-primary/20 bg-brand-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-primary">
                                Acceso directo
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="hidden truncate text-sm text-neutral-500 dark:text-zinc-400 md:block">
                      {file.ownerLabel}
                    </span>
                    <span className="hidden text-sm text-neutral-500 dark:text-zinc-400 sm:block">
                      {formatModified(file.modifiedTime)}
                    </span>
                    <div className="relative ml-auto flex items-center justify-end gap-0.5">
                      {canManagePermissions(file) && (
                        <button
                          type="button"
                          onClick={() => {
                            closeRowMenu()
                            setPermissionsTarget(file)
                          }}
                          aria-label={`Permisos de ${file.name}`}
                          title="Permisos"
                          className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-brand-primary dark:hover:bg-zinc-800 dark:hover:text-brand-primary"
                        >
                          <Share2 className="h-4 w-4" />
                        </button>
                      )}
                      {hasRowMenuActions(file) && (
                        <button
                          type="button"
                          onClick={(event) => toggleRowMenu(file, event.currentTarget)}
                          aria-label={`Más acciones para ${file.name}`}
                          aria-expanded={menuOpen}
                          className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <p className="mt-3 text-xs text-neutral-400 dark:text-zinc-600">
          {loading ? 'Cargando…' : `${visibleFiles.length} elementos · Google Drive`}
        </p>
        </div>

        <aside className="min-w-0 flex-[3] xl:sticky xl:top-28 xl:self-start xl:max-h-[calc(100dvh-8rem)]">
          <DriveRecentPanel uid={user?.uid} onOpen={openRecentFile} />
        </aside>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleCreate} className="app-modal-panel max-w-md">
            <header className="shrink-0 flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-zinc-800">
              <div>
                <h2 className="font-semibold">
                  {createType === 'folder' ? 'Nueva carpeta' : 'Nuevo archivo'}
                </h2>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-zinc-400">
                  Se creará en {currentFolder.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-zinc-800"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="app-modal-scroll space-y-4 px-5 py-5">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Nombre</span>
                <input
                  autoFocus
                  required
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm outline-none input-brand-focus focus:ring-2 focus:ring-brand-primary/15 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Tipo</span>
                <select
                  value={createType}
                  onChange={(event) => {
                    const nextType = event.target.value as DriveCreateType
                    setCreateType(nextType)
                    if (nextType === 'folder') {
                      setCreateFolderAccessMode('restricted')
                      setCreateFolderGrantEmails([])
                      setCreateFolderGrantQuery('')
                      setCreatePrivateFolder(false)
                    }
                  }}
                  className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-brand-primary dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="google_doc">Documento de Google</option>
                  <option value="google_sheet">Hoja de cálculo de Google</option>
                  <option value="folder">Carpeta</option>
                </select>
              </label>

              {createType === 'folder' ? (
                <fieldset className="space-y-3">
                  <legend className="mb-1.5 block text-sm font-medium">Acceso a la carpeta</legend>

                  <label className="flex items-start justify-between gap-4 rounded-lg border border-neutral-200 px-3 py-3 dark:border-zinc-800">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">Privada</span>
                      <span className="mt-0.5 block text-xs text-neutral-500 dark:text-zinc-400">
                        Corta la herencia del área: solo vos, quienes agregues y gobernanza
                        (super_admin) pueden abrirla.
                      </span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={createPrivateFolder}
                      aria-label="Carpeta privada"
                      onClick={() => {
                        setCreatePrivateFolder((current) => {
                          const next = !current
                          if (next && createFolderAccessMode === 'organization') {
                            setCreateFolderAccessMode('restricted')
                          }
                          return next
                        })
                      }}
                      className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 ${
                        createPrivateFolder ? 'bg-brand-primary' : 'bg-neutral-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform dark:bg-zinc-900 ${
                          createPrivateFolder ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>

                  {!createPrivateFolder ? (
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 px-3 py-3 dark:border-zinc-800">
                      <input
                        type="radio"
                        name="folderAccessMode"
                        checked={createFolderAccessMode === 'restricted'}
                        onChange={() => setCreateFolderAccessMode('restricted')}
                        className="mt-1"
                      />
                      <span>
                        <span className="block text-sm font-medium">Normal (hereda del área)</span>
                        <span className="mt-0.5 block text-xs text-neutral-500 dark:text-zinc-400">
                          Comportamiento habitual: quien ya tenía acceso al área sigue viendo la
                          carpeta.
                        </span>
                      </span>
                    </label>
                  ) : null}
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 px-3 py-3 dark:border-zinc-800">
                    <input
                      type="radio"
                      name="folderAccessMode"
                      checked={createFolderAccessMode === 'selected'}
                      onChange={() => setCreateFolderAccessMode('selected')}
                      className="mt-1"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">Personas específicas</span>
                      <span className="mt-0.5 block text-xs text-neutral-500 dark:text-zinc-400">
                        Otorgá acceso de lectura a una o más personas al crear la carpeta.
                      </span>
                      {createFolderAccessMode === 'selected' ? (
                        <div className="mt-3">
                          <UserMultiPicker
                            allUsers={createDirectoryUsers}
                            excludeEmails={new Set()}
                            selectedEmails={createFolderGrantEmails}
                            onSelectedEmailsChange={setCreateFolderGrantEmails}
                            query={createFolderGrantQuery}
                            onQueryChange={setCreateFolderGrantQuery}
                            placeholder="nombre o usuario@bacarsa.com.ar"
                            allowedDomain="bacarsa.com.ar"
                          />
                        </div>
                      ) : null}
                    </span>
                  </label>
                  {!createPrivateFolder ? (
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 px-3 py-3 dark:border-zinc-800">
                      <input
                        type="radio"
                        name="folderAccessMode"
                        checked={createFolderAccessMode === 'organization'}
                        onChange={() => setCreateFolderAccessMode('organization')}
                        className="mt-1"
                      />
                      <span>
                        <span className="block text-sm font-medium">Todos en Bacarsa</span>
                        <span className="mt-0.5 block text-xs text-neutral-500 dark:text-zinc-400">
                          Cualquier usuario @bacarsa.com.ar con el link puede ver la carpeta (uso
                          interno).
                        </span>
                      </span>
                    </label>
                  ) : null}
                </fieldset>
              ) : (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Clasificación</span>
                  <select
                    value={createClassification}
                    onChange={(event) =>
                      setCreateClassification(event.target.value as Classification)
                    }
                    className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-brand-primary dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <option value="USO_INTERNO">Uso interno</option>
                    <option value="CONFIDENCIAL">Confidencial</option>
                    <option value="RESTRINGIDO">Restringido</option>
                  </select>
                </label>
              )}

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Motivo</span>
                <textarea
                  required
                  rows={3}
                  value={createReason}
                  onChange={(event) => setCreateReason(event.target.value)}
                  placeholder="Mínimo configurado por la política"
                  className="w-full resize-none rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none input-brand-focus focus:ring-2 focus:ring-brand-primary/15 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
            </div>

            <footer className="shrink-0 flex justify-end gap-2 border-t border-neutral-200 px-5 py-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  !createName.trim() ||
                  !createReason.trim() ||
                  (createType === 'folder' &&
                    createFolderAccessMode === 'selected' &&
                    createFolderGrantEmails.length === 0)
                }
                className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createType === 'folder' ? 'Crear carpeta' : 'Crear'}
              </button>
            </footer>
          </form>
        </div>
      )}

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleUpload} className="app-modal-panel max-w-md">
            <header className="shrink-0 flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-zinc-800">
              <div>
                <h2 className="font-semibold">Subir archivo</h2>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-zinc-400">
                  PDF, PNG, JPEG (subida directa) · Word/Excel/PowerPoint (requieren aprobación)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-zinc-800"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="app-modal-scroll space-y-4 px-5 py-5">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Archivo</span>
                <input
                  required
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,.exe,.msi,.dmg,.pkg,application/x-msdownload,application/vnd.microsoft.portable-executable,application/x-msi,application/x-apple-diskimage,application/vnd.apple.installer+xml,application/octet-stream,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/msword,application/vnd.ms-excel,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                  onChange={(event) => setUploadFileValue(event.target.files?.[0] ?? null)}
                  className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:font-medium dark:border-zinc-700 dark:bg-zinc-950 dark:file:bg-zinc-800"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Clasificación</span>
                <select
                  value={uploadClassification}
                  onChange={(event) =>
                    setUploadClassification(event.target.value as Classification)
                  }
                  className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="USO_INTERNO">Uso interno</option>
                  <option value="CONFIDENCIAL">Confidencial</option>
                  <option value="RESTRINGIDO">Restringido</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Motivo</span>
                <textarea
                  required
                  rows={3}
                  value={uploadReason}
                  onChange={(event) => setUploadReason(event.target.value)}
                  className="w-full resize-none rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
            </div>
            <footer className="shrink-0 flex justify-end gap-2 border-t border-neutral-200 px-5 py-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={uploading || !uploadFileValue || !uploadReason.trim()}
                className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {uploading
                  ? 'Enviando…'
                  : uploadFileValue && isOfficeUploadFile(uploadFileValue)
                    ? 'Solicitar aprobación'
                    : 'Subir'}
              </button>
            </footer>
          </form>
        </div>
      )}

      {permissionsTarget && (
        <DrivePermissionsModal
          fileId={permissionsTarget.id}
          fileName={permissionsTarget.name}
          classification={permissionsTarget.classification}
          onClose={() => setPermissionsTarget(null)}
        />
      )}

      {moveTarget && (
        <DriveFolderPickerModal
          title="Mover elemento"
          description={`Elegí la carpeta destino para «${moveTarget.name}». Necesitás permiso de escritura en origen y destino.`}
          excludeFolderIds={
            moveTarget.isFolder ? [moveTarget.id] : []
          }
          onClose={() => setMoveTarget(null)}
          onSelect={async (folderId, folderName) => {
            try {
              await moveDriveFile(moveTarget.id, folderId)
              toast.success(`Movido a ${folderName}`)
              setMoveTarget(null)
              await refreshFolderListing()
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'No se pudo mover el elemento')
            }
          }}
        />
      )}

      {morePermissionsTarget && (
        <RequestMorePermissionsModal
          fileId={morePermissionsTarget.id}
          fileName={morePermissionsTarget.name}
          onClose={() => setMorePermissionsTarget(null)}
        />
      )}

      {action && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleAction} className="app-modal-panel max-w-md">
            <header className="shrink-0 flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-zinc-800">
              <div className="min-w-0">
                <h2 className="font-semibold">
                  {action.kind === 'trash'
                    ? 'Enviar a papelera'
                    : action.kind === 'rename'
                      ? 'Renombrar'
                    : action.kind === 'approve'
                      ? 'Aprobar archivo'
                      : 'Cambiar clasificación'}
                </h2>
                <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-zinc-400">
                  {action.file.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAction(null)}
                className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-zinc-800"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="app-modal-scroll space-y-4 px-5 py-5">
              {action.kind === 'rename' && (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Nuevo nombre</span>
                  <input
                    required
                    type="text"
                    value={renameName}
                    onChange={(event) => setRenameName(event.target.value)}
                    className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </label>
              )}
              {action.kind === 'classification' && (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Clasificación</span>
                  <select
                    value={actionClassification}
                    onChange={(event) =>
                      setActionClassification(event.target.value as Classification)
                    }
                    className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <option value="USO_INTERNO">Uso interno</option>
                    <option value="CONFIDENCIAL">Confidencial</option>
                    <option value="RESTRINGIDO">Restringido</option>
                  </select>
                </label>
              )}
              {action.kind !== 'rename' && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">
                  Motivo {trashReasonOptional ? '(opcional)' : ''}
                </span>
                <textarea
                  required={!trashReasonOptional}
                  rows={3}
                  value={actionReason}
                  onChange={(event) => setActionReason(event.target.value)}
                  className="w-full resize-none rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              )}
            </div>
            <footer className="shrink-0 flex justify-end gap-2 border-t border-neutral-200 px-5 py-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setAction(null)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  acting ||
                  (action.kind === 'rename'
                    ? !renameName.trim()
                    : !trashReasonOptional && !actionReason.trim())
                }
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                  action.kind === 'trash'
                    ? 'btn-danger'
                    : 'btn-primary'
                }`}
              >
                {acting ? 'Procesando…' : 'Confirmar'}
              </button>
            </footer>
          </form>
        </div>
      )}

      {activeMenuFile &&
        menuPosition &&
        hasRowMenuActions(activeMenuFile) &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="Cerrar menú de acciones"
              className="app-dropdown-backdrop"
              onClick={closeRowMenu}
            />
            <div
              className="app-dropdown-menu fixed w-52"
              style={{ top: menuPosition.top, left: menuPosition.left }}
              role="menu"
            >
              {renderRowMenuItems(activeMenuFile)}
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
