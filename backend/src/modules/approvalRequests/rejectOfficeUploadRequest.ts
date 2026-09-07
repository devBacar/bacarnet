import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { deletePendingFile } from '../../lib/google/pendingUploadsStorage.js'
import { getMinReasonLength } from '../drive/policy.js'
import { emitOfficeUploadRequestRejected } from '../notifications/emitOfficeUploadRequest.js'
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

export async function rejectOfficeUploadRequest(req: Request, res: Response): Promise<void> {
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
    res.status(403).json({ error: 'No tenés permiso para rechazar esta solicitud' })
    return
  }

  try {
    await deletePendingFile(request.stagingObjectPath)
  } catch (err) {
    logError('rejectOfficeUploadRequest: no se pudo borrar staging', err)
  }

  await updateApprovalRequestStatus(
    request.id,
    APPROVAL_REQUEST_STATUSES.REJECTED,
    user,
    reason,
  )

  void emitOfficeUploadRequestRejected(request, user)
  void resolveActionableNotificationBestEffort({
    recipientUid: user.uid,
    requestId: request.id,
    type: ACTIONABLE_NOTIFICATION_TYPES.OFFICE_UPLOAD_REQUEST,
    status: 'rejected',
    fileName: request.fileName,
  })

  res.status(200).json({
    id: request.id,
    status: APPROVAL_REQUEST_STATUSES.REJECTED,
  })
}
