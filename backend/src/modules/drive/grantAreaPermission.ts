import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { getDrive } from '../../lib/google/driveClient.js'
import { sanitizeDriveId } from '../../lib/google/driveIds.js'
import { logError } from '../../lib/log.js'
import { writeAuditLogBestEffort } from '../audit/writeAuditLog.js'
import { getFileInSharedDrive, googleUserMessage } from './assertInSharedDrive.js'
import {
  canPerformGovernanceAction,
  governanceForbiddenMessage,
  resolveFileGoverningAreaId,
} from './governDriveFile.js'
import {
  DrivePermissionAlreadyInheritedError,
  grantUserDrivePermission,
  isPermissionRole,
} from './driveUserPermission.js'
import { getMinReasonLength } from './policy.js'
import { getAreaDisplayName, resolveAreaMembers } from './resolveAreaMembers.js'

export async function grantDriveAreaPermission(req: Request, res: Response): Promise<void> {
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

  const reason = typeof body.reason === 'string' ? body.reason : ''
  const minReason = await getMinReasonLength()
  if (reason.trim().length < minReason) {
    res.status(400).json({
      error: `reason debe tener al menos ${minReason} caracteres`,
    })
    return
  }

  if (!isPermissionRole(body.role)) {
    res.status(400).json({ error: "role debe ser 'reader', 'writer' o 'commenter'" })
    return
  }
  const role = body.role

  const fileId = sanitizeDriveId(String(req.params.fileId ?? ''))
  if (!fileId) {
    res.status(400).json({ error: 'fileId inválido' })
    return
  }

  const found = await getFileInSharedDrive(fileId)
  if (!found.ok) {
    res.status(found.status).json({ error: found.error })
    return
  }
  if (found.file.trashed) {
    res.status(409).json({ error: 'El archivo está en la papelera' })
    return
  }

  const governingAreaId = await resolveFileGoverningAreaId(fileId, found.file.parentFolderId)
  if (!governingAreaId) {
    res.status(400).json({ error: 'El archivo no tiene área gobernante asignada' })
    return
  }

  if (!canPerformGovernanceAction(user, 'permission_grant', governingAreaId)) {
    res.status(403).json({ error: governanceForbiddenMessage('permission_grant') })
    return
  }

  const targetAreaIdRaw = typeof body.areaId === 'string' ? body.areaId.trim() : ''
  const targetAreaId = targetAreaIdRaw || governingAreaId

  const members = await resolveAreaMembers(targetAreaId)
  if (members.length === 0) {
    res.status(409).json({
      error: 'No hay usuarios registrados en el área seleccionada',
      areaId: targetAreaId,
    })
    return
  }

  const areaName = (await getAreaDisplayName(targetAreaId)) ?? targetAreaId
  const batchId = randomUUID()
  const drive = await getDrive()
  const trimmedReason = reason.trim()

  const granted: Array<{
    uid: string
    email: string
    permissionId: string
  }> = []
  const skipped: Array<{
    uid: string
    email: string
    code: string
    reason: string
    inheritedFrom: string | null
  }> = []
  const failures: Array<{ uid: string; email: string; error: string }> = []

  for (const member of members) {
    try {
      const result = await grantUserDrivePermission(drive, fileId, member.email, role, {
        sendNotificationEmail: true,
      })

      await writeAuditLogBestEffort({
        userId: user.uid,
        userEmail: user.email,
        action: 'permission_grant',
        targetType: 'file',
        targetId: fileId,
        targetName: found.file.name,
        parentFolderId: found.file.parentFolderId,
        mimeType: found.file.mimeType,
        reason: trimmedReason,
        metadata: {
          granteeEmail: member.email,
          granteeUid: member.uid,
          role,
          driveRole: result.driveRole,
          permissionId: result.permissionId,
          type: 'user',
          areaFanOut: {
            batchId,
            governingAreaId: targetAreaId,
            areaName,
          },
        },
      })

      granted.push({
        uid: member.uid,
        email: member.email,
        permissionId: result.permissionId,
      })
    } catch (err) {
      if (err instanceof DrivePermissionAlreadyInheritedError) {
        skipped.push({
          uid: member.uid,
          email: member.email,
          code: err.code,
          reason: err.message,
          inheritedFrom: err.inheritedFrom,
        })
        continue
      }
      logError('Drive area fan-out grant falló para un miembro', err)
      failures.push({
        uid: member.uid,
        email: member.email,
        error: googleUserMessage(err) ?? 'No se pudo otorgar el permiso',
      })
    }
  }

  if (granted.length === 0) {
    res.status(skipped.length > 0 && failures.length === 0 ? 409 : 502).json({
      error:
        skipped.length > 0 && failures.length === 0
          ? 'Ningún miembro recibió un permiso puntual nuevo (acceso heredado preexistente)'
          : 'No se pudo otorgar el permiso a ningún miembro del área',
      governingAreaId,
      areaName,
      batchId,
      grantedCount: 0,
      skippedCount: skipped.length,
      failedCount: failures.length,
      skipped,
      failures,
    })
    return
  }

  const status = failures.length > 0 ? 207 : 201
  res.status(status).json({
    batchId,
    governingAreaId,
    areaName,
    role,
    grantedCount: granted.length,
    skippedCount: skipped.length,
    failedCount: failures.length,
    granted,
    skipped,
    failures,
  })
}
