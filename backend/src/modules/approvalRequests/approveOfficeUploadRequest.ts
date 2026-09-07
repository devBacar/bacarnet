import type { Request, Response } from 'express'
import { Readable } from 'node:stream'
import { getDrive } from '../../lib/google/driveClient.js'
import { logError } from '../../lib/log.js'
import {
  deletePendingFile,
  downloadPendingFile,
} from '../../lib/google/pendingUploadsStorage.js'
import { writeAuditLogBestEffort } from '../audit/writeAuditLog.js'
import { getFileInSharedDrive, googleStatus, googleUserMessage } from '../drive/assertInSharedDrive.js'
import {
  writeFileClassificationBestEffort,
} from '../drive/classification.js'
import { invalidateDriveMetadataForUser } from '../drive/driveMetadataCache.js'
import {
  canPerformGovernanceAction,
  governanceForbiddenMessage,
} from '../drive/governDriveFile.js'
import { resolveDriveSubject } from '../drive/driveSubject.js'
import { getMinReasonLength } from '../drive/policy.js'
import { emitOfficeUploadRequestApproved } from '../notifications/emitOfficeUploadRequest.js'
import { resolveActionableNotificationBestEffort } from '../notifications/resolveActionableNotification.js'
import { ACTIONABLE_NOTIFICATION_TYPES } from '../notifications/types.js'
import {
  canResolveApprovalRequest,
  mapOfficeUploadRequestDoc,
  updateApprovalRequestStatus,
  APPROVAL_REQUESTS_COLLECTION,
} from './shared.js'
import { APPROVAL_REQUEST_STATUSES } from './types.js'
import { adminDb } from '../../lib/firebase/admin.js'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

export async function approveOfficeUploadRequest(req: Request, res: Response): Promise<void> {
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

  const body = req.body as Record<string, unknown> | null
  const reason = typeof body?.reason === 'string' ? body.reason : ''
  const minReason = await getMinReasonLength()
  if (reason.trim().length < minReason) {
    res.status(400).json({ error: `reason debe tener al menos ${minReason} caracteres` })
    return
  }

  const snap = await adminDb().collection(APPROVAL_REQUESTS_COLLECTION).doc(requestId).get()
  const request = mapOfficeUploadRequestDoc(snap)
  if (!request) {
    res.status(404).json({ error: 'Solicitud no encontrada' })
    return
  }
  if (request.status !== APPROVAL_REQUEST_STATUSES.PENDING) {
    res.status(409).json({ error: 'La solicitud ya fue resuelta', status: request.status })
    return
  }
  if (!canResolveApprovalRequest(user, request)) {
    res.status(403).json({ error: 'No tenés permiso para aprobar esta solicitud' })
    return
  }

  if (
    !canPerformGovernanceAction(user, 'approval', request.governingAreaId)
  ) {
    res.status(403).json({ error: governanceForbiddenMessage('approval') })
    return
  }

  const parent = await getFileInSharedDrive(request.parentFolderId, resolveDriveSubject(user))
  if (!parent.ok) {
    res.status(parent.status).json({ error: parent.error })
    return
  }
  if (parent.file.trashed) {
    res.status(409).json({ error: 'La carpeta destino está en la papelera' })
    return
  }
  if (parent.file.mimeType !== FOLDER_MIME) {
    res.status(409).json({ error: 'La carpeta destino ya no es válida' })
    return
  }

  let buffer: Buffer
  try {
    buffer = await downloadPendingFile(request.stagingObjectPath)
  } catch (err) {
    logError('approveOfficeUploadRequest: staging no encontrado', err)
    res.status(410).json({ error: 'El archivo pendiente ya no está disponible (expiró o fue eliminado)' })
    return
  }

  const combinedReason = [
    `Solicitud: ${request.reason.trim()}`,
    `Aprobación: ${reason.trim()}`,
  ].join(' · ')

  try {
    const drive = await getDrive(resolveDriveSubject(user))
    const created = await drive.files.create({
      requestBody: {
        name: request.fileName.slice(0, 255),
        mimeType: request.mimeType,
        parents: [request.parentFolderId],
      },
      media: {
        mimeType: request.mimeType,
        body: Readable.from(buffer),
      },
      fields: 'id, name, mimeType, webViewLink, parents, modifiedTime, createdTime, size',
      supportsAllDrives: true,
    })

    const fileId = created.data.id ?? ''
    await writeFileClassificationBestEffort(
      fileId,
      request.classification,
      { uid: request.requesterUid, email: request.requesterEmail },
      {
        status: 'BORRADOR',
        governingAreaId: request.governingAreaId,
        createdByUserId: request.requesterUid,
        createdByEmail: request.requesterEmail,
        createdByDisplayName: request.requesterDisplayName ?? undefined,
      },
    )

    await writeAuditLogBestEffort({
      userId: user.uid,
      userEmail: user.email,
      action: 'create',
      targetType: 'file',
      targetId: fileId,
      targetName: created.data.name ?? request.fileName,
      parentFolderId: request.parentFolderId,
      mimeType: created.data.mimeType ?? request.mimeType,
      reason: combinedReason,
      metadata: {
        type: 'upload',
        classification: request.classification,
        status: 'BORRADOR',
        governingAreaId: request.governingAreaId,
        size: created.data.size ?? String(request.fileSize),
        approvalRequestId: request.id,
        requesterEmail: request.requesterEmail,
        requesterUid: request.requesterUid,
        officeUploadApproved: true,
      },
    })

    await updateApprovalRequestStatus(
      request.id,
      APPROVAL_REQUEST_STATUSES.APPROVED,
      user,
      reason,
      { driveFileId: fileId },
    )

    await deletePendingFile(request.stagingObjectPath)
    invalidateDriveMetadataForUser(resolveDriveSubject(user), user.uid)

    void emitOfficeUploadRequestApproved(request, user, fileId)
    void resolveActionableNotificationBestEffort({
      recipientUid: user.uid,
      requestId: request.id,
      type: ACTIONABLE_NOTIFICATION_TYPES.OFFICE_UPLOAD_REQUEST,
      status: 'approved',
      fileName: request.fileName,
    })

    res.status(200).json({
      id: request.id,
      status: APPROVAL_REQUEST_STATUSES.APPROVED,
      fileId,
      fileName: created.data.name ?? request.fileName,
    })
  } catch (err) {
    logError('approveOfficeUploadRequest: falló upload a Drive', err)
    const status = googleStatus(err)
    const detail = googleUserMessage(err)
    res.status(status === 403 || status === 404 ? status : 502).json({
      error: 'No se pudo subir el archivo a Drive',
      ...(detail ? { detail } : {}),
    })
  }
}
