import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  Grid2X2,
  List,
  Loader2,
  MoreVertical,
  Plus,
  Search,
  Share2,
  Shield,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { DrivePermissionsModal } from '../components/DrivePermissionsModal'
import { useAuth } from '../context'
import {
  approveDriveFile,
  createDriveFile,
  trashDriveFile,
  updateDriveClassification,
  uploadDriveFile,
  type DriveClassification as Classification,
  type DriveCreateType,
  type DriveFileDto,
} from '../services/driveApi'
import {
  invalidateDriveFolderListing,
  useDriveFilesQuery,
} from '../hooks/queries/useDriveFilesQuery'
import { canOpenDriveEmbedded } from '../utils/googleDriveEmbed'

type FileKind = 'folder' | 'document' | 'spreadsheet' | 'pdf' | 'image'

type BreadcrumbItem = { id: string | null; name: string }
type FileAction = 'trash' | 'approve' | 'classification'

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
  const managedAreaIds = userProfile?.managedAreaIds ?? []
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([
    { id: null, name: 'bacarsa' },
  ])
  const [showCreate, setShowCreate] = useState(false)
  const [showNewMenu, setShowNewMenu] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createType, setCreateType] = useState<DriveCreateType>('google_doc')
  const [createClassification, setCreateClassification] =
    useState<Classification>('USO_INTERNO')
  const [createReason, setCreateReason] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadFileValue, setUploadFileValue] = useState<File | null>(null)
  const [uploadClassification, setUploadClassification] =
    useState<Classification>('USO_INTERNO')
  const [uploadReason, setUploadReason] = useState('')
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)
  const [action, setAction] = useState<{ kind: FileAction; file: DriveFileDto } | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [actionClassification, setActionClassification] =
    useState<Classification>('USO_INTERNO')
  const [acting, setActing] = useState(false)
  const [permissionsTarget, setPermissionsTarget] = useState<DriveFileDto | null>(null)
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

  const refreshFolderListing = async () => {
    await invalidateDriveFolderListing(user?.uid, currentFolder.id)
  }

  const visibleFiles = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es')
    if (!normalized) return files
    return files.filter((file) =>
      `${file.name} ${file.ownerLabel}`.toLocaleLowerCase('es').includes(normalized),
    )
  }, [files, query])

  const openItem = (file: DriveFileDto) => {
    if (file.isFolder) {
      setBreadcrumb((current) => [...current, { id: file.id, name: file.name }])
      setQuery('')
      return
    }

    if (canOpenDriveEmbedded(file.mimeType)) {
      navigate(`/recursos/documento/${file.id}`, {
        state: { returnTo: `${location.pathname}${location.search}` },
      })
      return
    }

    if (file.webViewLink) window.open(file.webViewLink, '_blank', 'noopener,noreferrer')
  }

  const navigateToCrumb = (index: number) => {
    setBreadcrumb((current) => current.slice(0, index + 1))
    setQuery('')
  }

  const openCreate = (type: DriveCreateType) => {
    setCreateType(type)
    setShowNewMenu(false)
    setShowCreate(true)
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!resolvedFolderId || !createName.trim()) return
    setCreating(true)
    try {
      await createDriveFile({
        name: createName.trim(),
        type: createType,
        parentFolderId: resolvedFolderId,
        ...(createType !== 'folder' ? { classification: createClassification } : {}),
        reason: createReason.trim(),
      })
      toast.success(createType === 'folder' ? 'Carpeta creada en Drive' : 'Archivo creado en Drive')
      setShowCreate(false)
      setCreateName('')
      setCreateReason('')
      await refreshFolderListing()
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : createType === 'folder'
            ? 'No se pudo crear la carpeta'
            : 'No se pudo crear el archivo',
      )
    } finally {
      setCreating(false)
    }
  }

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault()
    if (!resolvedFolderId || !uploadFileValue) return
    setUploading(true)
    try {
      await uploadDriveFile({
        file: uploadFileValue,
        parentFolderId: resolvedFolderId,
        classification: uploadClassification,
        reason: uploadReason.trim(),
      })
      toast.success('Archivo subido a Drive')
      setShowUpload(false)
      setUploadFileValue(null)
      setUploadReason('')
      await refreshFolderListing()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir el archivo')
    } finally {
      setUploading(false)
    }
  }

  const canGovernFile = (file: DriveFileDto) =>
    isSuperAdmin ||
    (Boolean(file.governingAreaId) &&
      managedAreaIds.includes(file.governingAreaId as string))

  const canApprove = (file: DriveFileDto) =>
    !file.isFolder &&
    file.status === 'BORRADOR' &&
    canGovernFile(file)

  const openAction = (kind: FileAction, file: DriveFileDto) => {
    setActiveMenuId(null)
    setAction({ kind, file })
    setActionReason('')
    setActionClassification(file.classification ?? 'USO_INTERNO')
  }

  const handleAction = async (event: FormEvent) => {
    event.preventDefault()
    if (!action) return
    setActing(true)
    try {
      if (action.kind === 'trash') {
        await trashDriveFile(action.file.id, actionReason)
        toast.success('Elemento enviado a la papelera')
      } else if (action.kind === 'approve') {
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
      await refreshFolderListing()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo completar la acción')
    } finally {
      setActing(false)
    }
  }

  const trashReasonOptional =
    action?.kind === 'trash' &&
    ['application/pdf', 'image/png', 'image/jpeg'].includes(action.file.mimeType)

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

      <div className="pb-2">
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
                    className="fixed inset-0 z-30 cursor-default"
                    onClick={() => setShowNewMenu(false)}
                  />
                  <div
                    role="menu"
                    className="absolute left-0 top-full z-40 mt-1 min-w-[220px] overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
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

          <div className={`flex items-center gap-2 ${showCreateUploadActions ? '' : 'ml-auto w-full justify-end'}`}>
            <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-200 px-3 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900">
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
            </button>
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

        <section className="mt-6 overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid grid-cols-[minmax(250px,2fr)_minmax(120px,0.8fr)_minmax(160px,1fr)_minmax(72px,auto)] border-b border-neutral-200 bg-neutral-50/70 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-500">
            <span>Nombre</span>
            <span className="hidden md:block">Propietario</span>
            <span className="hidden sm:block">Última modificación</span>
            <span />
          </div>

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
                Probá con otro nombre o propietario.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-zinc-800">
              {visibleFiles.map((file) => {
                const kind = kindFor(file)
                const Icon = kindIcon[kind]
                return (
                  <li
                    key={file.id}
                    onDoubleClick={() => openItem(file)}
                    className="grid min-h-16 grid-cols-[minmax(250px,2fr)_minmax(120px,0.8fr)_minmax(160px,1fr)_minmax(72px,auto)] items-center px-4 transition-colors hover:bg-neutral-50 dark:hover:bg-zinc-900/70"
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
                      {canGovernFile(file) && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuId(null)
                            setPermissionsTarget(file)
                          }}
                          aria-label={`Permisos de ${file.name}`}
                          title="Permisos"
                          className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-brand-primary dark:hover:bg-zinc-800 dark:hover:text-brand-primary"
                        >
                          <Share2 className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setActiveMenuId((current) => (current === file.id ? null : file.id))
                        }
                        aria-label={`Más acciones para ${file.name}`}
                        aria-expanded={activeMenuId === file.id}
                        className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {activeMenuId === file.id && (
                        <div className="absolute right-0 top-9 z-30 w-52 rounded-lg border border-neutral-200 bg-white py-1 dark:border-zinc-700 dark:bg-zinc-900">
                          {!file.isFolder && file.webViewLink && (
                            <button
                              type="button"
                              onClick={() => openItem(file)}
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
                          {canGovernFile(file) && !file.isFolder && (
                            <button
                              type="button"
                              onClick={() => openAction('classification', file)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-zinc-800"
                            >
                              <Shield className="h-4 w-4" />
                              Clasificación
                            </button>
                          )}
                          {canGovernFile(file) && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null)
                                setPermissionsTarget(file)
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-zinc-800"
                            >
                              <Share2 className="h-4 w-4" />
                              Permisos
                            </button>
                          )}
                          {canGovernFile(file) && !file.isFolder && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null)
                                toast('La copia autorizada llega en el próximo corte')
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-zinc-800"
                            >
                              <Copy className="h-4 w-4" />
                              Copia autorizada
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
                        </div>
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

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md rounded-xl border border-neutral-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
          >
            <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-zinc-800">
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

            <div className="space-y-4 px-5 py-5">
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
                  onChange={(event) =>
                    setCreateType(event.target.value as DriveCreateType)
                  }
                  className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-brand-primary dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="google_doc">Documento de Google</option>
                  <option value="google_sheet">Hoja de cálculo de Google</option>
                  <option value="folder">Carpeta</option>
                </select>
              </label>

              {createType !== 'folder' && (
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

            <footer className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creating || !createName.trim() || !createReason.trim()}
                className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating
                  ? 'Creando…'
                  : createType === 'folder'
                    ? 'Crear carpeta'
                    : 'Crear'}
              </button>
            </footer>
          </form>
        </div>
      )}

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={handleUpload}
            className="w-full max-w-md rounded-xl border border-neutral-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
          >
            <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-zinc-800">
              <div>
                <h2 className="font-semibold">Subir archivo</h2>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-zinc-400">
                  PDF, PNG o JPEG · máximo 25 MB
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
            <div className="space-y-4 px-5 py-5">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Archivo</span>
                <input
                  required
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
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
            <footer className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-4 dark:border-zinc-800">
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
                {uploading ? 'Subiendo…' : 'Subir'}
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

      {action && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={handleAction}
            className="w-full max-w-md rounded-xl border border-neutral-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
          >
            <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-zinc-800">
              <div className="min-w-0">
                <h2 className="font-semibold">
                  {action.kind === 'trash'
                    ? 'Enviar a papelera'
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
            <div className="space-y-4 px-5 py-5">
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
            </div>
            <footer className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setAction(null)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={acting || (!trashReasonOptional && !actionReason.trim())}
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
    </div>
  )
}
