import {
  isSuperAdmin,
  type ActionGrants,
  type GovernanceAction,
  type UserProfile,
} from './userService'

export const GOVERNANCE_ACTIONS: readonly GovernanceAction[] = [
  'approval',
  'permission_grant',
  'classification_change',
  'authorized_copy',
]

export const GOVERNANCE_ACTION_LABELS: Record<GovernanceAction, string> = {
  approval: 'Aprobar archivos',
  permission_grant: 'Gestionar permisos',
  classification_change: 'Cambiar clasificación',
  authorized_copy: 'Copia autorizada',
}

export function countActionGrantEntries(grants: ActionGrants | undefined): number {
  if (!grants) return 0
  let total = 0
  for (const action of GOVERNANCE_ACTIONS) {
    total += grants[action]?.length ?? 0
  }
  return total
}

export function canPerformGovernanceAction(
  profile: UserProfile | null | undefined,
  action: GovernanceAction,
  governingAreaId: string | null | undefined,
): boolean {
  if (!governingAreaId) return isSuperAdmin(profile)
  if (isSuperAdmin(profile)) return true
  if (profile?.managedAreaIds?.includes(governingAreaId)) return true
  return (profile?.actionGrants?.[action] ?? []).includes(governingAreaId)
}

export function listActionGrantEntries(
  grants: ActionGrants | undefined,
): Array<{ action: GovernanceAction; areaId: string }> {
  if (!grants) return []
  const out: Array<{ action: GovernanceAction; areaId: string }> = []
  for (const action of GOVERNANCE_ACTIONS) {
    for (const areaId of grants[action] ?? []) {
      out.push({ action, areaId })
    }
  }
  return out.sort((a, b) =>
    GOVERNANCE_ACTION_LABELS[a.action].localeCompare(GOVERNANCE_ACTION_LABELS[b.action], 'es'),
  )
}
