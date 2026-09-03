import type { drive_v3 } from 'googleapis'
import { adminDb } from '../../lib/firebase/admin.js'
import { subjectCacheKey, TtlCache } from '../../cache/ttlCache.js'

const MAPPINGS_TTL_MS = 15 * 60 * 1000
const AREA_NAMES_TTL_MS = 15 * 60 * 1000
const ROOT_PROBE_TTL_MS = 30 * 1000

export interface DriveFolderMapping {
  id: string
  governingAreaId: string | null
}

type DriveFileMeta = drive_v3.Schema$File

const mappingsCache = new TtlCache<DriveFolderMapping[]>(MAPPINGS_TTL_MS)
const areaNameCache = new TtlCache<string>(AREA_NAMES_TTL_MS)
const rootProbeCache = new TtlCache<DriveFileMeta[]>(ROOT_PROBE_TTL_MS)

const GLOBAL_MAPPINGS_KEY = 'global:driveFolderAreas'

export async function getDriveFolderMappings(): Promise<DriveFolderMapping[]> {
  const cached = mappingsCache.get(GLOBAL_MAPPINGS_KEY)
  if (cached) return cached

  const snap = await adminDb().collection('driveFolderAreas').get()
  const mappings = snap.docs.map((doc) => {
    const raw = doc.get('governingAreaId')
    return {
      id: doc.id,
      governingAreaId: typeof raw === 'string' && raw.length > 0 ? raw : null,
    }
  })
  mappingsCache.set(GLOBAL_MAPPINGS_KEY, mappings)
  return mappings
}

export async function getAreaNamesByIds(areaIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const missing: string[] = []

  for (const id of areaIds) {
    const cacheKey = `global:area:${id}`
    const cached = areaNameCache.get(cacheKey)
    if (cached !== undefined) {
      result.set(id, cached)
    } else {
      missing.push(id)
    }
  }

  if (missing.length > 0) {
    const snaps = await adminDb().getAll(
      ...missing.map((id) => adminDb().collection('folders').doc(id)),
    )
    for (const snap of snaps) {
      const name =
        snap.exists && typeof snap.get('name') === 'string' ? snap.get('name') : snap.id
      areaNameCache.set(`global:area:${snap.id}`, name)
      result.set(snap.id, name)
    }
  }

  return result
}

export async function getCachedRootProbeExtras(
  driveSubject: string,
  uid: string,
  loader: () => Promise<DriveFileMeta[]>,
): Promise<DriveFileMeta[]> {
  const key = subjectCacheKey(driveSubject, uid, 'root-probe')
  const cached = rootProbeCache.get(key)
  if (cached) return cached

  const value = await loader()
  rootProbeCache.set(key, value)
  return value
}

export async function getCachedRootSharedFiles(
  driveSubject: string,
  uid: string,
  loader: () => Promise<DriveFileMeta[]>,
): Promise<DriveFileMeta[]> {
  const key = subjectCacheKey(driveSubject, uid, 'root-shared-files')
  const cached = rootProbeCache.get(key)
  if (cached) return cached

  const value = await loader()
  rootProbeCache.set(key, value)
  return value
}

/** Invalida caché dependiente del usuario tras mutaciones en Drive. */
export function invalidateDriveMetadataForUser(driveSubject: string, uid: string): void {
  rootProbeCache.deleteByPrefix(`${driveSubject}\x00${uid}\x00`)
}

export async function invalidateDriveMetadataForEmail(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return

  const snap = await adminDb()
    .collection('users')
    .where('email', '==', normalized)
    .limit(1)
    .get()
  if (snap.empty) return

  invalidateDriveMetadataForUser(normalized, snap.docs[0].id)
}
