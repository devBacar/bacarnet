import type { Timestamp } from 'firebase-admin/firestore'
import type { FileClassification } from '../drive/classification.js'
import type { PermissionRole } from '../drive/driveUserPermission.js'

export const APPROVAL_REQUEST_KINDS = {
  ACCESS_REQUEST: 'access_request',
  OFFICE_UPLOAD_REQUEST: 'office_upload_request',
} as const

export type ApprovalRequestKind =
  (typeof APPROVAL_REQUEST_KINDS)[keyof typeof APPROVAL_REQUEST_KINDS]

export const APPROVAL_REQUEST_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const

export type ApprovalRequestStatus =
  (typeof APPROVAL_REQUEST_STATUSES)[keyof typeof APPROVAL_REQUEST_STATUSES]

export type AccessRequestRecord = {
  kind: typeof APPROVAL_REQUEST_KINDS.ACCESS_REQUEST
  status: ApprovalRequestStatus
  requesterUid: string
  requesterEmail: string
  requesterDisplayName: string | null
  fileId: string
  fileName: string
  parentFolderId: string | null
  mimeType: string | null
  governingAreaId: string | null
  governingAreaName: string | null
  reason: string
  role: PermissionRole
  createdAt: Timestamp
  updatedAt: Timestamp
  resolvedAt?: Timestamp | null
  resolvedByUid?: string | null
  resolvedByEmail?: string | null
  resolutionReason?: string | null
}

export type OfficeUploadRequestRecord = {
  kind: typeof APPROVAL_REQUEST_KINDS.OFFICE_UPLOAD_REQUEST
  status: ApprovalRequestStatus
  requesterUid: string
  requesterEmail: string
  requesterDisplayName: string | null
  fileName: string
  mimeType: string
  fileSize: number
  parentFolderId: string
  parentFolderName: string | null
  classification: FileClassification
  governingAreaId: string | null
  governingAreaName: string | null
  reason: string
  stagingObjectPath: string
  createdAt: Timestamp
  updatedAt: Timestamp
  resolvedAt?: Timestamp | null
  resolvedByUid?: string | null
  resolvedByEmail?: string | null
  resolutionReason?: string | null
  driveFileId?: string | null
}

export type ApprovalRequestRecord = AccessRequestRecord | OfficeUploadRequestRecord
