import type { Request, Response } from 'express'
import { getDrive } from '../../lib/google/driveClient.js'
import { sanitizeDriveId } from '../../lib/google/driveIds.js'
import { logError } from '../../lib/log.js'
import { writeAuditLogBestEffort } from '../audit/writeAuditLog.js'
import { getFileInSharedDrive, googleStatus, googleUserMessage } from './assertInSharedDrive.js'
import { invalidateDriveMetadataForUser } from './driveMetadataCache.js'
import { resolveDriveSubject } from './driveSubject.js'

async function folderContainsAncestor(
  drive: Awaited<ReturnType<typeof getDrive>>,
  folderId: string,
  ancestorId: string,
): Promise<boolean> {
    let currentId: string | null = folderId
    const visited = new Set<string>()

    while (currentId) {
      if (currentId === ancestorId) return true
      if (visited.has(currentId)) break
      visited.add(currentId)

      const meta: { data: { parents?: string[] | null } } = await drive.files.get({
        fileId: currentId,
        supportsAllDrives: true,
        fields: 'parents',
      })
      currentId = meta.data.parents?.[0] ?? null
    }

  return false
}

export async function moveDriveFile(req: Request, res: Response): Promise<void> {
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
  const destinationFolderId = sanitizeDriveId(String(body.destinationFolderId ?? ''))
  if (!fileId || !destinationFolderId) {
    res.status(400).json({ error: 'fileId o destinationFolderId inválido' })
    return
  }

  const driveSubject = resolveDriveSubject(user)
  const source = await getFileInSharedDrive(fileId, driveSubject)
  if (!source.ok) {
    res.status(source.status).json({ error: source.error })
    return
  }

  const destination = await getFileInSharedDrive(destinationFolderId, driveSubject)
  if (!destination.ok) {
    res.status(destination.status).json({ error: destination.error })
    return
  }

  if (source.file.trashed || destination.file.trashed) {
    res.status(409).json({ error: 'No se puede mover un elemento en la papelera' })
    return
  }

  if (destination.file.mimeType !== 'application/vnd.google-apps.folder') {
    res.status(400).json({ error: 'El destino debe ser una carpeta' })
    return
  }

  const currentParentId = source.file.parentFolderId
  if (currentParentId === destinationFolderId) {
    res.status(409).json({ error: 'El elemento ya está en esa carpeta' })
    return
  }

  if (!currentParentId) {
    res.status(400).json({ error: 'No se puede mover un elemento sin carpeta padre' })
    return
  }

  if (fileId === destinationFolderId) {
    res.status(400).json({ error: 'No se puede mover una carpeta dentro de sí misma' })
    return
  }

  try {
    const drive = await getDrive(driveSubject)

    if (source.file.mimeType === 'application/vnd.google-apps.folder') {
      const nested = await folderContainsAncestor(drive, destinationFolderId, fileId)
      if (nested) {
        res.status(400).json({ error: 'No se puede mover una carpeta dentro de sí misma o de sus subcarpetas' })
        return
      }
    }

    const [sourceMeta, destMeta] = await Promise.all([
      drive.files.get({
        fileId,
        supportsAllDrives: true,
        fields: 'capabilities/canEdit',
      }),
      drive.files.get({
        fileId: destinationFolderId,
        supportsAllDrives: true,
        fields: 'capabilities/canAddChildren',
      }),
    ])

    if (sourceMeta.data.capabilities?.canEdit !== true) {
      res.status(403).json({ error: 'No tenés permiso de escritura sobre el elemento de origen' })
      return
    }

    if (destMeta.data.capabilities?.canAddChildren !== true) {
      res.status(403).json({ error: 'No tenés permiso de escritura sobre la carpeta destino' })
      return
    }

    await drive.files.update({
      fileId,
      addParents: destinationFolderId,
      removeParents: currentParentId,
      supportsAllDrives: true,
      fields: 'id, parents',
    })
  } catch (err) {
    logError('Drive files.update (move) falló', err)
    const status = googleStatus(err)
    const detail = googleUserMessage(err)
    res.status(status === 403 || status === 404 ? status : 502).json({
      error:
        status === 403
          ? 'No tenés permiso para mover este elemento'
          : status === 404
            ? 'Elemento o carpeta destino no encontrado'
            : 'No se pudo mover el elemento',
      ...(detail ? { detail } : {}),
    })
    return
  }

  await writeAuditLogBestEffort({
    userId: user.uid,
    userEmail: user.email,
    action: 'edit',
    targetType: source.file.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
    targetId: fileId,
    targetName: source.file.name,
    parentFolderId: destinationFolderId,
    mimeType: source.file.mimeType,
    reason: null,
    metadata: {
      move: true,
      fromFolderId: currentParentId,
      toFolderId: destinationFolderId,
      toFolderName: destination.file.name,
    },
  })

  invalidateDriveMetadataForUser(driveSubject, user.uid)
  res.json({
    id: fileId,
    parentFolderId: destinationFolderId,
    destinationFolderName: destination.file.name,
  })
}
