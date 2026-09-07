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

export const DRIVE_EXPLORER_DEFAULT_PATH = '/recursos'

function isDriveBreadcrumbItem(value: unknown): value is DriveBreadcrumbItem {
  if (typeof value !== 'object' || value === null) return false
  const row = value as DriveBreadcrumbItem
  return (
    typeof row.name === 'string' &&
    (row.id === null || typeof row.id === 'string')
  )
}

export function parseDriveBreadcrumb(value: unknown): DriveBreadcrumbItem[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  if (!value.every(isDriveBreadcrumbItem)) return null
  if (value[0].id !== null) return null
  return value
}
