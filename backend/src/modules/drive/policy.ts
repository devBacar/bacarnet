import { adminDb } from '../../lib/firebase/admin.js'

const DEFAULT_MIN_REASON = 1

export async function getMinReasonLength(): Promise<number> {
  const snap = await adminDb().collection('appSettings').doc('global').get()
  const raw = snap.exists ? snap.get('minReasonLength') : undefined
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw)
  }
  return DEFAULT_MIN_REASON
}

export async function getAllowedUploadMimeTypes(): Promise<string[]> {
  const snap = await adminDb()
    .collection('allowedMimeTypes')
    .where('allowed', '==', true)
    .get()

  const mimes: string[] = []
  for (const doc of snap.docs) {
    const mime = doc.get('mimeType')
    if (typeof mime === 'string' && mime.length > 0) {
      mimes.push(mime)
    }
  }
  mimes.sort((a, b) => a.localeCompare(b))
  return mimes
}

/** MIME de Office bloqueados en upload directo; requieren solicitud de aprobación. */
export const OFFICE_UPLOAD_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
])

export function isOfficeUploadMime(mimeType: string): boolean {
  return OFFICE_UPLOAD_MIMES.has(mimeType.trim().toLowerCase())
}
