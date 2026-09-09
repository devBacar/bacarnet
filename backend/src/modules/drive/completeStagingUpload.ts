import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import {
  deletePendingFile,
  driveUploadStagingPath,
  pendingUploadsBucket,
} from '../../lib/google/pendingUploadsStorage.js'
import { commitDriveUpload } from './commitDriveUpload.js'
import { validateDriveUploadInput } from './uploadValidation.js'

export async function completeStagingUpload(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const body = req.body as Record<string, unknown> | null
  const uploadId = typeof body?.uploadId === 'string' ? body.uploadId.trim() : ''
  const objectPathRaw = typeof body?.objectPath === 'string' ? body.objectPath.trim() : ''
  const fileName = typeof body?.fileName === 'string' ? body.fileName : ''
  const mimeType =
    typeof body?.mimeType === 'string' && body.mimeType.trim()
      ? body.mimeType.trim()
      : 'application/octet-stream'
  const parentFolderId = typeof body?.parentFolderId === 'string' ? body.parentFolderId : ''
  const classification = typeof body?.classification === 'string' ? body.classification : ''
  const reason = typeof body?.reason === 'string' ? body.reason : ''

  if (!uploadId) {
    res.status(400).json({ error: 'uploadId es obligatorio' })
    return
  }

  const expectedPath = driveUploadStagingPath(uploadId, fileName)
  if (!objectPathRaw || objectPathRaw !== expectedPath) {
    res.status(400).json({ error: 'objectPath inválido para este uploadId' })
    return
  }

  const bucket = pendingUploadsBucket()
  const gcsFile = bucket.file(objectPathRaw)
  const [exists] = await gcsFile.exists()
  if (!exists) {
    res.status(404).json({
      error: 'No se encontró el archivo temporal. Volvé a intentar la subida.',
      code: 'staging_object_missing',
    })
    return
  }

  let metadataSize = 0
  try {
    const [metadata] = await gcsFile.getMetadata()
    metadataSize = Number(metadata.size ?? 0)
  } catch (err) {
    logError('completeStagingUpload metadata falló', err)
    res.status(500).json({ error: 'No se pudo leer el archivo temporal' })
    return
  }

  const validated = await validateDriveUploadInput({
    user,
    parentFolderIdRaw: parentFolderId,
    reasonRaw: reason,
    classificationRaw: classification,
    fileName,
    mimeType,
    fileSize: metadataSize,
  })

  if (!validated.ok) {
    res.status(validated.status).json({
      error: validated.error,
      ...(validated.code ? { code: validated.code } : {}),
    })
    return
  }

  const readStream = gcsFile.createReadStream()
  let cleaned = false
  const cleanup = async () => {
    if (cleaned) return
    cleaned = true
    await deletePendingFile(objectPathRaw)
  }

  readStream.on('error', (err) => {
    logError('completeStagingUpload stream read falló', err)
  })

  const committed = await commitDriveUpload({
    user,
    driveSubject: validated.value.driveSubject,
    parentFolderId: validated.value.parentFolderId,
    name: validated.value.name,
    mimeType: validated.value.mimeType,
    classification: validated.value.classification,
    governingAreaId: validated.value.governingAreaId,
    reason: validated.value.reason,
    mediaBody: readStream,
    sizeHint: metadataSize,
    uploadKind: 'staging',
  })

  await cleanup()

  if (!committed.ok) {
    res.status(committed.status).json({
      error: committed.error,
      ...(committed.detail ? { detail: committed.detail } : {}),
    })
    return
  }

  res.status(201).json(committed.body)
}
