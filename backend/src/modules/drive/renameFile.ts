import type { Request, Response } from 'express'
import { getDrive } from '../../lib/google/driveClient.js'
import { sanitizeDriveId } from '../../lib/google/driveIds.js'
import { logError } from '../../lib/log.js'
import { writeAuditLogBestEffort } from '../audit/writeAuditLog.js'
import { getFileInSharedDrive, googleStatus, googleUserMessage } from './assertInSharedDrive.js'
import { invalidateDriveMetadataForUser } from './driveMetadataCache.js'
import { resolveDriveSubject } from './driveSubject.js'

export async function renameDriveFile(req: Request, res: Response): Promise<void> {
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

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    res.status(400).json({ error: 'name es obligatorio' })
    return
  }

  const driveSubject = resolveDriveSubject(user)
  const found = await getFileInSharedDrive(fileId, driveSubject)
  if (!found.ok) {
    res.status(found.status).json({ error: found.error })
    return
  }

  if (found.file.trashed) {
    res.status(409).json({ error: 'No se puede renombrar un elemento en la papelera' })
    return
  }

  if (found.file.name === name) {
    res.json({ id: fileId, name })
    return
  }

  try {
    const drive = await getDrive(driveSubject)
    await drive.files.update({
      fileId,
      requestBody: { name },
      supportsAllDrives: true,
      fields: 'id, name',
    })
  } catch (err) {
    logError('Drive files.update (rename) falló', err)
    const status = googleStatus(err)
    const detail = googleUserMessage(err)
    res.status(status === 403 || status === 404 ? status : 502).json({
      error:
        status === 403
          ? 'No tenés permiso para renombrar este elemento'
          : status === 404
            ? 'Elemento no encontrado o sin acceso'
            : 'No se pudo renombrar el elemento',
      ...(detail ? { detail } : {}),
    })
    return
  }

  await writeAuditLogBestEffort({
    userId: user.uid,
    userEmail: user.email,
    action: 'rename',
    targetType: found.file.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
    targetId: fileId,
    targetName: name,
    parentFolderId: found.file.parentFolderId,
    mimeType: found.file.mimeType,
    reason: null,
    metadata: { previousName: found.file.name },
  })

  invalidateDriveMetadataForUser(driveSubject, user.uid)
  res.json({ id: fileId, name })
}
