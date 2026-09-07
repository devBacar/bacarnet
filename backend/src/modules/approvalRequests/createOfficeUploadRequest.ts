import type { Request, Response } from 'express'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'
import { uploadPendingFile } from '../../lib/google/pendingUploadsStorage.js'
import { getFileInSharedDrive } from '../drive/assertInSharedDrive.js'
import { parseClassificationInput } from '../drive/classification.js'
import { resolveFileGoverningAreaId } from '../drive/governDriveFile.js'
import { resolveDriveSubject } from '../drive/driveSubject.js'
import { getMinReasonLength, isOfficeUploadMime } from '../drive/policy.js'
import { parseMultipartUpload } from '../drive/parseMultipartUpload.js'
import { emitOfficeUploadRequestCreatedBestEffort } from '../notifications/emitOfficeUploadRequest.js'
import { sanitizeDriveId } from '../../lib/google/driveIds.js'
import {
  APPROVAL_REQUESTS_COLLECTION,
  enrichGoverningAreaName,
  findPendingOfficeUploadRequest,
} from './shared.js'
import {
  APPROVAL_REQUEST_KINDS,
  APPROVAL_REQUEST_STATUSES,
  type OfficeUploadRequestRecord,
} from './types.js'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

export async function createOfficeUploadRequest(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  let parsed
  try {
    parsed = await parseMultipartUpload(req)
  } catch (err) {
    if (err instanceof Error && err.message === 'UPLOAD_TOO_LARGE') {
      res.status(413).json({ error: 'El archivo supera el límite de 25 MB' })
      return
    }
    res.status(400).json({ error: 'No se pudo leer la carga multipart' })
    return
  }

  const uploadedFile = parsed.file
  const fields = parsed.fields
  if (!uploadedFile) {
    res.status(400).json({ error: 'file es obligatorio' })
    return
  }

  if (!isOfficeUploadMime(uploadedFile.mimetype)) {
    res.status(400).json({
      error: 'Solo se pueden solicitar archivos Word, Excel o PowerPoint por este flujo',
    })
    return
  }

  const parentFolderId = sanitizeDriveId(fields.parentFolderId ?? '')
  if (!parentFolderId) {
    res.status(400).json({ error: 'parentFolderId inválido' })
    return
  }

  const reason = fields.reason?.trim() ?? ''
  const minReason = await getMinReasonLength()
  if (reason.length < minReason) {
    res.status(400).json({ error: `reason debe tener al menos ${minReason} caracteres` })
    return
  }

  const parsedClassification = parseClassificationInput(fields.classification)
  if (!parsedClassification.ok) {
    res.status(400).json({ error: parsedClassification.error })
    return
  }

  const driveSubject = resolveDriveSubject(user)
  const parent = await getFileInSharedDrive(parentFolderId, driveSubject)
  if (!parent.ok) {
    res.status(parent.status).json({ error: parent.error })
    return
  }
  if (parent.file.trashed) {
    res.status(400).json({ error: 'La carpeta destino está en la papelera' })
    return
  }
  if (parent.file.mimeType !== FOLDER_MIME) {
    res.status(400).json({ error: 'parentFolderId no es una carpeta' })
    return
  }

  const fileName =
    fields.name?.trim() ||
    uploadedFile.originalname.trim() ||
    'archivo-office'

  const pendingId = await findPendingOfficeUploadRequest(user.uid, parentFolderId, fileName)
  if (pendingId) {
    res.status(409).json({
      error: 'Ya tenés una solicitud pendiente para este archivo en esta carpeta',
      requestId: pendingId,
    })
    return
  }

  const governingAreaId = await resolveFileGoverningAreaId(parentFolderId, parentFolderId)
  const governingAreaName = await enrichGoverningAreaName(governingAreaId)

  const docRef = adminDb().collection(APPROVAL_REQUESTS_COLLECTION).doc()
  let stagingObjectPath: string
  try {
    stagingObjectPath = await uploadPendingFile(
      docRef.id,
      fileName,
      uploadedFile.mimetype,
      uploadedFile.buffer,
    )
  } catch (err) {
    logError('createOfficeUploadRequest: falló staging GCS', err)
    res.status(502).json({ error: 'No se pudo guardar el archivo pendiente de aprobación' })
    return
  }

  const now = FieldValue.serverTimestamp()
  const record = {
    kind: APPROVAL_REQUEST_KINDS.OFFICE_UPLOAD_REQUEST,
    status: APPROVAL_REQUEST_STATUSES.PENDING,
    requesterUid: user.uid,
    requesterEmail: user.email,
    requesterDisplayName: user.displayName?.trim() || null,
    fileName: fileName.slice(0, 255),
    mimeType: uploadedFile.mimetype,
    fileSize: uploadedFile.size,
    parentFolderId,
    parentFolderName: parent.file.name ?? null,
    classification: parsedClassification.classification,
    governingAreaId,
    governingAreaName,
    reason: reason.trim(),
    stagingObjectPath,
    createdAt: now,
    updatedAt: now,
  }

  try {
    await docRef.set(record)
  } catch (err) {
    logError('createOfficeUploadRequest: falló Firestore', err)
    res.status(502).json({ error: 'No se pudo registrar la solicitud' })
    return
  }

  const emitPayload = {
    id: docRef.id,
    ...(record as Omit<OfficeUploadRequestRecord, 'createdAt' | 'updatedAt'>),
    createdAt: null as unknown as OfficeUploadRequestRecord['createdAt'],
    updatedAt: null as unknown as OfficeUploadRequestRecord['updatedAt'],
  }
  void emitOfficeUploadRequestCreatedBestEffort(emitPayload, user)

  res.status(201).json({
    id: docRef.id,
    status: APPROVAL_REQUEST_STATUSES.PENDING,
    fileName: record.fileName,
    mimeType: record.mimeType,
    parentFolderId,
    parentFolderName: record.parentFolderName,
    governingAreaId,
    governingAreaName,
  })
}
