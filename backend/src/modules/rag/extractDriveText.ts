import type { drive_v3 } from 'googleapis'
import { logError } from '../../lib/log.js'
import { isBinaryDocumentMime, parseDocumentBuffer } from './parseDocumentBuffer.js'

const MAX_BINARY_BYTES = 15 * 1024 * 1024
const MAX_TEXT_CHARS = 800_000

const GOOGLE_EXPORT: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
}

const INDEXABLE_MIME_PREFIXES = ['text/']

function isIndexableMime(mimeType: string): boolean {
  const mime = mimeType.trim().toLowerCase()
  if (GOOGLE_EXPORT[mime]) return true
  if (INDEXABLE_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) return true
  return isBinaryDocumentMime(mime)
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

function decodePlainTextBuffer(buffer: Buffer): string {
  return buffer.toString('utf8').replace(/\u0000/g, '').trim()
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
    if (buffer.length > MAX_BINARY_BYTES) {
      return { ok: false, reason: `Archivo binario excede ${MAX_BINARY_BYTES} bytes` }
    }

    let text = isBinaryDocumentMime(mimeType)
      ? await parseDocumentBuffer(mimeType, buffer)
      : decodePlainTextBuffer(buffer)

    if (text.length > MAX_TEXT_CHARS) {
      text = `${text.slice(0, MAX_TEXT_CHARS)}\n\n[… texto truncado para indexación …]`
    }

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
