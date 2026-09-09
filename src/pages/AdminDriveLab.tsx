import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
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
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { DriveFileIcon } from '../components/DriveFileIcon'
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
import { formatFileSize, formatUploadSizeLimit, isWithinUploadLimit, partitionUploadFilesByLimit, STAGING_UPLOAD_MAX_BYTES, uploadFileLabel, usesStagingUpload } from '../utils/uploadLimits'
import {
  isFolderUploadSelection,
  isSkippedUploadFile,
  summarizeFolderUpload,
} from '../utils/folderUploadPlan'
import {
  ensureFolderUploadTree,
  resolveFolderUploadParentId,
} from '../utils/runFolderUpload'
import { runWithConcurrency, type QueueProgress } from '../utils/uploadQueue'
import {
  approveDriveFile,
  moveDriveFile,
  updateDriveClassification,
  uploadDriveFile,
  getDriveFile,
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
  buildDocumentViewerSearch,
  buildExplorerPath,
  buildExplorerSearchParams,
  DRIVE_FOLDER_PATH_PARAM,
  explorerSearchEqual,
  parseDriveBreadcrumb,
  parseDriveExplorerUiFromSearch,
  resolveInitialDriveBreadcrumb,
  type DriveBreadcrumbItem,
} from '../utils/driveExplorerNavigation'

type FileKind = 'folder' | 'document' | 'spreadsheet' | 'pdf' | 'image'

type BreadcrumbItem = DriveBreadcrumbItem
type FileAction = 'trash' | 'approve' | 'classification' | 'rename'

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

type BulkUploadProgress = QueueProgress & { phase: 'folders' | 'files' }

type UploadPickerMode = 'files' | 'folder'

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

function DriveExplorerFilters({
  activeFilterCount,
  clearFilters,
  filterClassifications,
  filterKinds,
  filterStatuses,
  setFilterClassifications,
  setFilterKinds,
  setFilterStatuses,
  toggleFilter,
  hideTitle = false,
}: {
  activeFilterCount: number
  clearFilters: () => void
  filterClassifications: Set<Classification>
  filterKinds: Set<FileKind>
  filterStatuses: Set<StatusFilter>
  setFilterClassifications: (next: Set<Classification>) => void
  setFilterKinds: (next: Set<FileKind>) => void
  setFilterStatuses: (next: Set<StatusFilter>) => void
  toggleFilter: <T,>(current: Set<T>, value: T, setter: (next: Set<T>) => void) => void
  hideTitle?: boolean
}) {
  return (
    <>
      {!hideTitle && (
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
      )}
      {hideTitle && activeFilterCount > 0 && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs font-medium text-brand-primary hover:underline"
          >
            Limpiar filtros
          </button>
        </div>
      )}
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-zinc-500">
            Clasificación
          </legend>
          <div className="flex flex-wrap gap-2">
            {allClassifications.map((value) => (
              <label
                key={value}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs dark:border-zinc-700"
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
                className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs dark:border-zinc-700"
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
                className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs dark:border-zinc-700"
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
    </>
  )
}

export function AdminDriveLab() {
  const { user, userProfile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const isSuperAdmin = userProfile?.role === 'super_admin'
  const initialUi = parseDriveExplorerUiFromSearch(new URLSearchParams(location.search))
  const [query, setQuery] = useState(initialUi.query)
  const [view, setView] = useState<'list' | 'grid'>(initialUi.view)
  const [showFilters, setShowFilters] = useState(false)
  const [mobileDriveTab, setMobileDriveTab] = useState<'explorer' | 'recientes'>('explorer')
  const [filterClassifications, setFilterClassifications] = useState<Set<Classification>>(
    () => new Set([...initialUi.filterClassifications].filter((v): v is Classification => allClassifications.includes(v as Classification))),
  )
  const [filterKinds, setFilterKinds] = useState<Set<FileKind>>(() =>
    new Set([...initialUi.filterKinds].filter((v): v is FileKind => allKinds.includes(v as FileKind))),
  )
  const [filterStatuses, setFilterStatuses] = useState<Set<StatusFilter>>(() =>
    new Set([...initialUi.filterStatuses].filter((v): v is StatusFilter => allStatuses.includes(v as StatusFilter))),
  )
  const filtersRef = useRef<HTMLDivElement>(null)
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>(() =>
    resolveInitialDriveBreadcrumb({
      stateBreadcrumb: (location.state as { driveBreadcrumb?: DriveBreadcrumbItem[] } | null)
        ?.driveBreadcrumb,
      pathParam: new URLSearchParams(location.search).get(DRIVE_FOLDER_PATH_PARAM),
    }),
  )
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
  const [uploadPickerMode, setUploadPickerMode] = useState<UploadPickerMode>('files')
  const [uploading, setUploading] = useState(false)
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploadProgress, setUploadProgress] = useState<BulkUploadProgress | null>(null)
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
    navigate(
      buildExplorerPath(location.pathname, restored, {
        query,
        view,
        filterClassifications,
        filterKinds,
        filterStatuses,
      }),
      { replace: true, state: {} },
    )
  }, [location.pathname, location.search, location.state, navigate, query, view, filterClassifications, filterKinds, filterStatuses])

  useEffect(() => {
    const expected = buildExplorerSearchParams({
      breadcrumb,
      ui: { query, view, filterClassifications, filterKinds, filterStatuses },
    })
    if (explorerSearchEqual(searchParams, expected)) return
    setSearchParams(expected, { replace: true })
  }, [
    breadcrumb,
    query,
    view,
    filterClassifications,
    filterKinds,
    filterStatuses,
    searchParams,
    setSearchParams,
  ])

  useEffect(() => {
    const pending = breadcrumb.filter(
      (crumb): crumb is { id: string; name: string } =>
        typeof crumb.id === 'string' && crumb.name === '…',
    )
    if (pending.length === 0) return

    let cancelled = false
    void (async () => {
      const names = new Map<string, string>()
      await Promise.all(
        pending.map(async (crumb) => {
          try {
            const detail = await getDriveFile(crumb.id)
            names.set(crumb.id, detail.name)
          } catch {
            names.set(crumb.id, crumb.id.slice(0, 12))
          }
        }),
      )
      if (cancelled) return
      setBreadcrumb((current) =>
        current.map((crumb) =>
          crumb.id && names.has(crumb.id) ? { ...crumb, name: names.get(crumb.id)! } : crumb,
        ),
      )
    })()

    return () => {
      cancelled = true
    }
  }, [breadcrumb])

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
    if (file.id.startsWith('optimistic-')) {
      toast('La carpeta se está creando, esperá un momento…', { icon: '⏳' })
      return
    }
    if (file.isFolder) {
      setBreadcrumb((current) => [...current, { id: file.id, name: file.name }])
      setQuery('')
      return
    }

    if (canOpenDriveEmbedded(file.mimeType)) {
      recordDriveRecentOpen(user?.uid, file)
      const docSearch = buildDocumentViewerSearch(location.pathname, breadcrumb)
      navigate(`/recursos/documento/${file.id}?${docSearch.toString()}`)
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
    const docSearch = buildDocumentViewerSearch(location.pathname, breadcrumb)
    navigate(`/recursos/documento/${entry.id}?${docSearch.toString()}`)
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

  const UPLOAD_CONCURRENCY = 1

  const usableUploadFiles = useMemo(
    () => uploadFiles.filter((file) => !isSkippedUploadFile(file)),
    [uploadFiles],
  )

  const folderUploadSummary = useMemo(
    () => summarizeFolderUpload(usableUploadFiles),
    [usableUploadFiles],
  )

  const isFolderUpload =
    uploadPickerMode === 'folder' && isFolderUploadSelection(usableUploadFiles)

  const uploadSingleFile = async (file: File, parentFolderId = resolvedFolderId) => {
    if (!parentFolderId) throw new Error('Carpeta destino no disponible')

    if (isOfficeUploadFile(file)) {
      await createOfficeUploadRequest({
        file,
        parentFolderId,
        classification: uploadClassification,
        reason: uploadReason.trim(),
      })
      return 'office' as const
    }

    await uploadDriveFile({
      file,
      parentFolderId,
      classification: uploadClassification,
      reason: uploadReason.trim(),
    })
    return isInstallerUploadFile(file) ? ('installer' as const) : ('direct' as const)
  }

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault()
    if (!resolvedFolderId || usableUploadFiles.length === 0) return

    if (uploadPickerMode === 'folder' && !isFolderUploadSelection(usableUploadFiles)) {
      toast.error('Elegí una carpeta del disco (no archivos sueltos) para importar la estructura')
      return
    }

    const { accepted: filesToUpload, tooLarge } = partitionUploadFilesByLimit(usableUploadFiles)

    if (tooLarge.length > 0) {
      const preview = tooLarge
        .slice(0, 3)
        .map((file) => `${uploadFileLabel(file)} (${formatFileSize(file.size)})`)
        .join(' · ')
      const suffix =
        tooLarge.length > 3 ? ` · y ${tooLarge.length - 3} más` : ''

      if (filesToUpload.length === 0) {
        toast.error(
          `Ningún archivo se puede subir: ${tooLarge.length} superan ${formatUploadSizeLimit(STAGING_UPLOAD_MAX_BYTES)}. ${preview}${suffix}`,
          { duration: 10000 },
        )
        return
      }

      toast(
        `Se omitirán ${tooLarge.length} archivo(s) >${formatUploadSizeLimit(STAGING_UPLOAD_MAX_BYTES)} y se importará el resto (${filesToUpload.length}). ${preview}${suffix}`,
        { icon: '⚠️', duration: 10000 },
      )
    }

    const folderSummaryForUpload = summarizeFolderUpload(filesToUpload)

    setUploading(true)
    setUploadProgress({
      phase: isFolderUpload ? 'folders' : 'files',
      completed: 0,
      total: isFolderUpload ? folderSummaryForUpload.folderCount : filesToUpload.length,
      inFlight: 0,
    })

    try {
      let folderCache = new Map<string, string>()

      if (isFolderUpload) {
        folderCache = await ensureFolderUploadTree({
          files: filesToUpload,
          rootParentFolderId: resolvedFolderId,
          reason: uploadReason.trim(),
          onFolderProgress: (completed, total) => {
            setUploadProgress({
              phase: 'folders',
              completed,
              total,
              inFlight: completed < total ? 1 : 0,
            })
          },
        })
      }

      setUploadProgress({
        phase: 'files',
        completed: 0,
        total: filesToUpload.length,
        inFlight: 0,
      })

      const results = await runWithConcurrency(
        filesToUpload,
        UPLOAD_CONCURRENCY,
        (file) =>
          uploadSingleFile(
            file,
            isFolderUpload
              ? resolveFolderUploadParentId(resolvedFolderId, file, folderCache)
              : resolvedFolderId,
          ),
        (progress) => setUploadProgress({ phase: 'files', ...progress }),
      )

      const failed = results.filter((entry) => !entry.ok)
      const officeCount = results.filter((entry) => entry.ok && entry.result === 'office').length
      const installerCount = results.filter(
        (entry) => entry.ok && entry.result === 'installer',
      ).length
      const directCount = results.filter(
        (entry) => entry.ok && entry.result === 'direct',
      ).length

      if (officeCount + installerCount + directCount > 0) {
        await refreshFolderListing()
      }

      if (failed.length === 0) {
        if (isFolderUpload) {
          toast.success(
            `Carpeta importada: ${filesToUpload.length} archivo(s)${tooLarge.length > 0 ? ` · ${tooLarge.length} omitido(s) >${formatUploadSizeLimit(STAGING_UPLOAD_MAX_BYTES)}` : ''}`,
          )
        } else if (usableUploadFiles.length === 1 && officeCount === 1) {
          toast.success('Solicitud enviada — un jefe de área debe aprobar la subida')
        } else if (usableUploadFiles.length === 1 && installerCount === 1) {
          toast.success('Instalador subido a Drive')
        } else if (usableUploadFiles.length === 1) {
          toast.success('Archivo subido a Drive')
        } else {
          toast.success(`${results.length} archivo(s) procesados correctamente`)
        }
        setShowUpload(false)
        setUploadFiles([])
        setUploadReason('')
        setUploadPickerMode('files')
      } else if (failed.length < results.length) {
        const detail = failed
          .slice(0, 3)
          .map((entry) => `${entry.item.name}: ${entry.error.message}`)
          .join(' · ')
        toast.error(
          `${failed.length} de ${results.length} fallaron (${results.length - failed.length} OK). ${detail}`,
          { duration: 8000 },
        )
        setUploadFiles(failed.map((entry) => entry.item))
      } else {
        const detail = failed[0]?.error.message ?? 'No se pudo completar la operación'
        toast.error(
          failed.length === 1
            ? detail
            : `${failed.length} archivos fallaron. Ej.: ${detail}`,
          { duration: 8000 },
        )
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo completar la operación')
    } finally {
      setUploading(false)
      setUploadProgress(null)
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
            className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm transition-colors hover:bg-neutral-50 dark:hover:bg-zinc-900 ${
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
            <>
              {createPortal(
                <>
                  <button
                    type="button"
                    aria-label="Cerrar filtros"
                    className="fixed inset-0 z-[70] bg-neutral-900/40 lg:hidden"
                    onClick={() => setShowFilters(false)}
                  />
                  <div className="fixed inset-x-0 bottom-0 z-[80] max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl border border-neutral-200 bg-white p-4 pb-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 lg:hidden">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-neutral-900 dark:text-zinc-100">Filtros</p>
                      <button
                        type="button"
                        onClick={() => setShowFilters(false)}
                        aria-label="Cerrar panel de filtros"
                        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-zinc-800"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <DriveExplorerFilters
                      activeFilterCount={activeFilterCount}
                      clearFilters={clearFilters}
                      filterClassifications={filterClassifications}
                      filterKinds={filterKinds}
                      filterStatuses={filterStatuses}
                      setFilterClassifications={setFilterClassifications}
                      setFilterKinds={setFilterKinds}
                      setFilterStatuses={setFilterStatuses}
                      toggleFilter={toggleFilter}
                      hideTitle
                    />
                  </div>
                </>,
                document.body,
              )}
              <div className="absolute right-0 top-full z-30 mt-2 hidden w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-4 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 lg:block">
                <DriveExplorerFilters
                  activeFilterCount={activeFilterCount}
                  clearFilters={clearFilters}
                  filterClassifications={filterClassifications}
                  filterKinds={filterKinds}
                  filterStatuses={filterStatuses}
                  setFilterClassifications={setFilterClassifications}
                  setFilterKinds={setFilterKinds}
                  setFilterStatuses={setFilterStatuses}
                  toggleFilter={toggleFilter}
                />
              </div>
            </>
          )}
          <div className="flex rounded-lg border border-neutral-200 p-0.5 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setView('list')}
              aria-label="Vista de lista"
              className={`inline-flex h-11 w-11 items-center justify-center rounded-md ${view === 'list' ? 'bg-neutral-100 text-neutral-900 dark:bg-zinc-800 dark:text-white' : 'text-neutral-400'}`}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView('grid')}
              aria-label="Vista de cuadrícula"
              className={`inline-flex h-11 w-11 items-center justify-center rounded-md ${view === 'grid' ? 'bg-neutral-100 text-neutral-900 dark:bg-zinc-800 dark:text-white' : 'text-neutral-400'}`}
            >
              <Grid2X2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div
        className="mb-4 flex rounded-lg border border-neutral-200 p-1 dark:border-zinc-800 xl:hidden"
        role="tablist"
        aria-label="Secciones de archivos"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobileDriveTab === 'explorer'}
          onClick={() => setMobileDriveTab('explorer')}
          className={`min-h-11 flex-1 rounded-md px-3 text-sm font-medium transition-colors ${
            mobileDriveTab === 'explorer'
              ? 'bg-neutral-100 text-neutral-900 dark:bg-zinc-800 dark:text-white'
              : 'text-neutral-500 dark:text-zinc-400'
          }`}
        >
          Explorador
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileDriveTab === 'recientes'}
          onClick={() => setMobileDriveTab('recientes')}
          className={`min-h-11 flex-1 rounded-md px-3 text-sm font-medium transition-colors ${
            mobileDriveTab === 'recientes'
              ? 'bg-neutral-100 text-neutral-900 dark:bg-zinc-800 dark:text-white'
              : 'text-neutral-500 dark:text-zinc-400'
          }`}
        >
          Recientes
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-6 xl:mt-0 xl:flex-row xl:items-start">
        <div className={`min-w-0 flex-[7] pb-2 ${mobileDriveTab === 'recientes' ? 'hidden xl:block' : ''}`}>
        <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          {view === 'list' && (
            <div className="hidden border-b border-neutral-200 bg-neutral-50/70 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-neutral-500 md:grid md:grid-cols-[minmax(0,2fr)_minmax(120px,0.8fr)_minmax(160px,1fr)_auto] dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-500">
              <span>Nombre</span>
              <span>Propietario</span>
              <span>Última modificación</span>
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
                const menuOpen = activeMenuId === file.id
                return (
                  <div
                    key={file.id}
                    onDoubleClick={() => openItem(file)}
                    className="group relative flex flex-col rounded-xl border border-neutral-200 bg-neutral-50/40 p-4 transition-colors hover:border-brand-primary/30 hover:bg-neutral-50 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:bg-zinc-900"
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-zinc-950">
                        <DriveFileIcon file={file} size="md" />
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
            <ul className="divide-y divide-neutral-100 dark:divide-zinc-800">
              {visibleFiles.map((file) => {
                const menuOpen = activeMenuId === file.id
                const fileBadges = !file.isFolder ? (
                  <>
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
                  </>
                ) : null

                return (
                  <li
                    key={file.id}
                    onDoubleClick={() => openItem(file)}
                    className="flex min-h-11 items-center gap-2 px-3 py-2 transition-colors hover:bg-neutral-50 dark:hover:bg-zinc-900/70 md:grid md:min-h-16 md:grid-cols-[minmax(0,2fr)_minmax(120px,0.8fr)_minmax(160px,1fr)_auto] md:items-center md:gap-0 md:px-4 md:py-0"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3 md:min-w-0">
                      <DriveFileIcon file={file} size="sm" />
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => openItem(file)}
                          className="block w-full truncate text-left text-sm font-medium hover:text-brand-primary"
                        >
                          {file.name}
                        </button>
                        {fileBadges ? (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">{fileBadges}</div>
                        ) : null}
                      </div>
                    </div>
                    <span className="hidden truncate text-sm text-neutral-500 dark:text-zinc-400 md:block">
                      {file.ownerLabel}
                    </span>
                    <span className="hidden text-sm text-neutral-500 dark:text-zinc-400 md:block">
                      {formatModified(file.modifiedTime)}
                    </span>
                    <div className="flex shrink-0 items-center justify-end gap-0.5 md:ml-auto">
                      {canManagePermissions(file) && (
                        <button
                          type="button"
                          onClick={() => {
                            closeRowMenu()
                            setPermissionsTarget(file)
                          }}
                          aria-label={`Permisos de ${file.name}`}
                          title="Permisos"
                          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-brand-primary dark:hover:bg-zinc-800 dark:hover:text-brand-primary"
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
                          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
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

        <aside className={`min-w-0 flex-[3] ${mobileDriveTab === 'explorer' ? 'hidden xl:block' : ''} xl:sticky xl:top-28 xl:self-start xl:max-h-[calc(100dvh-8rem)]`}>
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
                <h2 className="font-semibold">
                  {isFolderUpload
                    ? `Importar carpeta (${folderUploadSummary.fileCount} archivos)`
                    : usableUploadFiles.length > 1
                      ? `Subir ${usableUploadFiles.length} archivos`
                      : 'Subir archivo'}
                </h2>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-zinc-400">
                  {uploadPickerMode === 'folder'
                    ? 'Se crean subcarpetas y se sube cada archivo a su ruta · 1 archivo por vez'
                    : 'Instaladores (.exe) siempre por carga optimizada · otros archivos grandes >20 MB igual'}
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
              <div className="flex rounded-lg border border-neutral-200 p-1 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => {
                    setUploadPickerMode('files')
                    setUploadFiles([])
                  }}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    uploadPickerMode === 'files'
                      ? 'bg-brand-primary text-white'
                      : 'text-neutral-600 hover:bg-neutral-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                  }`}
                >
                  Archivos sueltos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUploadPickerMode('folder')
                    setUploadFiles([])
                  }}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    uploadPickerMode === 'folder'
                      ? 'bg-brand-primary text-white'
                      : 'text-neutral-600 hover:bg-neutral-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                  }`}
                >
                  Carpeta completa
                </button>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">
                  {uploadPickerMode === 'folder' ? 'Carpeta del disco' : 'Archivos'}
                </span>
                <input
                  key={uploadPickerMode}
                  required
                  multiple={uploadPickerMode === 'files'}
                  {...(uploadPickerMode === 'folder'
                    ? ({ webkitdirectory: '', directory: '' } as Record<string, string>)
                    : {})}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.avi,.exe,.msi,.dmg,.pkg,.zip,.iso,.7z,.rar,.txt,application/x-msdownload,application/vnd.microsoft.portable-executable,application/x-msi,application/x-apple-diskimage,application/vnd.apple.installer+xml,application/zip,application/x-iso9660-image,application/x-7z-compressed,application/vnd.rar,text/plain,application/octet-stream,.doc,.docx,.odt,.ods,.odp,.xls,.xlsx,.ppt,.pptx,application/msword,application/vnd.ms-excel,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.oasis.opendocument.text,application/vnd.oasis.opendocument.spreadsheet,application/vnd.oasis.opendocument.presentation"
                  onChange={(event) =>
                    setUploadFiles(Array.from(event.target.files ?? []))
                  }
                  className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:font-medium dark:border-zinc-700 dark:bg-zinc-950 dark:file:bg-zinc-800"
                />
              </label>
              {usableUploadFiles.length > 0 && (
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <p className="text-xs font-medium text-neutral-600 dark:text-zinc-300">
                    {isFolderUpload && folderUploadSummary.rootName
                      ? `${folderUploadSummary.rootName} · ${folderUploadSummary.fileCount} archivo(s) · ${folderUploadSummary.folderCount} subcarpeta(s) · ${formatFileSize(folderUploadSummary.totalBytes)}${
                          usableUploadFiles.some((file) => !isWithinUploadLimit(file))
                            ? ` · ${usableUploadFiles.filter((file) => !isWithinUploadLimit(file)).length} >${formatUploadSizeLimit(STAGING_UPLOAD_MAX_BYTES)} (se omitirán)`
                            : ''
                        }`
                      : `${usableUploadFiles.length} seleccionado${usableUploadFiles.length === 1 ? '' : 's'} · 1 por vez (estable)`}
                  </p>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-neutral-500 dark:text-zinc-400">
                    {usableUploadFiles.slice(0, 12).map((file) => (
                      <li
                        key={`${file.webkitRelativePath || file.name}-${file.size}-${file.lastModified}`}
                        className="flex justify-between gap-2"
                      >
                        <span className="truncate">
                          {file.webkitRelativePath || file.name}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatFileSize(file.size)}
                          {usesStagingUpload(file) ? ' · grande' : ''}
                        </span>
                      </li>
                    ))}
                    {usableUploadFiles.length > 12 && (
                      <li className="text-neutral-400 dark:text-zinc-500">
                        … y {usableUploadFiles.length - 12} más
                      </li>
                    )}
                  </ul>
                  {isFolderUpload && (
                    <p className="mt-2 text-[11px] text-neutral-500 dark:text-zinc-400">
                      Los .doc/.docx/.xlsx dentro de la carpeta generan solicitud de aprobación del jefe de área.
                    </p>
                  )}
                </div>
              )}
              {uploadProgress && (
                <div>
                  <div className="mb-1 flex justify-between text-xs text-neutral-500 dark:text-zinc-400">
                    <span>
                      {uploadProgress.phase === 'folders'
                        ? 'Creando carpetas'
                        : 'Subiendo archivos'}
                    </span>
                    <span>
                      {uploadProgress.completed}/{uploadProgress.total}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-zinc-800">
                    <div
                      className="h-full bg-brand-primary transition-all"
                      style={{
                        width: `${Math.round((uploadProgress.completed / uploadProgress.total) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
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
                disabled={uploading || usableUploadFiles.length === 0 || !uploadReason.trim()}
                className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {uploading
                  ? uploadProgress?.phase === 'folders'
                    ? `Creando carpetas ${uploadProgress.completed}/${uploadProgress.total}…`
                    : `Enviando ${uploadProgress?.completed ?? 0}/${uploadProgress?.total ?? usableUploadFiles.length}…`
                  : isFolderUpload
                    ? `Importar ${folderUploadSummary.fileCount} archivos`
                    : usableUploadFiles.length > 1
                      ? `Subir ${usableUploadFiles.length} archivos`
                      : usableUploadFiles[0] && isOfficeUploadFile(usableUploadFiles[0])
                        ? 'Solicitar aprobación'
                        : 'Subir archivo'}
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
