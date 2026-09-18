import { getEnv, isEmailInAllowedDomain } from '../../config/env.js'
import { adminDb } from '../../lib/firebase/admin.js'
import { resolveUidByEmail } from '../notifications/resolveRecipients.js'

export async function resolveColaboradorProfileByEmail(email: string): Promise<{
  email: string
  uid: string | null
  nombre: string
} | null> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null
  const domain = getEnv().allowedEmailDomain
  if (!isEmailInAllowedDomain(normalized, domain)) return null

  const uid = await resolveUidByEmail(normalized)
  if (uid) {
    const snap = await adminDb().collection('users').doc(uid).get()
    if (snap.exists) {
      const data = snap.data() ?? {}
      const displayName =
        typeof data.displayName === 'string' && data.displayName.trim()
          ? data.displayName.trim()
          : null
      return {
        email: normalized,
        uid,
        nombre: displayName ?? normalized.split('@')[0] ?? normalized,
      }
    }
  }

  return {
    email: normalized,
    uid: null,
    nombre: normalized.split('@')[0] ?? normalized,
  }
}
