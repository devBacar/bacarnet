export type DriveBreadcrumbItem = {
  id: string | null
  name: string
}

export type DriveDocumentViewerLocationState = {
  returnTo?: string
  driveBreadcrumb?: DriveBreadcrumbItem[]
}

export type DriveExplorerLocationState = {
  driveBreadcrumb?: DriveBreadcrumbItem[]
}

export type DriveExplorerView = 'list' | 'grid'

export type DriveExplorerUiState = {
  query: string
  view: DriveExplorerView
  filterClassifications: Set<string>
  filterKinds: Set<string>
  filterStatuses: Set<string>
}

export const DRIVE_EXPLORER_DEFAULT_PATH = '/recursos'
export const DRIVE_FOLDER_PATH_PARAM = 'carpeta'
export const DRIVE_QUERY_PARAM = 'q'
export const DRIVE_VIEW_PARAM = 'v'
export const DRIVE_CLASS_FILTER_PARAM = 'cls'
export const DRIVE_KIND_FILTER_PARAM = 'kind'
export const DRIVE_STATUS_FILTER_PARAM = 'status'
export const DOCUMENT_RETURN_FROM_PARAM = 'from'

const ROOT_CRUMB: DriveBreadcrumbItem = { id: null, name: 'bacarsa' }

const DEFAULT_UI: DriveExplorerUiState = {
  query: '',
  view: 'list',
  filterClassifications: new Set(),
  filterKinds: new Set(),
  filterStatuses: new Set(),
}

function isDriveBreadcrumbItem(value: unknown): value is DriveBreadcrumbItem {
  if (typeof value !== 'object' || value === null) return false
  const row = value as DriveBreadcrumbItem
  return (
    typeof row.name === 'string' &&
    (row.id === null || typeof row.id === 'string')
  )
}

function parseCsvParam(raw: string | null): Set<string> {
  if (!raw?.trim()) return new Set()
  return new Set(
    raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  )
}

function csvParamValue(values: Set<string>): string | null {
  if (values.size === 0) return null
  return [...values].sort().join(',')
}

export function parseDriveBreadcrumb(value: unknown): DriveBreadcrumbItem[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  if (!value.every(isDriveBreadcrumbItem)) return null
  if (value[0].id !== null) return null
  return value
}

/** IDs de carpetas (sin raíz) serializados para la URL. */
export function driveBreadcrumbToFolderPath(breadcrumb: DriveBreadcrumbItem[]): string | null {
  if (breadcrumb.length <= 1) return null
  const ids = breadcrumb
    .slice(1)
    .map((crumb) => crumb.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  return ids.length > 0 ? ids.join(',') : null
}

export function folderPathToBreadcrumb(pathParam: string | null): DriveBreadcrumbItem[] | null {
  if (!pathParam?.trim()) return null
  const ids = pathParam
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (ids.length === 0) return null
  return [ROOT_CRUMB, ...ids.map((id) => ({ id, name: '…' }))]
}

export function resolveInitialDriveBreadcrumb(input: {
  stateBreadcrumb: unknown
  pathParam: string | null
}): DriveBreadcrumbItem[] {
  return (
    parseDriveBreadcrumb(input.stateBreadcrumb) ??
    folderPathToBreadcrumb(input.pathParam) ?? [ROOT_CRUMB]
  )
}

export function parseDriveExplorerUiFromSearch(searchParams: URLSearchParams): DriveExplorerUiState {
  const viewRaw = searchParams.get(DRIVE_VIEW_PARAM)
  return {
    query: searchParams.get(DRIVE_QUERY_PARAM)?.trim() ?? '',
    view: viewRaw === 'grid' ? 'grid' : 'list',
    filterClassifications: parseCsvParam(searchParams.get(DRIVE_CLASS_FILTER_PARAM)),
    filterKinds: parseCsvParam(searchParams.get(DRIVE_KIND_FILTER_PARAM)),
    filterStatuses: parseCsvParam(searchParams.get(DRIVE_STATUS_FILTER_PARAM)),
  }
}

export function buildExplorerSearchParams(input: {
  breadcrumb: DriveBreadcrumbItem[]
  ui: DriveExplorerUiState
}): URLSearchParams {
  const params = new URLSearchParams()
  const folderPath = driveBreadcrumbToFolderPath(input.breadcrumb)
  if (folderPath) params.set(DRIVE_FOLDER_PATH_PARAM, folderPath)
  if (input.ui.query.trim()) params.set(DRIVE_QUERY_PARAM, input.ui.query.trim())
  if (input.ui.view === 'grid') params.set(DRIVE_VIEW_PARAM, 'grid')
  const cls = csvParamValue(input.ui.filterClassifications)
  if (cls) params.set(DRIVE_CLASS_FILTER_PARAM, cls)
  const kind = csvParamValue(input.ui.filterKinds)
  if (kind) params.set(DRIVE_KIND_FILTER_PARAM, kind)
  const status = csvParamValue(input.ui.filterStatuses)
  if (status) params.set(DRIVE_STATUS_FILTER_PARAM, status)
  return params
}

export function explorerSearchEqual(current: URLSearchParams, expected: URLSearchParams): boolean {
  return current.toString() === expected.toString()
}

export function buildExplorerPath(
  pathname: string,
  breadcrumb: DriveBreadcrumbItem[],
  ui: DriveExplorerUiState = DEFAULT_UI,
): string {
  const params = buildExplorerSearchParams({ breadcrumb, ui })
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

export function buildDocumentViewerSearch(
  returnPathname: string,
  breadcrumb: DriveBreadcrumbItem[],
): URLSearchParams {
  const params = new URLSearchParams()
  params.set(DOCUMENT_RETURN_FROM_PARAM, returnPathname)
  const folderPath = driveBreadcrumbToFolderPath(breadcrumb)
  if (folderPath) params.set(DRIVE_FOLDER_PATH_PARAM, folderPath)
  return params
}

export function resolveDocumentViewerReturn(input: {
  searchParams: URLSearchParams
  state: DriveDocumentViewerLocationState | null
}): { returnTo: string; driveBreadcrumb?: DriveBreadcrumbItem[] } {
  const fromParam = input.searchParams.get(DOCUMENT_RETURN_FROM_PARAM)
  const carpeta = input.searchParams.get(DRIVE_FOLDER_PATH_PARAM)

  if (fromParam?.startsWith('/')) {
    const returnTo = carpeta ? `${fromParam}?${DRIVE_FOLDER_PATH_PARAM}=${carpeta}` : fromParam
    const driveBreadcrumb = folderPathToBreadcrumb(carpeta) ?? undefined
    return { returnTo, driveBreadcrumb }
  }

  const returnTo =
    input.state?.returnTo && input.state.returnTo.startsWith('/')
      ? input.state.returnTo
      : DRIVE_EXPLORER_DEFAULT_PATH
  return {
    returnTo,
    driveBreadcrumb: input.state?.driveBreadcrumb,
  }
}
