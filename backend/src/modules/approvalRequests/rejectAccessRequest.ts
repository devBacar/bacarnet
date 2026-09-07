import type { Request, Response } from 'express'
import { adminDb } from '../../lib/firebase/admin.js'
import { getMinReasonLength } from '../drive/policy.js'
import { emitAccessRequestRejected } from '../notifications/emitAccessRequest.js'
import { resolveActionableNotificationBestEffort } from '../notifications/resolveActionableNotification.js'
import { ACTIONABLE_NOTIFICATION_TYPES } from '../notifications/types.js'
import { rejectOfficeUploadRequest } from './rejectOfficeUploadRequest.js'
import {
  APPROVAL_REQUESTS_COLLECTION,
  canResolveAccessRequest,
  mapAccessRequestDoc,
  updateAccessRequestStatus,
} from './shared.js'
import { APPROVAL_REQUEST_KINDS, APPROVAL_REQUEST_STATUSES } from './types.js'

export async function rejectAccessRequest(req: Request, res: Response): Promise<void> {
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
    return rejectOfficeUploadRequest(req, res)
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
    res.status(403).json({ error: 'No tenés permiso para rechazar esta solicitud' })
    return
  }

  await updateAccessRequestStatus(
    request.id,
    APPROVAL_REQUEST_STATUSES.REJECTED,
    user,
    reason,
  )

  void emitAccessRequestRejected(request, user)
  void resolveActionableNotificationBestEffort({
    recipientUid: user.uid,
    requestId: request.id,
    type: ACTIONABLE_NOTIFICATION_TYPES.ACCESS_REQUEST,
    status: 'rejected',
    fileName: request.fileName,
  })

  res.status(200).json({
    id: request.id,
    status: APPROVAL_REQUEST_STATUSES.REJECTED,
  })
}
