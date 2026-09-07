import type { PermissionRole } from './driveUserPermission.js'

export function driveRoleToApiRole(driveRole: string | null | undefined): PermissionRole {
  if (driveRole === 'fileOrganizer' || driveRole === 'writer') return 'writer'
  if (driveRole === 'commenter') return 'commenter'
  return 'reader'
}

export function permissionRoleRank(role: PermissionRole): number {
  if (role === 'writer') return 3
  if (role === 'commenter') return 2
  return 1
}

export function isPermissionUpgrade(current: PermissionRole, requested: PermissionRole): boolean {
  return permissionRoleRank(requested) > permissionRoleRank(current)
}
