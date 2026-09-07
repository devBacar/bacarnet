import type { Request, Response } from 'express'
import { getDrive } from '../../lib/google/driveClient.js'
import { logError } from '../../lib/log.js'
import { writeAuditLogBestEffort } from '../audit/writeAuditLog.js'
import { getFileInSharedDrive, googleUserMessage } from '../drive/assertInSharedDrive.js'
import {
  DrivePermissionAlreadyInheritedError,
  grantUserDrivePermission,
} from '../drive/driveUserPermission.js'
import { invalidateDriveMetadataForEmail, invalidateDriveMetadataForUser } from '../drive/driveMetadataCache.js'
import { canPerformGovernanceAction, governanceForbiddenMessage, resolveFileGoverningAreaId } from '../drive/governDriveFile.js'
import { getStoredClassification, permissionCreateDeniedReason } from '../drive/classification.js'
import { resolveDriveSubject } from '../drive/driveSubject.js'
import { getMinReasonLength } from '../drive/policy.js'
import {
  emitAccessRequestApproved,
} from '../notifications/emitAccessRequest.js'
import { resolveActionableNotificationBestEffort } from '../notifications/resolveActionableNotification.js'
import { ACTIONABLE_NOTIFICATION_TYPES } from '../notifications/types.js'
import { approveOfficeUploadRequest } from './approveOfficeUploadRequest.js'
import {
  APPROVAL_REQUESTS_COLLECTION,
  canResolveAccessRequest,
  mapAccessRequestDoc,
  updateAccessRequestStatus,
} from './shared.js'
import { APPROVAL_REQUEST_KINDS, APPROVAL_REQUEST_STATUSES } from './types.js'
import { adminDb } from '../../lib/firebase/admin.js'

export async function approveAccessRequest(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const requestId = String(req.params.requestId ?? '').trim()
  if (!requestId) {
    res.status(400).json({ error: 'requestId inválido' })
    return
  }

  const snap = await adminDb().collection(APPROVAL_REQUESTS_COLLECTION).doc(requestId).get()
  if (snap.exists && snap.get('kind') === APPROVAL_REQUEST_KINDS.OFFICE_UPLOAD_REQUEST) {
    return approveOfficeUploadRequest(req, res)
  }

  const body = req.body as Record<string, unknown> | null
  const reason = typeof body?.reason === 'string' ? body.reason : ''
  const minReason = await getMinReasonLength()
  if (reason.trim().length < minReason) {
    res.status(400).json({ error: `reason debe tener al menos ${minReason} caracteres` })
    return
  }

  const request = mapAccessRequestDoc(snap)
  if (!request) {
    res.status(404).json({ error: 'Solicitud no encontrada' })
    return
  }
  if (request.status !== APPROVAL_REQUEST_STATUSES.PENDING) {
    res.status(409).json({ error: 'La solicitud ya fue resuelta', status: request.status })
    return
  }
  if (!canResolveAccessRequest(user, request)) {
    res.status(403).json({ error: 'No tenés permiso para aprobar esta solicitud' })
    return
  }

  const governingAreaId =
    request.governingAreaId ??
    (await resolveFileGoverningAreaId(request.fileId, request.parentFolderId))
  if (!canPerformGovernanceAction(user, 'permission_grant', governingAreaId)) {
    res.status(403).json({ error: governanceForbiddenMessage('permission_grant') })
    return
  }

  const found = await getFileInSharedDrive(request.fileId)
  if (!found.ok) {
    res.status(found.status).json({ error: found.error })
    return
  }
  if (found.file.trashed) {
    res.status(409).json({ error: 'El archivo está en la papelera' })
    return
  }

  const classification = await getStoredClassification(request.fileId)
  const denied = permissionCreateDeniedReason(classification, 'user')
  if (denied) {
    res.status(403).json({ error: denied, classification })
    return
  }

  try {
    const drive = await getDrive()
    const result = await grantUserDrivePermission(
      drive,
      request.fileId,
      request.requesterEmail,
      request.role,
      { sendNotificationEmail: true },
    )

    await writeAuditLogBestEffort({
      userId: user.uid,
      userEmail: user.email,
      action: 'permission_grant',
      targetType: 'file',
      targetId: request.fileId,
      targetName: request.fileName,
      parentFolderId: request.parentFolderId,
      mimeType: request.mimeType,
      reason: reason.trim(),
      metadata: {
        granteeEmail: request.requesterEmail,
        granteeUid: request.requesterUid,
        role: request.role,
        driveRole: result.driveRole,
        permissionId: result.permissionId,
        type: 'user',
        domain: null,
        approvalRequestId: request.id,
      },
    })

    await updateAccessRequestStatus(
      request.id,
      APPROVAL_REQUEST_STATUSES.APPROVED,
      user,
      reason,
    )

    invalidateDriveMetadataForUser(resolveDriveSubject(user), user.uid)
    await invalidateDriveMetadataForEmail(request.requesterEmail)

    void emitAccessRequestApproved(request, user)
    void resolveActionableNotificationBestEffort({
      recipientUid: user.uid,
      requestId: request.id,
      type: ACTIONABLE_NOTIFICATION_TYPES.ACCESS_REQUEST,
      status: 'approved',
      fileName: request.fileName,
    })

    res.status(200).json({
      id: request.id,
      status: APPROVAL_REQUEST_STATUSES.APPROVED,
      permissionId: result.permissionId,
      fileId: request.fileId,
    })
  } catch (err) {
    if (err instanceof DrivePermissionAlreadyInheritedError) {
      await updateAccessRequestStatus(
        request.id,
        APPROVAL_REQUEST_STATUSES.APPROVED,
        user,
        `${reason.trim()} (acceso ya heredado)`,
      )
      void emitAccessRequestApproved(request, user)
      void resolveActionableNotificationBestEffort({
        recipientUid: user.uid,
        requestId: request.id,
        type: ACTIONABLE_NOTIFICATION_TYPES.ACCESS_REQUEST,
        status: 'approved',
        fileName: request.fileName,
      })
      res.status(200).json({
        id: request.id,
        status: APPROVAL_REQUEST_STATUSES.APPROVED,
        inherited: true,
        fileId: request.fileId,
      })
      return
    }
    logError('approveAccessRequest: falló grant', err)
    const detail = googleUserMessage(err)
    res.status(502).json({
      error: 'No se pudo otorgar el permiso',
      ...(detail ? { detail } : {}),
    })
  }
}
