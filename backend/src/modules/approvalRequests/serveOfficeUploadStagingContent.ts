import type { Request, Response } from 'express'
import { adminDb } from '../../lib/firebase/admin.js'
import { downloadPendingFile } from '../../lib/google/pendingUploadsStorage.js'
import {
  APPROVAL_REQUEST_KINDS,
  APPROVAL_REQUEST_STATUSES,
  type OfficeUploadRequestRecord,
} from './types.js'
import { verifyStagingPreviewToken } from './stagingPreviewToken.js'

/** Office Online fetchea el archivo desde el navegador (iframe); requiere CORS abierto (el token protege el acceso). */
function setStagingContentCors(res: Response): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Content-Disposition')
}

export function handleOfficeUploadStagingContentPreflight(_req: Request, res: Response): void {
  setStagingContentCors(res)
  res.status(204).end()
}

/** Sirve el archivo staging sin auth Bearer — Microsoft Office Online lo fetchea vía token en query. */
export async function serveOfficeUploadStagingContent(req: Request, res: Response): Promise<void> {
  setStagingContentCors(res)

  const requestId = String(req.params.requestId ?? '').trim()
  const token = typeof req.query.t === 'string' ? req.query.t : ''

  const snap = await adminDb().collection('approvalRequests').doc(requestId).get()
  if (!snap.exists) {
    res.status(404).json({ error: 'Solicitud no encontrada' })
    return
  }

  const expectedNonce =
    typeof snap.get('stagingPreviewNonce') === 'string' ? snap.get('stagingPreviewNonce') : null

  if (!requestId || !verifyStagingPreviewToken(requestId, token, expectedNonce)) {
    res.status(403).json({ error: 'Enlace de vista previa inválido o expirado' })
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

  try {
    const buffer = await downloadPendingFile(request.stagingObjectPath)
    const safeName = request.fileName.replace(/[^\w.\-()+ ]/g, '_')
    res.setHeader('Content-Type', request.mimeType)
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`)
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.send(buffer)
  } catch {
    res.status(404).json({ error: 'Archivo de staging no encontrado' })
  }
}
