import type { Request, Response } from 'express'
import { getEnv, isEmailInAllowedDomain } from '../../config/env.js'
import { getDrive } from '../../lib/google/driveClient.js'
import { sanitizeDriveId } from '../../lib/google/driveIds.js'
import { logError } from '../../lib/log.js'
import { writeAuditLogBestEffort } from '../audit/writeAuditLog.js'
import { getFileInSharedDrive, googleUserMessage } from './assertInSharedDrive.js'
import {
  getStoredClassification,
  permissionCreateDeniedReason,
  type DrivePermissionType,
} from './classification.js'
import {
  DrivePermissionAlreadyInheritedError,
  grantUserDrivePermission,
  isPermissionRole,
} from './driveUserPermission.js'
import {
  canPerformGovernanceAction,
  governanceForbiddenMessage,
  resolveFileGoverningAreaId,
} from './governDriveFile.js'
import { invalidateDriveMetadataForEmail, invalidateDriveMetadataForUser } from './driveMetadataCache.js'
import { resolveDriveSubject } from './driveSubject.js'
import { getMinReasonLength } from './policy.js'

const SHARE_TYPES = ['user', 'domain'] as const

function parseShareType(value: unknown): DrivePermissionType | null {
  if (value === undefined || value === null || value === '') return 'user'
  if (value === 'user' || value === 'domain' || value === 'anyone') return value
  return null
}

export async function grantDrivePermission(req: Request, res: Response): Promise<void> {
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

  const parsedType = parseShareType(body.type)
  if (parsedType === 'anyone') {
    res.status(403).json({ error: permissionCreateDeniedReason('USO_INTERNO', 'anyone') })
    return
  }
  if (!parsedType || !(SHARE_TYPES as readonly string[]).includes(parsedType)) {
    res.status(400).json({ error: "type debe ser 'user' o 'domain'" })
    return
  }
  const shareType = parsedType

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
  if (!canPerformGovernanceAction(user, 'permission_grant', governingAreaId)) {
    res.status(403).json({ error: governanceForbiddenMessage('permission_grant') })
    return
  }

  const classification = await getStoredClassification(fileId)
  const denied = permissionCreateDeniedReason(classification, shareType)
  if (denied) {
    res.status(403).json({ error: denied, classification })
    return
  }

  const domain = getEnv().allowedEmailDomain
  let email: string | undefined

  if (shareType === 'user') {
    const rawEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!rawEmail || !rawEmail.includes('@')) {
      res.status(400).json({ error: 'email es obligatorio para type user' })
      return
    }
    if (!isEmailInAllowedDomain(rawEmail, domain)) {
      res.status(400).json({ error: `email debe terminar en @${domain}` })
      return
    }
    email = rawEmail
  }

  try {
    const drive = await getDrive()

    if (shareType === 'domain') {
      const driveRole = role === 'writer' ? 'fileOrganizer' : role
      const created = await drive.permissions.create({
        fileId,
        requestBody: {
          type: 'domain',
          role: driveRole,
          domain,
          allowFileDiscovery: false,
        },
        sendNotificationEmail: false,
        supportsAllDrives: true,
        enforceExpansiveAccess: true,
        fields: 'id, type, role, emailAddress, domain',
      })
      const permissionId = created.data.id ?? ''

      await writeAuditLogBestEffort({
        userId: user.uid,
        userEmail: user.email,
        action: 'permission_grant',
        targetType: 'file',
        targetId: fileId,
        targetName: found.file.name,
        parentFolderId: found.file.parentFolderId,
        mimeType: found.file.mimeType,
        reason: reason.trim(),
        metadata: {
          granteeEmail: null,
          role,
          driveRole,
          permissionId,
          type: shareType,
          domain,
        },
      })

      res.status(201).json({
        id: permissionId,
        type: shareType,
        role,
        driveRole,
        emailAddress: null,
        domain,
      })
      return
    }

    const result = await grantUserDrivePermission(drive, fileId, email!, role)

    await writeAuditLogBestEffort({
      userId: user.uid,
      userEmail: user.email,
      action: 'permission_grant',
      targetType: 'file',
      targetId: fileId,
      targetName: found.file.name,
      parentFolderId: found.file.parentFolderId,
      mimeType: found.file.mimeType,
      reason: reason.trim(),
      metadata: {
        granteeEmail: email ?? null,
        role,
        driveRole: result.driveRole,
        permissionId: result.permissionId,
        type: shareType,
        domain: null,
      },
    })

    invalidateDriveMetadataForUser(resolveDriveSubject(user), user.uid)
    if (email) await invalidateDriveMetadataForEmail(email)

    res.status(201).json({
      id: result.permissionId,
      type: shareType,
      role,
      driveRole: result.driveRole,
      emailAddress: result.emailAddress,
      domain: null,
    })
  } catch (err) {
    if (err instanceof DrivePermissionAlreadyInheritedError) {
      res.status(409).json({
        error: err.message,
        code: err.code,
        permissionId: err.permissionId,
        granteeEmail: err.email,
        inheritedFrom: err.inheritedFrom,
        driveRole: err.driveRole,
      })
      return
    }
    logError('Drive permissions.create falló', err)
    const detail = googleUserMessage(err)
    res.status(502).json({
      error: 'No se pudo otorgar el permiso',
      ...(detail ? { detail } : {}),
    })
  }
}
