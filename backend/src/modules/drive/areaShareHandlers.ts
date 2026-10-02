import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { canManageWorkspaceUsers } from '../auth/middleware.js'
import { sanitizeDriveId } from '../../lib/google/driveIds.js'
import { getFileInSharedDrive } from './assertInSharedDrive.js'
import {
  AreaShareUserNotFoundError,
  removeAreaShareRule,
  sincronizarAccesosDeAreaParaUsuario,
  getDriveAreaShare,
} from './areaShares.js'
import {
  canPerformGovernanceAction,
  governanceForbiddenMessage,
  resolveFileGoverningAreaId,
} from './governDriveFile.js'
import { getAreaDisplayName } from './resolveAreaMembers.js'

function isSafeAreaId(value: string): boolean {
  return value.length > 0 && value.length <= 200 && !value.includes('/') && !value.includes('\\')
}

export async function syncDriveAreaSharesForUser(req: Request, res: Response): Promise<void> {
  const actor = req.authedUser
  if (!actor) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }
  if (!canManageWorkspaceUsers(actor)) {
    res.status(403).json({ error: 'No tenés permiso para actualizar accesos de usuarios' })
    return
  }

  const uid = String(req.params.uid ?? '').trim()
  if (!uid || uid.includes('/') || uid.includes('\\')) {
    res.status(400).json({ error: 'uid inválido' })
    return
  }

  try {
    const result = await sincronizarAccesosDeAreaParaUsuario(uid, {
      uid: actor.uid,
      email: actor.email,
    })
    res.json(result)
  } catch (err) {
    if (err instanceof AreaShareUserNotFoundError) {
      res.status(404).json({ error: 'Usuario no encontrado' })
      return
    }
    logError('sincronizarAccesosDeAreaParaUsuario falló', err)
    res.status(500).json({ error: 'No se pudieron actualizar los accesos del área' })
  }
}

export async function deleteDriveAreaShare(req: Request, res: Response): Promise<void> {
  const actor = req.authedUser
  if (!actor) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const fileId = sanitizeDriveId(String(req.params.fileId ?? ''))
  if (!fileId) {
    res.status(400).json({ error: 'fileId inválido' })
    return
  }

  const areaId = String(req.params.areaId ?? '').trim()
  if (!isSafeAreaId(areaId)) {
    res.status(400).json({ error: 'areaId inválido' })
    return
  }

  const found = await getFileInSharedDrive(fileId)
  if (!found.ok) {
    res.status(found.status).json({ error: found.error })
    return
  }

  const governingAreaId = await resolveFileGoverningAreaId(fileId, found.file.parentFolderId)
  if (!canPerformGovernanceAction(actor, 'permission_grant', governingAreaId)) {
    res.status(403).json({ error: governanceForbiddenMessage('permission_grant') })
    return
  }

  const share = await getDriveAreaShare(fileId, areaId)
  if (!share) {
    res.status(404).json({ error: 'Esa área no está compartida en este archivo' })
    return
  }

  const areaName = (await getAreaDisplayName(areaId)) ?? areaId
  try {
    const result = await removeAreaShareRule({
      fileId,
      areaId,
      actor: { uid: actor.uid, email: actor.email },
      fileName: found.file.name,
      parentFolderId: found.file.parentFolderId,
      mimeType: found.file.mimeType,
      areaName,
    })
    if (!result.deleted && result.failedCount === 0) {
      res.status(404).json({ error: 'Esa área no está compartida en este archivo' })
      return
    }
    const status = result.deleted ? 200 : 207
    res.status(status).json({
      deleted: result.deleted,
      areaId,
      areaName,
      removedCount: result.removedCount,
      failedCount: result.failedCount,
      failures: result.failures,
    })
  } catch (err) {
    logError('deleteDriveAreaShare falló', err)
    res.status(500).json({ error: 'No se pudo dejar de compartir con el área' })
  }
}
