import type { AuthedUser } from '../../../auth/middleware.js'
import { isSuperAdminUser } from '../../../auth/middleware.js'

export function isFinanzasCajaLider(user: AuthedUser): boolean {
  if (isSuperAdminUser(user)) return true
  return user.permissions.manage_finanzas_caja === true
}

/** Líder o usuario con view_finanzas (acceso amplio al módulo Finanzas). */
export function canBrowseAllCajas(user: AuthedUser): boolean {
  return isFinanzasCajaLider(user) || user.permissions.view_finanzas === true
}

export function canAccessCaja(user: AuthedUser, responsableUid: string): boolean {
  if (canBrowseAllCajas(user)) return true
  return user.uid === responsableUid
}

/** Cerrar la caja: el responsable, el líder de cajas o un super admin. Ver Finanzas no alcanza. */
export function puedeCerrarCaja(user: AuthedUser, responsableUid: string): boolean {
  if (isFinanzasCajaLider(user)) return true
  return user.uid === responsableUid
}
