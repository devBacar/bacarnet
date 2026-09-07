import type { Request, Response } from 'express'
import { Readable } from 'node:stream'
import { getDrive } from '../../lib/google/driveClient.js'
import { sanitizeDriveId } from '../../lib/google/driveIds.js'
import { logError } from '../../lib/log.js'
import { writeAuditLogBestEffort } from '../audit/writeAuditLog.js'
import { getFileInSharedDrive, googleStatus, googleUserMessage } from './assertInSharedDrive.js'
import {
  parseClassificationInput,
  writeFileClassificationBestEffort,
} from './classification.js'
import { invalidateDriveMetadataForUser } from './driveMetadataCache.js'
import { resolveDriveSubject } from './driveSubject.js'
import { getAllowedUploadMimeTypes, getMinReasonLength, isOfficeUploadMime } from './policy.js'
import {
  isInstallerFilename,
  isInstallerArea,
  validateInstallerUpload,
} from './installerUploadPolicy.js'
import { parseMultipartUpload } from './parseMultipartUpload.js'
import { resolveGoverningAreaId } from './resolveGoverningArea.js'

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const BINARY_UPLOAD_MIMES = new Set(['application/pdf', 'image/png', 'image/jpeg'])

export async function uploadDriveFile(req: Request, res: Response): Promise<void> {
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

  if (isOfficeUploadMime(uploadedFile.mimetype)) {
    res.status(409).json({
      error: 'Los archivos Office requieren aprobación previa del jefe de área',
      code: 'office_requires_approval',
      uploadRequestPath: '/api/approval-requests/office-upload',
    })
    return
  }

  const parentFolderId = sanitizeDriveId(
    fields.parentFolderId ?? '',
  )
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

  const governingAreaId = await resolveGoverningAreaId(parentFolderId)
  const installerUpload = isInstallerFilename(uploadedFile.originalname)

  if (installerUpload) {
    const installerCheck = validateInstallerUpload(
      uploadedFile.mimetype,
      uploadedFile.originalname,
    )
    if (!installerCheck.ok) {
      res.status(403).json({ error: installerCheck.error, code: installerCheck.code })
      return
    }

    if (!isInstallerArea(governingAreaId)) {
      res.status(403).json({
        error: 'Los instaladores solo pueden subirse dentro del área Sistemas',
        code: 'installer_area_restricted',
      })
      return
    }

    const mime = uploadedFile.mimetype.trim().toLowerCase()
    if (mime !== 'application/octet-stream') {
      const allowedMimes = await getAllowedUploadMimeTypes()
      if (!allowedMimes.includes(mime)) {
        res.status(403).json({
          error: 'mimeType no permitido para instaladores',
          allowedMimeTypes: allowedMimes,
        })
        return
      }
    }
  } else {
    const allowedMimes = await getAllowedUploadMimeTypes()
    if (
      !BINARY_UPLOAD_MIMES.has(uploadedFile.mimetype) ||
      !allowedMimes.includes(uploadedFile.mimetype)
    ) {
      res.status(403).json({
        error: 'mimeType no permitido para upload',
        allowedMimeTypes: allowedMimes,
      })
      return
    }
  }

  const name =
    fields.name?.trim() ||
    uploadedFile.originalname
  const classification = parsedClassification.classification

  try {
    const drive = await getDrive(driveSubject)
    const created = await drive.files.create({
      requestBody: {
        name: name.slice(0, 255),
        mimeType: uploadedFile.mimetype,
        parents: [parentFolderId],
      },
      media: {
        mimeType: uploadedFile.mimetype,
        body: Readable.from(uploadedFile.buffer),
      },
      fields: 'id, name, mimeType, webViewLink, parents, modifiedTime, createdTime, size',
      supportsAllDrives: true,
    })

    const id = created.data.id ?? ''
    await writeFileClassificationBestEffort(
      id,
      classification,
      { uid: user.uid, email: user.email },
      {
        status: 'BORRADOR',
        governingAreaId,
        createdByUserId: user.uid,
        createdByEmail: user.email,
        createdByDisplayName: user.displayName,
      },
    )

    await writeAuditLogBestEffort({
      userId: user.uid,
      userEmail: user.email,
      action: 'create',
      targetType: 'file',
      targetId: id,
      targetName: created.data.name ?? name,
      parentFolderId,
      mimeType: created.data.mimeType ?? uploadedFile.mimetype,
      reason,
      metadata: {
        type: 'upload',
        classification,
        status: 'BORRADOR',
        governingAreaId,
        size: created.data.size ?? String(uploadedFile.size),
      },
    })

    invalidateDriveMetadataForUser(resolveDriveSubject(user), user.uid)
    res.status(201).json({
      id,
      name: created.data.name ?? name,
      mimeType: created.data.mimeType ?? uploadedFile.mimetype,
      webViewLink: created.data.webViewLink ?? null,
      modifiedTime: created.data.modifiedTime ?? null,
      createdTime: created.data.createdTime ?? null,
      size: created.data.size ?? String(uploadedFile.size),
      isFolder: false,
      classification,
      status: 'BORRADOR',
      governingAreaId,
      createdBy: {
        userId: user.uid,
        email: user.email,
        displayName: user.displayName,
        source: 'intranet',
      },
    })
  } catch (err) {
    logError('Drive files.create (multipart upload) falló', err)
    const status = googleStatus(err)
    const detail = googleUserMessage(err)
    res.status(status === 403 || status === 404 ? status : 502).json({
      error:
        status === 403
          ? 'No tenés permiso para subir archivos en esta carpeta'
          : status === 404
            ? 'Carpeta destino no encontrada o sin acceso'
            : 'No se pudo subir el archivo a Drive',
      ...(detail ? { detail } : {}),
    })
  }
}
