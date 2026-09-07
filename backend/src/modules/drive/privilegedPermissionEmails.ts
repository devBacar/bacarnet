import { adminDb } from '../../lib/firebase/admin.js'
import { getEnv } from '../../config/env.js'

/** Cuenta de servicio + super_admin: ocultos en el modal de permisos para todos los roles. */
export async function resolvePrivilegedPermissionEmails(): Promise<Set<string>> {
  const { driveImpersonateEmail } = getEnv()
  const privileged = new Set<string>([driveImpersonateEmail])

  const snap = await adminDb().collection('users').where('role', '==', 'super_admin').get()
  for (const doc of snap.docs) {
    const email = doc.get('email')
    if (typeof email === 'string' && email.trim().length > 0) {
      privileged.add(email.trim().toLowerCase())
    }
  }

  return privileged
}

export function isPrivilegedPermissionEmail(
  email: string,
  privilegedEmails: Set<string>,
): boolean {
  return privilegedEmails.has(email.trim().toLowerCase())
}
