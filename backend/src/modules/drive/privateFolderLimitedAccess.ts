import type { drive_v3 } from 'googleapis'
import { getEnv, isEmailInAllowedDomain } from '../../config/env.js'
import { logError } from '../../lib/log.js'
import { writeAuditLogBestEffort } from '../audit/writeAuditLog.js'
import {
  grantUserDrivePermission,
  type PermissionRole,
} from './driveUserPermission.js'

export class PrivateFolderNotSupportedError extends Error {
  readonly code = 'private_folder_not_supported' as const

  constructor(message = 'Esta ubicación no permite carpetas privadas en Drive') {
    super(message)
    this.name = 'PrivateFolderNotSupportedError'
  }
}

export async function applyPrivateFolderLimitedAccess(input: {
  governanceDrive: drive_v3.Drive
  folderId: string
  folderName: string
  parentFolderId: string
  creatorEmail: string
  actor: { uid: string; email: string }
  reason: string
  grantRole?: PermissionRole
}): Promise<{
  limitedAccessEnabled: boolean
  creatorGranted: boolean
  governanceGranted: boolean
}> {
  const grantRole = input.grantRole ?? 'writer'
  const domain = getEnv().allowedEmailDomain
  const governanceEmail = getEnv().driveImpersonateEmail.trim().toLowerCase()
  const creatorEmail = input.creatorEmail.trim().toLowerCase()

  const meta = await input.governanceDrive.files.get({
    fileId: input.folderId,
    supportsAllDrives: true,
    fields: 'capabilities(canDisableInheritedPermissions)',
  })

  if (meta.data.capabilities?.canDisableInheritedPermissions !== true) {
    throw new PrivateFolderNotSupportedError()
  }

  await input.governanceDrive.files.update({
    fileId: input.folderId,
    requestBody: { inheritedPermissionsDisabled: true },
    supportsAllDrives: true,
    fields: 'id, inheritedPermissionsDisabled',
  })

  let creatorGranted = false

  if (isEmailInAllowedDomain(creatorEmail, domain)) {
    try {
      const result = await grantUserDrivePermission(
        input.governanceDrive,
        input.folderId,
        creatorEmail,
        grantRole,
        { sendNotificationEmail: false },
      )
      creatorGranted = true

      await writeAuditLogBestEffort({
        userId: input.actor.uid,
        userEmail: input.actor.email,
        action: 'permission_grant',
        targetType: 'folder',
        targetId: input.folderId,
        targetName: input.folderName,
        parentFolderId: input.parentFolderId,
        mimeType: 'application/vnd.google-apps.folder',
        reason: input.reason,
        metadata: {
          type: 'user',
          granteeEmail: result.emailAddress,
          role: grantRole,
          driveRole: result.driveRole,
          permissionId: result.permissionId,
          source: 'private_folder_create',
          governanceAccount: false,
        },
      })
    } catch (err) {
      logError(`grantUserDrivePermission falló para creador; intento directo`, err)
      try {
        const driveRole = grantRole === 'writer' ? 'fileOrganizer' : grantRole
        const created = await input.governanceDrive.permissions.create({
          fileId: input.folderId,
          requestBody: {
            type: 'user',
            role: driveRole,
            emailAddress: creatorEmail,
          },
          sendNotificationEmail: false,
          supportsAllDrives: true,
          fields: 'id, role, emailAddress',
        })
        if (created.data.id) creatorGranted = true
      } catch (fallbackErr) {
        logError(`No se pudo otorgar acceso directo al creador en carpeta privada (${creatorEmail})`, fallbackErr)
      }
    }
  }

  const governanceGranted = await verifyPrivateFolderGovernanceAccess(
    input.governanceDrive,
    input.folderId,
  )

  if (!governanceGranted) {
    throw new Error(
      `Carpeta privada creada pero ${governanceEmail} no puede leerla (verificar rol organizer o grant explícito)`,
    )
  }

  if (!creatorGranted) {
    logError('Carpeta privada: el creador no recibió permiso directo', {
      creatorEmail,
      folderId: input.folderId,
    })
  }

  return {
    limitedAccessEnabled: true,
    creatorGranted,
    governanceGranted,
  }
}

export async function verifyPrivateFolderGovernanceAccess(
  governanceDrive: drive_v3.Drive,
  folderId: string,
): Promise<boolean> {
  try {
    await governanceDrive.files.get({
      fileId: folderId,
      supportsAllDrives: true,
      fields: 'id',
    })
    return true
  } catch {
    return false
  }
}
