import type { Request, Response } from 'express'
import { getDrive } from '../../lib/google/driveClient.js'
import { sanitizeDriveId } from '../../lib/google/driveIds.js'
import { logError } from '../../lib/log.js'
import { writeAuditLogBestEffort } from '../audit/writeAuditLog.js'
import { getFileInSharedDrive, googleStatus, googleUserMessage } from './assertInSharedDrive.js'
import { invalidateDriveMetadataForUser } from './driveMetadataCache.js'
import { resolveDriveSubject } from './driveSubject.js'
import { getMinReasonLength } from './policy.js'

const WORK_MIMES_REQUIRE_REASON = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.folder',
])

const MEDIA_MIMES_OPTIONAL_REASON = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/mpeg',
])

function trashRequiresReason(mimeType: string | null): boolean {
  if (mimeType && MEDIA_MIMES_OPTIONAL_REASON.has(mimeType)) return false
  if (mimeType && WORK_MIMES_REQUIRE_REASON.has(mimeType)) return true
  return true
}

export async function trashDriveFile(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const body = req.body as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Body inválido' })
    return
  }

  const fileId = sanitizeDriveId(String(req.params.fileId ?? ''))
  if (!fileId) {
    res.status(400).json({ error: 'fileId inválido' })
    return
  }

  const driveSubject = resolveDriveSubject(user)
  const found = await getFileInSharedDrive(fileId, driveSubject)
  if (!found.ok) {
    res.status(found.status).json({ error: found.error })
    return
  }

  if (found.file.trashed) {
    res.status(409).json({ error: 'El archivo ya está en la papelera' })
    return
  }

  const trimmedReason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (trashRequiresReason(found.file.mimeType)) {
    const minReason = await getMinReasonLength()
    if (trimmedReason.length < minReason) {
      res.status(400).json({
        error: `reason debe tener al menos ${minReason} caracteres`,
      })
      return
    }
  }

  try {
    const drive = await getDrive(driveSubject)
    await drive.files.update({
      fileId,
      requestBody: { trashed: true },
      supportsAllDrives: true,
      fields: 'id, trashed',
    })
  } catch (err) {
    logError('Drive files.update (trashed) falló', err)
    const status = googleStatus(err)
    const detail = googleUserMessage(err)
    res.status(status === 403 || status === 404 ? status : 502).json({
      error:
        status === 403
          ? 'No tenés permiso para mover este archivo a la papelera'
          : status === 404
            ? 'Archivo no encontrado o sin acceso'
            : 'No se pudo mover el archivo a la papelera',
      ...(detail ? { detail } : {}),
    })
    return
  }

  await writeAuditLogBestEffort({
    userId: user.uid,
    userEmail: user.email,
    action: 'delete',
    targetType: 'file',
    targetId: fileId,
    targetName: found.file.name,
    parentFolderId: found.file.parentFolderId,
    mimeType: found.file.mimeType,
    reason: trimmedReason.length > 0 ? trimmedReason : null,
    metadata: { trashed: true },
  })

  invalidateDriveMetadataForUser(resolveDriveSubject(user), user.uid)
  res.json({ id: fileId, trashed: true })
}
