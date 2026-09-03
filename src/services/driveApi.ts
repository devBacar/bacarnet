import { auth } from './firebase'

export type DriveClassification = 'USO_INTERNO' | 'CONFIDENCIAL' | 'RESTRINGIDO'
export type DriveApprovalStatus = 'BORRADOR' | 'APROBADO'

export interface DriveCreator {
  displayName: string | null
  email: string | null
  source: 'intranet' | 'last_modifying_user'
}

export interface DriveFileDto {
  id: string
  name: string
  mimeType: string
  parents: string[]
  modifiedTime: string | null
  createdTime: string | null
  size: string | null
  iconLink: string | null
  webViewLink: string | null
  isFolder: boolean
  capabilities: {
    canTrash: boolean
    canEdit: boolean
    canShare: boolean
    canAddChildren: boolean
  }
  classification: DriveClassification | null
  status: DriveApprovalStatus | null
  governingAreaId: string | null
  governingAreaName: string | null
  creator: DriveCreator
  ownerLabel: string
  /** Archivo visible en raíz por permiso directo (carpeta padre inaccesible). */
  directAccess?: boolean
}

export interface DriveFileDetailDto {
  id: string
  name: string
  mimeType: string
  webViewLink: string | null
  canEdit: boolean
}

export interface ListDriveFilesResult {
  folderId: string
  files: DriveFileDto[]
  nextPageToken: string | null
}

export type DriveCreateType = 'google_doc' | 'google_sheet' | 'folder'

export interface CreateDriveFileInput {
  name: string
  type: DriveCreateType
  parentFolderId: string
  classification?: DriveClassification
  reason: string
}

export interface UploadDriveFileInput {
  file: File
  parentFolderId: string
  classification: DriveClassification
  reason: string
}

export type DrivePermissionRole = 'reader' | 'writer' | 'commenter'

export interface DrivePermissionDto {
  id: string
  type: 'user'
  emailAddress: string
  displayName: string | null
  role: DrivePermissionRole
  driveRole: string
  inherited: boolean
}

export interface DriveDomainAccessDto {
  id: string
  role: DrivePermissionRole
  driveRole: string
  domain: string
  inherited: boolean
}

export interface DriveAreaMemberDto {
  uid: string
  email: string
  displayName: string | null
}

export interface ListDrivePermissionsResult {
  fileId: string
  fileName: string
  isFolder: boolean
  classification: DriveClassification
  governingAreaId: string | null
  governingAreaName: string | null
  areaMembers: DriveAreaMemberDto[]
  permissions: DrivePermissionDto[]
  domainAccess: DriveDomainAccessDto | null
}

export interface GrantDrivePermissionInput {
  email: string
  role: 'reader' | 'writer'
  reason: string
}

async function idToken(): Promise<string> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('No autenticado')
  return token
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await idToken()
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function parseApiResponse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
  return body
}

export async function listDriveFiles(
  folderId: string | null,
  pageToken?: string,
): Promise<ListDriveFilesResult> {
  const params = new URLSearchParams({ folderId: folderId ?? 'root' })
  if (pageToken) params.set('pageToken', pageToken)
  const res = await fetch(`/api/drive/files?${params}`, {
    headers: await authHeaders(),
  })
  return parseApiResponse<ListDriveFilesResult>(res)
}

export async function getDriveFile(fileId: string): Promise<DriveFileDetailDto> {
  const res = await fetch(`/api/drive/files/${encodeURIComponent(fileId)}`, {
    headers: await authHeaders(),
  })
  return parseApiResponse<DriveFileDetailDto>(res)
}

export async function createDriveFile(
  input: CreateDriveFileInput,
): Promise<DriveFileDto & { status?: DriveApprovalStatus | null }> {
  const body: Record<string, unknown> = {
    name: input.name,
    type: input.type,
    parentFolderId: input.parentFolderId,
    reason: input.reason,
  }
  if (input.type !== 'folder' && input.classification) {
    body.classification = input.classification
  }
  const res = await fetch('/api/drive/files', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  })
  return parseApiResponse<DriveFileDto & { status?: DriveApprovalStatus | null }>(res)
}

export async function uploadDriveFile(input: UploadDriveFileInput): Promise<void> {
  const form = new FormData()
  form.set('file', input.file)
  form.set('parentFolderId', input.parentFolderId)
  form.set('classification', input.classification)
  form.set('reason', input.reason)

  const res = await fetch('/api/drive/files/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await idToken()}` },
    body: form,
  })
  await parseApiResponse(res)
}

export async function trashDriveFile(fileId: string, reason?: string): Promise<void> {
  const res = await fetch(`/api/drive/files/${encodeURIComponent(fileId)}/trash`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(reason?.trim() ? { reason: reason.trim() } : {}),
  })
  await parseApiResponse<{ trashed: boolean }>(res)
}

export async function approveDriveFile(fileId: string, reason: string): Promise<void> {
  const res = await fetch(`/api/drive/files/${encodeURIComponent(fileId)}/status`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify({ status: 'APROBADO', reason }),
  })
  await parseApiResponse<{ status: DriveApprovalStatus }>(res)
}

export async function updateDriveClassification(
  fileId: string,
  classification: DriveClassification,
  reason: string,
): Promise<void> {
  const res = await fetch(`/api/drive/files/${encodeURIComponent(fileId)}/classification`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify({ classification, reason }),
  })
  await parseApiResponse(res)
}

export async function listDrivePermissions(fileId: string): Promise<ListDrivePermissionsResult> {
  const res = await fetch(`/api/drive/files/${encodeURIComponent(fileId)}/permissions`, {
    headers: await authHeaders(),
  })
  return parseApiResponse<ListDrivePermissionsResult>(res)
}

export async function grantDrivePermission(
  fileId: string,
  input: GrantDrivePermissionInput,
): Promise<{
  id: string
  type: 'user'
  role: DrivePermissionRole
  driveRole: string
  emailAddress: string | null
}> {
  const res = await fetch(`/api/drive/files/${encodeURIComponent(fileId)}/permissions`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      type: 'user',
      email: input.email.trim().toLowerCase(),
      role: input.role,
      reason: input.reason.trim(),
    }),
  })
  return parseApiResponse(res)
}

export async function grantDriveAreaPermission(
  fileId: string,
  input: { role: 'reader' | 'writer'; reason: string },
): Promise<{
  batchId: string
  governingAreaId: string
  areaName: string
  role: DrivePermissionRole
  grantedCount: number
  failedCount: number
  granted: Array<{ uid: string; email: string; permissionId: string }>
  failures: Array<{ uid: string; email: string; error: string }>
}> {
  const res = await fetch(`/api/drive/files/${encodeURIComponent(fileId)}/permissions/area`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      role: input.role,
      reason: input.reason.trim(),
    }),
  })
  return parseApiResponse(res)
}

export async function revokeDrivePermission(
  fileId: string,
  permissionId: string,
  reason: string,
): Promise<{ id: string; revoked: boolean }> {
  const res = await fetch(
    `/api/drive/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}/revoke`,
    {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ reason: reason.trim() }),
    },
  )
  return parseApiResponse(res)
}

