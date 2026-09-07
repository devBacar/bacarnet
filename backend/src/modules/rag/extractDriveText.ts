import type { drive_v3 } from 'googleapis'
import { logError } from '../../lib/log.js'

const MAX_TEXT_BYTES = 1_048_576

const GOOGLE_EXPORT: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
}

const INDEXABLE_MIME_PREFIXES = ['text/']

function isIndexableMime(mimeType: string): boolean {
  if (GOOGLE_EXPORT[mimeType]) return true
  return INDEXABLE_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))
}

export function canExtractDriveText(mimeType: string): boolean {
  return isIndexableMime(mimeType)
}

async function downloadBuffer(
  drive: drive_v3.Drive,
  fileId: string,
  mimeType: string,
): Promise<Buffer> {
  const exportMime = GOOGLE_EXPORT[mimeType]
  if (exportMime) {
    const res = await drive.files.export(
      { fileId, mimeType: exportMime },
      { responseType: 'arraybuffer' },
    )
    return Buffer.from(res.data as ArrayBuffer)
  }

  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  )
  return Buffer.from(res.data as ArrayBuffer)
}

export async function extractDriveText(
  drive: drive_v3.Drive,
  fileId: string,
  mimeType: string,
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  if (!isIndexableMime(mimeType)) {
    return { ok: false, reason: `MIME no soportado en piloto: ${mimeType}` }
  }

  try {
    const buffer = await downloadBuffer(drive, fileId, mimeType)
    if (buffer.length === 0) {
      return { ok: false, reason: 'Archivo vacío' }
    }
    if (buffer.length > MAX_TEXT_BYTES) {
      return { ok: false, reason: `Texto excede ${MAX_TEXT_BYTES} bytes` }
    }

    const text = buffer.toString('utf8').replace(/\u0000/g, '').trim()
    if (!text) {
      return { ok: false, reason: 'Sin texto extraíble' }
    }
    return { ok: true, text }
  } catch (err) {
    logError('extractDriveText falló', err)
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { ok: false, reason: message }
  }
}
