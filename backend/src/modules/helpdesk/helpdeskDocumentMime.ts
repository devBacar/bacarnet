import { isOfficeUploadMime } from '../drive/policy.js'
import { normalizeUploadMime } from '../drive/uploadMimePolicy.js'

const HELPDESK_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024

const HELPDESK_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

export function isHelpdeskDocumentMime(mimeType: string, fileName: string): boolean {
  const normalized = normalizeUploadMime(mimeType, fileName)
  if (normalized === 'application/pdf') return true
  if (HELPDESK_IMAGE_MIMES.has(normalized)) return true
  return isOfficeUploadMime(normalized)
}

export function helpdeskDocumentMaxBytes(): number {
  return HELPDESK_DOCUMENT_MAX_BYTES
}
