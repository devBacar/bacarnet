import { isOfficeUploadMime } from '../drive/policy.js'
import { normalizeUploadMime } from '../drive/uploadMimePolicy.js'

const HELPDESK_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024

export function isHelpdeskDocumentMime(mimeType: string, fileName: string): boolean {
  const normalized = normalizeUploadMime(mimeType, fileName)
  if (normalized === 'application/pdf') return true
  return isOfficeUploadMime(normalized)
}

export function helpdeskDocumentMaxBytes(): number {
  return HELPDESK_DOCUMENT_MAX_BYTES
}
