import { isSuperAdminEmail, type UserRole } from '../services/userService'

/** Cuenta de servicio DWD (datos@) — oculta en listas de acceso. */
export const DRIVE_SERVICE_ACCOUNT_EMAIL = 'datos@bacarsa.com.ar'

/** Cuentas que no deben mostrarse en modales de permisos/acceso. */
export function isPrivilegedAccessIdentity(
  email: string | null | undefined,
  role?: UserRole | null,
): boolean {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  if (normalized === DRIVE_SERVICE_ACCOUNT_EMAIL) return true
  if (role === 'super_admin') return true
  return isSuperAdminEmail(normalized)
}
