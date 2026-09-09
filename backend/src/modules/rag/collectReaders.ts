import type { drive_v3 } from 'googleapis'
import { getEnv } from '../../config/env.js'
import { getSharedDriveRootId } from '../../lib/google/sharedDrive.js'
import type { RagDomainAccess } from './types.js'
import { driveRoleToApiRole } from '../drive/permissionRoleUtils.js'

export type RagFileAcl = {
  allowedReaders: string[]
  domainAccess: RagDomainAccess | null
}

function isServiceAccountPermissionEmail(email: string): boolean {
  return email.trim().toLowerCase() === getEnv().driveImpersonateEmail
}

function addUserPermission(
  permission: drive_v3.Schema$Permission,
  allowedReaders: Set<string>,
): void {
  if (permission.type !== 'user' || !permission.emailAddress) return
  const email = permission.emailAddress.trim().toLowerCase()
  if (isServiceAccountPermissionEmail(email)) return
  allowedReaders.add(email)
}

function addDomainPermission(
  permission: drive_v3.Schema$Permission,
  domainAccess: { current: RagDomainAccess | null },
): void {
  if (permission.type !== 'domain' || !permission.domain || domainAccess.current) return
  domainAccess.current = {
    domain: permission.domain.trim().toLowerCase(),
    role: driveRoleToApiRole(permission.role),
  }
}

async function listAllPermissions(
  drive: drive_v3.Drive,
  fileId: string,
): Promise<drive_v3.Schema$Permission[]> {
  const permissions: drive_v3.Schema$Permission[] = []
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

    permissions.push(...(listed.data.permissions ?? []))
    pageToken = listed.data.nextPageToken ?? undefined
  } while (pageToken)

  return permissions
}

function collectFromPermissions(
  permissions: drive_v3.Schema$Permission[],
): RagFileAcl {
  const allowedReaders = new Set<string>()
  const domainAccess: { current: RagDomainAccess | null } = { current: null }

  for (const permission of permissions) {
    addUserPermission(permission, allowedReaders)
    addDomainPermission(permission, domainAccess)
  }

  return {
    allowedReaders: [...allowedReaders].sort((a, b) => a.localeCompare(b, 'es')),
    domainAccess: domainAccess.current,
  }
}

function mergeAcls(base: RagFileAcl, extra: RagFileAcl): RagFileAcl {
  const allowedReaders = new Set([...base.allowedReaders, ...extra.allowedReaders])
  return {
    allowedReaders: [...allowedReaders].sort((a, b) => a.localeCompare(b, 'es')),
    domainAccess: base.domainAccess ?? extra.domainAccess,
  }
}

/**
 * ACL indexada para RAG: usuarios con lectura real (directa o heredada) más
 * miembros de la Unidad compartida. Solo excluye la cuenta de servicio DWD.
 */
export async function collectDriveFileAcl(
  drive: drive_v3.Drive,
  fileId: string,
): Promise<RagFileAcl> {
  const [filePermissions, drivePermissions] = await Promise.all([
    listAllPermissions(drive, fileId),
    listAllPermissions(drive, getSharedDriveRootId()),
  ])

  const fileAcl = collectFromPermissions(filePermissions)
  const driveAcl = collectFromPermissions(drivePermissions)
  return mergeAcls(fileAcl, driveAcl)
}
