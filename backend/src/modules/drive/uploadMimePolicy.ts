/** MIME admitidos para subida binaria (no instalador, no Office). */
export const BINARY_UPLOAD_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/mpeg',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-iso9660-image',
  'application/x-7z-compressed',
  'application/vnd.rar',
  'application/x-rar-compressed',
  'text/plain',
])

export const ARCHIVE_EXTENSIONS = ['.zip', '.iso', '.7z', '.rar'] as const

export function isArchiveFilename(fileName: string): boolean {
  const lower = fileName.trim().toLowerCase()
  return ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

const EXTENSION_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  zip: 'application/zip',
  iso: 'application/x-iso9660-image',
  '7z': 'application/x-7z-compressed',
  rar: 'application/vnd.rar',
  txt: 'text/plain',
}

/** Resuelve application/octet-stream u otros vacíos usando la extensión del archivo. */
export function normalizeUploadMime(mimeType: string, fileName: string): string {
  const mime = mimeType.trim().toLowerCase()
  if (mime && mime !== 'application/octet-stream') return mime
  const ext = fileName.trim().toLowerCase().split('.').pop() ?? ''
  return EXTENSION_MIME[ext] ?? (mime || 'application/octet-stream')
}

export function isAllowedBinaryUploadMime(mimeType: string): boolean {
  return BINARY_UPLOAD_MIMES.has(mimeType)
}
