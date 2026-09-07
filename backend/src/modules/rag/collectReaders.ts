import type { drive_v3 } from 'googleapis'
import type { RagDomainAccess } from './types.js'
import { isInheritedPermission } from '../drive/driveUserPermission.js'
import {
  isPrivilegedPermissionEmail,
  resolvePrivilegedPermissionEmails,
} from '../drive/privilegedPermissionEmails.js'

type ApiPermissionRole = 'reader' | 'writer' | 'commenter'

function toApiRole(driveRole: string | null | undefined): ApiPermissionRole {
  if (driveRole === 'fileOrganizer' || driveRole === 'writer') return 'writer'
  if (driveRole === 'commenter') return 'commenter'
  return 'reader'
}

export type RagFileAcl = {
  allowedReaders: string[]
  domainAccess: RagDomainAccess | null
}

export async function collectDriveFileAcl(
  drive: drive_v3.Drive,
  fileId: string,
): Promise<RagFileAcl> {
  const privilegedEmails = await resolvePrivilegedPermissionEmails()
  const allowedReaders = new Set<string>()
  let domainAccess: RagDomainAccess | null = null

  let pageToken: string | undefined
  do {
    const listed = await drive.permissions.list({
      fileId,
      supportsAllDrives: true,
      fields:
        'nextPageToken, permissions(id, type, role, emailAddress, domain, permissionDetails)',
      pageSize: 100,
      pageToken,
    })

    for (const permission of listed.data.permissions ?? []) {
      const apiRole = toApiRole(permission.role)

      if (permission.type === 'user' && permission.emailAddress) {
        const email = permission.emailAddress.trim().toLowerCase()
        if (isPrivilegedPermissionEmail(email, privilegedEmails)) continue
        allowedReaders.add(email)
        continue
      }

      if (permission.type === 'domain' && permission.domain && !domainAccess) {
        domainAccess = {
          domain: permission.domain.trim().toLowerCase(),
          role: apiRole,
        }
      }

      if (permission.type === 'group' && permission.emailAddress) {
        // Reservado para fase 2; no expandimos grupos en el piloto.
        void isInheritedPermission(permission.permissionDetails)
      }
    }

    pageToken = listed.data.nextPageToken ?? undefined
  } while (pageToken)

  return {
    allowedReaders: [...allowedReaders].sort((a, b) => a.localeCompare(b, 'es')),
    domainAccess,
  }
}
