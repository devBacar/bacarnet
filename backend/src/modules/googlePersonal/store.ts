import { Timestamp } from 'firebase-admin/firestore'
import { getEnv } from '../../config/env.js'
import { decryptSecret, encryptSecret } from '../../lib/crypto/secretBox.js'
import { adminDb } from '../../lib/firebase/admin.js'
import { GOOGLE_PERSONAL_INTEGRATIONS_COLLECTION } from './constants.js'

export interface GooglePersonalIntegrationRecord {
  encryptedRefreshToken: string
  scope: string
  googleEmail: string
  connectedAt: FirebaseFirestore.Timestamp
  updatedAt: FirebaseFirestore.Timestamp
}

function encryptionKey(): string {
  const key = getEnv().widgetsOAuthTokenEncryptionKey
  if (!key) {
    throw new Error('WIDGETS_OAUTH_TOKEN_ENCRYPTION_KEY no está configurado')
  }
  return key
}

export async function hasGooglePersonalIntegration(uid: string): Promise<boolean> {
  const snap = await adminDb()
    .collection(GOOGLE_PERSONAL_INTEGRATIONS_COLLECTION)
    .doc(uid)
    .get()
  return snap.exists && typeof snap.get('encryptedRefreshToken') === 'string'
}

export async function loadGoogleRefreshToken(uid: string): Promise<string | null> {
  const snap = await adminDb()
    .collection(GOOGLE_PERSONAL_INTEGRATIONS_COLLECTION)
    .doc(uid)
    .get()
  if (!snap.exists) return null
  const encrypted = snap.get('encryptedRefreshToken')
  if (typeof encrypted !== 'string' || !encrypted.trim()) return null
  try {
    return decryptSecret(encrypted, encryptionKey())
  } catch {
    return null
  }
}

export async function saveGooglePersonalIntegration(input: {
  uid: string
  refreshToken: string
  scope: string
  googleEmail: string
}): Promise<void> {
  const now = Timestamp.now()
  const encryptedRefreshToken = encryptSecret(input.refreshToken, encryptionKey())
  await adminDb()
    .collection(GOOGLE_PERSONAL_INTEGRATIONS_COLLECTION)
    .doc(input.uid)
    .set(
      {
        encryptedRefreshToken,
        scope: input.scope,
        googleEmail: input.googleEmail.trim().toLowerCase(),
        connectedAt: now,
        updatedAt: now,
      },
      { merge: true },
    )
}

export async function deleteGooglePersonalIntegration(uid: string): Promise<void> {
  await adminDb().collection(GOOGLE_PERSONAL_INTEGRATIONS_COLLECTION).doc(uid).delete()
}
