import { sanitizeDriveId } from '../../lib/google/driveIds.js'

/** Acepta ID de Drive o URL típica de Google Drive. */
export function parseDriveFileId(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null

  const filePathMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (filePathMatch) return sanitizeDriveId(filePathMatch[1])

  const openIdMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (openIdMatch) return sanitizeDriveId(openIdMatch[1])

  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (folderMatch) return sanitizeDriveId(folderMatch[1])

  return sanitizeDriveId(trimmed)
}
