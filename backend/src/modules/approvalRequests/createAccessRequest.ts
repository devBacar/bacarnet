import type { Request, Response } from 'express'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'
import { getFileInSharedDrive } from '../drive/assertInSharedDrive.js'
import { getDrive } from '../../lib/google/driveClient.js'
import { findUserPermission, isPermissionRole } from '../drive/driveUserPermission.js'
import {
  driveRoleToApiRole,
  isPermissionUpgrade,
} from '../drive/permissionRoleUtils.js'
import { resolveFileGoverningAreaId } from '../drive/governDriveFile.js'
import { resolveDriveSubject } from '../drive/driveSubject.js'
import { getMinReasonLength } from '../drive/policy.js'
import { emitAccessRequestCreatedBestEffort } from '../notifications/emitAccessRequest.js'
import { parseDriveFileId } from './parseDriveInput.js'
import {
  APPROVAL_REQUESTS_COLLECTION,
  enrichGoverningAreaName,
  findPendingAccessRequest,
} from './shared.js'
import { APPROVAL_REQUEST_KINDS, APPROVAL_REQUEST_STATUSES, type AccessRequestRecord } from './types.js'

export async function createAccessRequest(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const body = req.body as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Body inválido' })
    return
  }

  const reason = typeof body.reason === 'string' ? body.reason : ''
  const minReason = await getMinReasonLength()
  if (reason.trim().length < minReason) {
    res.status(400).json({ error: `reason debe tener al menos ${minReason} caracteres` })
    return
  }

  const rawInput =
    typeof body.fileId === 'string' && body.fileId.trim()
      ? body.fileId
      : typeof body.driveLink === 'string'
        ? body.driveLink
        : ''
  const fileId = parseDriveFileId(rawInput)
  if (!fileId) {
    res.status(400).json({ error: 'fileId o enlace de Drive inválido' })
    return
  }

  const found = await getFileInSharedDrive(fileId)
  if (!found.ok) {
    res.status(found.status).json({ error: found.error })
    return
  }
  if (found.file.trashed) {
    res.status(409).json({ error: 'El archivo está en la papelera' })
    return
  }

  const asRequester = await getFileInSharedDrive(fileId, resolveDriveSubject(user))
  if (!asRequester.ok) {
    res.status(403).json({ error: 'No tenés acceso a este archivo' })
    return
  }

  let requestedRole: import('../drive/driveUserPermission.js').PermissionRole = 'reader'
  if (body.role !== undefined) {
    if (!isPermissionRole(body.role)) {
      res.status(400).json({ error: "role debe ser 'reader', 'writer' o 'commenter'" })
      return
    }
    requestedRole = body.role
  }

  const drive = await getDrive(resolveDriveSubject(user))
  const existingPermission = await findUserPermission(drive, fileId, user.email)
  const currentRole = existingPermission
    ? driveRoleToApiRole(existingPermission.role)
    : 'reader'

  if (!isPermissionUpgrade(currentRole, requestedRole)) {
    res.status(409).json({
      error: 'Ya tenés este rol o uno superior sobre este archivo',
      currentRole,
      requestedRole,
    })
    return
  }

  const pendingId = await findPendingAccessRequest(user.uid, fileId)
  if (pendingId) {
    res.status(409).json({
      error: 'Ya tenés una solicitud pendiente para este archivo',
      requestId: pendingId,
    })
    return
  }

  const governingAreaId = await resolveFileGoverningAreaId(fileId, found.file.parentFolderId)
  const governingAreaName = await enrichGoverningAreaName(governingAreaId)

  const docRef = adminDb().collection(APPROVAL_REQUESTS_COLLECTION).doc()
  const now = FieldValue.serverTimestamp()
  const record = {
    kind: APPROVAL_REQUEST_KINDS.ACCESS_REQUEST,
    status: APPROVAL_REQUEST_STATUSES.PENDING,
    requesterUid: user.uid,
    requesterEmail: user.email,
    requesterDisplayName: user.displayName?.trim() || null,
    fileId,
    fileName: found.file.name,
    parentFolderId: found.file.parentFolderId,
    mimeType: found.file.mimeType,
    governingAreaId,
    governingAreaName,
    reason: reason.trim(),
    role: requestedRole,
    createdAt: now,
    updatedAt: now,
  }

  await docRef.set(record)

  const emitPayload = {
    id: docRef.id,
    kind: APPROVAL_REQUEST_KINDS.ACCESS_REQUEST,
    status: APPROVAL_REQUEST_STATUSES.PENDING,
    requesterUid: user.uid,
    requesterEmail: user.email,
    requesterDisplayName: user.displayName?.trim() || null,
    fileId,
    fileName: found.file.name,
    parentFolderId: found.file.parentFolderId,
    mimeType: found.file.mimeType,
    governingAreaId,
    governingAreaName,
    reason: reason.trim(),
    role: requestedRole,
    createdAt: null as unknown as AccessRequestRecord['createdAt'],
    updatedAt: null as unknown as AccessRequestRecord['updatedAt'],
  }
  void emitAccessRequestCreatedBestEffort(emitPayload, user)

  res.status(201).json({
    id: docRef.id,
    status: APPROVAL_REQUEST_STATUSES.PENDING,
    fileId,
    fileName: found.file.name,
    governingAreaId,
    governingAreaName,
  })
}
