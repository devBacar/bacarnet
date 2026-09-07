import { FieldValue, type DocumentSnapshot } from 'firebase-admin/firestore'
import type { AuthedUser } from '../auth/middleware.js'
import { isSuperAdminUser } from '../auth/middleware.js'
import { adminDb } from '../../lib/firebase/admin.js'
import { resolveAreaName } from '../notifications/buildContent.js'
import {
  APPROVAL_REQUEST_KINDS,
  APPROVAL_REQUEST_STATUSES,
  type AccessRequestRecord,
  type ApprovalRequestRecord,
  type ApprovalRequestStatus,
  type OfficeUploadRequestRecord,
} from './types.js'

export const APPROVAL_REQUESTS_COLLECTION = 'approvalRequests'

export function mapAccessRequestDoc(
  snap: DocumentSnapshot,
): (AccessRequestRecord & { id: string }) | null {
  if (!snap.exists) return null
  const data = snap.data()
  if (!data || data.kind !== APPROVAL_REQUEST_KINDS.ACCESS_REQUEST) return null
  return { id: snap.id, ...(data as AccessRequestRecord) }
}

export function mapOfficeUploadRequestDoc(
  snap: DocumentSnapshot,
): (OfficeUploadRequestRecord & { id: string }) | null {
  if (!snap.exists) return null
  const data = snap.data()
  if (!data || data.kind !== APPROVAL_REQUEST_KINDS.OFFICE_UPLOAD_REQUEST) return null
  return { id: snap.id, ...(data as OfficeUploadRequestRecord) }
}

export function mapApprovalRequestDoc(
  snap: DocumentSnapshot,
): (ApprovalRequestRecord & { id: string }) | null {
  return mapAccessRequestDoc(snap) ?? mapOfficeUploadRequestDoc(snap)
}

export async function findPendingAccessRequest(
  requesterUid: string,
  fileId: string,
): Promise<string | null> {
  const q = await adminDb()
    .collection(APPROVAL_REQUESTS_COLLECTION)
    .where('kind', '==', APPROVAL_REQUEST_KINDS.ACCESS_REQUEST)
    .where('requesterUid', '==', requesterUid)
    .where('fileId', '==', fileId)
    .where('status', '==', APPROVAL_REQUEST_STATUSES.PENDING)
    .limit(1)
    .get()
  return q.empty ? null : q.docs[0].id
}

export async function findPendingOfficeUploadRequest(
  requesterUid: string,
  parentFolderId: string,
  fileName: string,
): Promise<string | null> {
  const q = await adminDb()
    .collection(APPROVAL_REQUESTS_COLLECTION)
    .where('kind', '==', APPROVAL_REQUEST_KINDS.OFFICE_UPLOAD_REQUEST)
    .where('requesterUid', '==', requesterUid)
    .where('parentFolderId', '==', parentFolderId)
    .where('fileName', '==', fileName)
    .where('status', '==', APPROVAL_REQUEST_STATUSES.PENDING)
    .limit(1)
    .get()
  return q.empty ? null : q.docs[0].id
}

function governingAreaIdFromRequest(request: ApprovalRequestRecord): string | null {
  return request.governingAreaId ?? null
}

export function canResolveApprovalRequest(
  user: AuthedUser,
  request: ApprovalRequestRecord,
): boolean {
  if (isSuperAdminUser(user)) return true
  const areaId = governingAreaIdFromRequest(request)
  if (!areaId) return false
  return user.managedAreaIds.includes(areaId)
}

/** @deprecated usar canResolveApprovalRequest */
export function canResolveAccessRequest(
  user: AuthedUser,
  request: AccessRequestRecord,
): boolean {
  return canResolveApprovalRequest(user, request)
}

export async function updateAccessRequestStatus(
  requestId: string,
  status: ApprovalRequestStatus,
  resolver: AuthedUser,
  resolutionReason: string,
): Promise<void> {
  await updateApprovalRequestStatus(requestId, status, resolver, resolutionReason)
}

export async function updateApprovalRequestStatus(
  requestId: string,
  status: ApprovalRequestStatus,
  resolver: AuthedUser,
  resolutionReason: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  await adminDb()
    .collection(APPROVAL_REQUESTS_COLLECTION)
    .doc(requestId)
    .update({
      status,
      updatedAt: FieldValue.serverTimestamp(),
      resolvedAt: FieldValue.serverTimestamp(),
      resolvedByUid: resolver.uid,
      resolvedByEmail: resolver.email,
      resolutionReason: resolutionReason.trim(),
      ...extra,
    })
}

export async function enrichGoverningAreaName(
  governingAreaId: string | null,
): Promise<string | null> {
  if (!governingAreaId) return null
  return resolveAreaName(governingAreaId)
}
