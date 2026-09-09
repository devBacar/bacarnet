import type { drive_v3 } from 'googleapis'
import { getEnv, isEmailInAllowedDomain } from '../../config/env.js'
import { logError } from '../../lib/log.js'
import { writeAuditLogBestEffort } from '../audit/writeAuditLog.js'
import type { FileClassification } from './classification.js'
import {
  DrivePermissionAlreadyInheritedError,
  grantUserDrivePermission,
  type PermissionRole,
} from './driveUserPermission.js'

export const FOLDER_ACCESS_MODES = ['restricted', 'selected', 'organization'] as const
export type FolderAccessMode = (typeof FOLDER_ACCESS_MODES)[number]

export function isFolderAccessMode(value: unknown): value is FolderAccessMode {
  return typeof value === 'string' && (FOLDER_ACCESS_MODES as readonly string[]).includes(value)
}

export function folderClassificationForMode(
  mode: FolderAccessMode,
  privateFolder: boolean,
): FileClassification {
  if (privateFolder) return 'RESTRINGIDO'
  if (mode === 'organization') return 'USO_INTERNO'
  if (mode === 'selected') return 'RESTRINGIDO'
  return 'USO_INTERNO'
}

export function parseInitialGrantEmails(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const emails: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const normalized = entry.trim().toLowerCase()
    if (!normalized.includes('@') || seen.has(normalized)) continue
    seen.add(normalized)
    emails.push(normalized)
  }
  return emails
}

export async function applyFolderAccessOnCreate(input: {
  drive: drive_v3.Drive
  folderId: string
  folderName: string
  parentFolderId: string
  mode: FolderAccessMode
  initialGrantEmails: string[]
  privateFolder?: boolean
  grantRole?: PermissionRole
  actor: { uid: string; email: string }
  reason: string
}): Promise<{ grantedUserCount: number; domainGranted: boolean; skippedUserCount: number }> {
  const grantRole = input.grantRole ?? 'reader'
  const domain = getEnv().allowedEmailDomain
  let grantedUserCount = 0
  let skippedUserCount = 0
  let domainGranted = false

  if (input.mode === 'organization' && !input.privateFolder) {
    try {
      const driveRole = grantRole === 'writer' ? 'fileOrganizer' : grantRole
      const created = await input.drive.permissions.create({
        fileId: input.folderId,
        requestBody: {
          type: 'domain',
          role: driveRole,
          domain,
          allowFileDiscovery: false,
        },
        sendNotificationEmail: false,
        supportsAllDrives: true,
        enforceExpansiveAccess: true,
        fields: 'id, type, role, domain',
      })
      domainGranted = Boolean(created.data.id)
      if (domainGranted) {
        void writeAuditLogBestEffort({
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
            type: 'domain',
            domain,
            role: grantRole,
            driveRole,
            permissionId: created.data.id ?? null,
            source: 'folder_create',
          },
        })
      }
    } catch (err) {
      logError('No se pudo otorgar acceso de dominio al crear carpeta', err)
    }
  }

  if (input.mode === 'selected') {
    const grantResults = await Promise.all(
      input.initialGrantEmails.map(async (email) => {
        if (!isEmailInAllowedDomain(email, domain)) {
          return 'skipped' as const
        }
        try {
          const result = await grantUserDrivePermission(
            input.drive,
            input.folderId,
            email,
            grantRole,
            { sendNotificationEmail: false },
          )
          void writeAuditLogBestEffort({
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
              source: 'folder_create',
            },
          })
          return 'granted' as const
        } catch (err) {
          if (err instanceof DrivePermissionAlreadyInheritedError) {
            return 'skipped' as const
          }
          logError('No se pudo otorgar acceso puntual al crear carpeta', err)
          return 'skipped' as const
        }
      }),
    )
    grantedUserCount = grantResults.filter((result) => result === 'granted').length
    skippedUserCount = grantResults.filter((result) => result === 'skipped').length
  }

  return { grantedUserCount, domainGranted, skippedUserCount }
}
