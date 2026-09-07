import type { DriveFileDto } from './driveApi'

const STORAGE_PREFIX = 'intranet.driveRecent.v1'
const MAX_ENTRIES = 20

export interface DriveRecentEntry {
  id: string
  name: string
  mimeType: string
  openedAt: string
}

function storageKey(uid: string): string {
  return `${STORAGE_PREFIX}:${uid}`
}

function readRaw(uid: string): DriveRecentEntry[] {
  if (!uid) return []
  try {
    const raw = localStorage.getItem(storageKey(uid))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (row): row is DriveRecentEntry =>
        typeof row === 'object' &&
        row !== null &&
        typeof (row as DriveRecentEntry).id === 'string' &&
        typeof (row as DriveRecentEntry).name === 'string' &&
        typeof (row as DriveRecentEntry).mimeType === 'string' &&
        typeof (row as DriveRecentEntry).openedAt === 'string',
    )
  } catch {
    return []
  }
}

function writeRaw(uid: string, entries: DriveRecentEntry[]): void {
  if (!uid) return
  localStorage.setItem(storageKey(uid), JSON.stringify(entries.slice(0, MAX_ENTRIES)))
}

export function listDriveRecentFiles(uid: string | undefined): DriveRecentEntry[] {
  if (!uid) return []
  return readRaw(uid).sort(
    (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
  )
}

export function recordDriveRecentOpen(uid: string | undefined, file: Pick<DriveFileDto, 'id' | 'name' | 'mimeType' | 'isFolder'>): void {
  if (!uid || file.isFolder) return
  const now = new Date().toISOString()
  const next: DriveRecentEntry = {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    openedAt: now,
  }
  const entries = readRaw(uid).filter((row) => row.id !== file.id)
  entries.unshift(next)
  writeRaw(uid, entries)
}

export function removeDriveRecentFile(uid: string | undefined, fileId: string): void {
  if (!uid) return
  writeRaw(
    uid,
    readRaw(uid).filter((row) => row.id !== fileId),
  )
}

export function pruneDriveRecentFiles(uid: string | undefined, accessibleIds: Set<string>): void {
  if (!uid) return
  writeRaw(uid, readRaw(uid).filter((row) => accessibleIds.has(row.id)))
}
