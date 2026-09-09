import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import {
  createSignedStagingWriteUrl,
  driveUploadStagingPath,
  newDriveUploadId,
} from '../../lib/google/pendingUploadsStorage.js'
import { validateDriveUploadInput } from './uploadValidation.js'
import { isInstallerFilename } from './installerUploadPolicy.js'
import { isArchiveFilename } from './uploadMimePolicy.js'
import {
  STAGING_UPLOAD_THRESHOLD_BYTES,
  formatUploadSizeLimit,
} from './uploadLimits.js'

export async function prepareStagingUpload(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const body = req.body as Record<string, unknown> | null
  const fileName = typeof body?.fileName === 'string' ? body.fileName : ''
  const mimeType =
    typeof body?.mimeType === 'string' && body.mimeType.trim()
      ? body.mimeType.trim()
      : 'application/octet-stream'
  const fileSize = typeof body?.fileSize === 'number' ? body.fileSize : Number(body?.fileSize)
  const parentFolderId = typeof body?.parentFolderId === 'string' ? body.parentFolderId : ''
  const classification = typeof body?.classification === 'string' ? body.classification : ''
  const reason = typeof body?.reason === 'string' ? body.reason : ''

  if (fileSize < STAGING_UPLOAD_THRESHOLD_BYTES && !isInstallerFilename(fileName) && !isArchiveFilename(fileName)) {
    res.status(400).json({
      error: `Usá la subida directa para archivos menores a ${formatUploadSizeLimit(STAGING_UPLOAD_THRESHOLD_BYTES)}`,
      code: 'use_multipart_upload',
    })
    return
  }

  const validated = await validateDriveUploadInput({
    user,
    parentFolderIdRaw: parentFolderId,
    reasonRaw: reason,
    classificationRaw: classification,
    fileName,
    mimeType,
    fileSize,
  })

  if (!validated.ok) {
    res.status(validated.status).json({
      error: validated.error,
      ...(validated.code ? { code: validated.code } : {}),
      ...(validated.allowedMimeTypes ? { allowedMimeTypes: validated.allowedMimeTypes } : {}),
    })
    return
  }

  try {
    const uploadId = newDriveUploadId()
    const objectPath = driveUploadStagingPath(uploadId, validated.value.name)
    const signedUrl = await createSignedStagingWriteUrl(objectPath, validated.value.mimeType)

    res.json({
      uploadId,
      objectPath,
      signedUrl,
      expiresInSeconds: 15 * 60,
    })
  } catch (err) {
    logError('prepareStagingUpload falló', err)
    res.status(500).json({ error: 'No se pudo preparar la subida del archivo' })
  }
}
