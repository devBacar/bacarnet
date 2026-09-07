import { auth } from './firebase'

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired'

export type CreateAccessRequestInput = {
  fileId?: string
  driveLink?: string
  role?: 'reader' | 'commenter' | 'writer'
  reason: string
}

export type CreateAccessRequestResult = {
  id: string
  status: AccessRequestStatus
  fileId: string
  fileName: string
  governingAreaId: string | null
  governingAreaName: string | null
}

async function idToken(): Promise<string> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('No autenticado')
  return token
}

async function authHeaders(): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${await idToken()}`,
    'Content-Type': 'application/json',
  }
}

async function parseApiResponse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & {
    error?: string
    status?: AccessRequestStatus
  }
  if (!res.ok) {
    const err = new Error(body.error ?? `Error ${res.status}`) as Error & {
      requestStatus?: AccessRequestStatus
    }
    if (res.status === 409 && body.status) {
      err.requestStatus = body.status
    }
    throw err
  }
  return body
}

export async function getOfficeUploadStagingPreview(requestId: string): Promise<{
  requestId: string
  fileName: string
  mimeType: string
  previewUrl: string
}> {
  const res = await fetch(
    `/api/approval-requests/${encodeURIComponent(requestId)}/staging-preview`,
    { headers: await authHeaders() },
  )
  return parseApiResponse(res)
}

export async function createAccessRequest(
  input: CreateAccessRequestInput,
): Promise<CreateAccessRequestResult> {
  const body: Record<string, string> = { reason: input.reason.trim() }
  if (input.fileId?.trim()) body.fileId = input.fileId.trim()
  if (input.driveLink?.trim()) body.driveLink = input.driveLink.trim()
  if (input.role) body.role = input.role

  const res = await fetch('/api/approval-requests/access', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  })
  return parseApiResponse<CreateAccessRequestResult>(res)
}

export async function approveAccessRequest(
  requestId: string,
  reason: string,
): Promise<{ id: string; status: AccessRequestStatus }> {
  const res = await fetch(`/api/approval-requests/${encodeURIComponent(requestId)}/approve`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ reason: reason.trim() }),
  })
  return parseApiResponse(res)
}

export async function rejectAccessRequest(
  requestId: string,
  reason: string,
): Promise<{ id: string; status: AccessRequestStatus }> {
  const res = await fetch(`/api/approval-requests/${encodeURIComponent(requestId)}/reject`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ reason: reason.trim() }),
  })
  return parseApiResponse(res)
}

export type CreateOfficeUploadRequestInput = {
  file: File
  parentFolderId: string
  classification: string
  reason: string
}

export type CreateOfficeUploadRequestResult = {
  id: string
  status: AccessRequestStatus
  fileName: string
  mimeType: string
  parentFolderId: string
  parentFolderName: string | null
  governingAreaId: string | null
  governingAreaName: string | null
}

const OFFICE_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
])

export function isOfficeUploadFile(file: File): boolean {
  if (OFFICE_MIMES.has(file.type)) return true
  return /\.(docx?|xlsx?|pptx?)$/i.test(file.name)
}

export async function createOfficeUploadRequest(
  input: CreateOfficeUploadRequestInput,
): Promise<CreateOfficeUploadRequestResult> {
  const form = new FormData()
  form.set('file', input.file)
  form.set('parentFolderId', input.parentFolderId)
  form.set('classification', input.classification)
  form.set('reason', input.reason.trim())

  const res = await fetch('/api/approval-requests/office-upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await idToken()}` },
    body: form,
  })
  return parseApiResponse<CreateOfficeUploadRequestResult>(res)
}

/** Extrae ID de Drive desde URL o ID directo. */
export function parseDriveFileInput(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (fileMatch) return fileMatch[1]

  const openMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (openMatch) return openMatch[1]

  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (folderMatch) return folderMatch[1]

  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed
  return null
}
