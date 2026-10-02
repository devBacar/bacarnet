import type { AuthedUser } from '../auth/middleware.js'
import { isSuperAdminUser } from '../auth/middleware.js'
import {
  canPerformGovernanceAction,
  GOVERNANCE_ACTIONS,
  type GovernanceAction,
} from './governanceActions.js'
import { getStoredGoverningAreaId, resolveGoverningAreaId } from './resolveGoverningArea.js'

export type { GovernanceAction, ActionGrants } from './governanceActions.js'
export {
  canPerformGovernanceAction,
  normalizeActionGrants,
  isGovernanceAction,
  GOVERNANCE_ACTIONS,
} from './governanceActions.js'

/** super_admin o jefe con las cuatro acciones sobre el área gobernante. */
export function canGovernDriveFile(user: AuthedUser, governingAreaId: string | null): boolean {
  if (isSuperAdminUser(user)) return true
  if (!governingAreaId) return false
  if (user.managedAreaIds.includes(governingAreaId)) return true
  return GOVERNANCE_ACTIONS.every((action) =>
    canPerformGovernanceAction(user, action, governingAreaId),
  )
}

export async function resolveFileGoverningAreaId(
  fileId: string,
  _parentFolderId?: string | null,
): Promise<string | null> {
  const stored = await getStoredGoverningAreaId(fileId)
  if (stored !== undefined) return stored
  // Sin área en driveFiles: caminar desde el propio archivo o carpeta.
  // El padre de una carpeta raíz es la Unidad compartida y no tiene mapeo.
  return (await resolveGoverningAreaId(fileId)) ?? null
}

export const GOVERN_DRIVE_FORBIDDEN =
  'No tenés permiso para gestionar este archivo en su área gobernante'

export const governanceForbiddenMessage = (action: GovernanceAction): string => {
  switch (action) {
    case 'approval':
      return 'No tenés permiso para aprobar archivos en esta área'
    case 'permission_grant':
      return 'No tenés permiso para gestionar permisos de Drive en esta área'
    case 'classification_change':
      return 'No tenés permiso para cambiar la clasificación en esta área'
    case 'authorized_copy':
      return 'No tenés permiso para autorizar copias en esta área'
    default:
      return GOVERN_DRIVE_FORBIDDEN
  }
}
