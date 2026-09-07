import type { drive_v3 } from 'googleapis'

export const PERMISSION_ROLES = ['reader', 'writer', 'commenter'] as const
export type PermissionRole = (typeof PERMISSION_ROLES)[number]

/** En Shared Drives, writer no puede enviar a papelera. La escritura de la API es fileOrganizer. */
export function toDriveRole(role: PermissionRole): 'reader' | 'commenter' | 'fileOrganizer' {
  return role === 'writer' ? 'fileOrganizer' : role
}

export function isPermissionRole(value: unknown): value is PermissionRole {
  return typeof value === 'string' && (PERMISSION_ROLES as readonly string[]).includes(value)
}

export function isInheritedPermission(
  details: Array<{ inherited?: boolean | null; inheritedFrom?: string | null }> | null | undefined,
): boolean {
  return (details ?? []).some((row) => row.inherited === true)
}

export function inheritedFromPermission(
  details: Array<{ inherited?: boolean | null; inheritedFrom?: string | null }> | null | undefined,
): string | null {
  for (const row of details ?? []) {
    if (row.inherited === true && typeof row.inheritedFrom === 'string' && row.inheritedFrom.length > 0) {
      return row.inheritedFrom
    }
  }
  return null
}

/** El usuario ya tenía acceso heredado; no se creó ni modificó un permiso puntual. */
export class DrivePermissionAlreadyInheritedError extends Error {
  readonly code = 'permission_already_inherited' as const
  readonly permissionId: string
  readonly email: string
  readonly inheritedFrom: string | null
  readonly driveRole: string | null

  constructor(input: {
    permissionId: string
    email: string
    inheritedFrom: string | null
    driveRole: string | null
  }) {
    super(
      'El usuario ya tiene acceso heredado desde una carpeta o unidad compartida; no se otorgó un permiso nuevo.',
    )
    this.name = 'DrivePermissionAlreadyInheritedError'
    this.permissionId = input.permissionId
    this.email = input.email
    this.inheritedFrom = input.inheritedFrom
    this.driveRole = input.driveRole
  }
}

const PERMISSION_FIELDS =
  'nextPageToken, permissions(id, type, role, emailAddress, domain, permissionDetails)'

export async function findUserPermission(
  drive: drive_v3.Drive,
  fileId: string,
  email: string,
) {
  const normalizedEmail = email.trim().toLowerCase()
  let pageToken: string | undefined
  do {
    const listed = await drive.permissions.list({
      fileId,
      supportsAllDrives: true,
      fields: PERMISSION_FIELDS,
      pageSize: 100,
      pageToken,
    })
    const match = (listed.data.permissions ?? []).find(
      (permission) =>
        permission.type === 'user' &&
        permission.emailAddress?.trim().toLowerCase() === normalizedEmail,
    )
    if (match) return match
    pageToken = listed.data.nextPageToken ?? undefined
  } while (pageToken)
  return null
}

/** @deprecated Usar findUserPermission (incluye permissionDetails). */
export async function findDirectUserPermission(
  drive: drive_v3.Drive,
  fileId: string,
  email: string,
) {
  return findUserPermission(drive, fileId, email)
}

function assertNotInherited(existing: drive_v3.Schema$Permission, email: string): void {
  if (!isInheritedPermission(existing.permissionDetails ?? undefined)) return
  throw new DrivePermissionAlreadyInheritedError({
    permissionId: existing.id ?? '',
    email,
    inheritedFrom: inheritedFromPermission(existing.permissionDetails ?? undefined),
    driveRole: existing.role ?? null,
  })
}

export async function grantUserDrivePermission(
  drive: drive_v3.Drive,
  fileId: string,
  email: string,
  role: PermissionRole,
  options?: { sendNotificationEmail?: boolean },
): Promise<{
  permissionId: string
  driveRole: 'reader' | 'commenter' | 'fileOrganizer'
  role: PermissionRole
  emailAddress: string
}> {
  const driveRole = toDriveRole(role)
  const normalizedEmail = email.trim().toLowerCase()

  const created = await drive.permissions
    .create({
      fileId,
      requestBody: {
        type: 'user',
        role: driveRole,
        emailAddress: normalizedEmail,
      },
      sendNotificationEmail: options?.sendNotificationEmail ?? true,
      supportsAllDrives: true,
      enforceExpansiveAccess: true,
      fields: 'id, type, role, emailAddress, domain, permissionDetails',
    })
    .catch(async (err) => {
      const existing = await findUserPermission(drive, fileId, normalizedEmail)
      if (!existing?.id) throw err

      assertNotInherited(existing, normalizedEmail)

      if (existing.role === driveRole) {
        return { data: existing }
      }

      return drive.permissions.update({
        fileId,
        permissionId: existing.id,
        requestBody: { role: driveRole },
        supportsAllDrives: true,
        fields: 'id, type, role, emailAddress, domain, permissionDetails',
      })
    })

  if (isInheritedPermission(created.data.permissionDetails ?? undefined)) {
    throw new DrivePermissionAlreadyInheritedError({
      permissionId: created.data.id ?? '',
      email: normalizedEmail,
      inheritedFrom: inheritedFromPermission(created.data.permissionDetails ?? undefined),
      driveRole: created.data.role ?? null,
    })
  }

  return {
    permissionId: created.data.id ?? '',
    driveRole,
    role,
    emailAddress: created.data.emailAddress?.trim().toLowerCase() ?? normalizedEmail,
  }
}
