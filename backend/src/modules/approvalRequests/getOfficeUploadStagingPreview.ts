import { FieldValue } from 'firebase-admin/firestore'
import type { Request, Response } from 'express'
import { adminDb } from '../../lib/firebase/admin.js'
import { canResolveApprovalRequest } from './shared.js'
import {
  buildStagingContentUrl,
  createStagingPreviewNonce,
} from './stagingPreviewToken.js'
import { APPROVAL_REQUEST_KINDS, APPROVAL_REQUEST_STATUSES, type OfficeUploadRequestRecord } from './types.js'

function publicAppBaseUrl(req: Request): string {
  const configured = process.env.PUBLIC_APP_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  const forwardedHost = req.get('x-forwarded-host')
  const host = forwardedHost ?? req.get('host')
  const proto = req.get('x-forwarded-proto') ?? req.protocol
  return `${proto}://${host}`
}

export async function getOfficeUploadStagingPreview(req: Request, res: Response): Promise<void> {
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

  const snap = await adminDb().collection('approvalRequests').doc(requestId).get()
  if (!snap.exists) {
    res.status(404).json({ error: 'Solicitud no encontrada' })
    return
  }

  const request = snap.data() as OfficeUploadRequestRecord
  if (request.kind !== APPROVAL_REQUEST_KINDS.OFFICE_UPLOAD_REQUEST) {
    res.status(400).json({ error: 'No es una solicitud de subida Office' })
    return
  }

  if (request.status !== APPROVAL_REQUEST_STATUSES.PENDING) {
    res.status(409).json({ error: 'La solicitud ya fue resuelta' })
    return
  }

  if (!canResolveApprovalRequest(user, request)) {
    res.status(403).json({ error: 'No tenés permiso para ver esta vista previa' })
    return
  }

  const previewNonce = createStagingPreviewNonce()
  await adminDb().collection('approvalRequests').doc(requestId).update({
    stagingPreviewNonce: previewNonce,
    stagingPreviewIssuedAt: FieldValue.serverTimestamp(),
  })

  const previewUrl = buildStagingContentUrl(requestId, publicAppBaseUrl(req), previewNonce)
  res.json({
    requestId,
    fileName: request.fileName,
    mimeType: request.mimeType,
    previewUrl,
  })
}
