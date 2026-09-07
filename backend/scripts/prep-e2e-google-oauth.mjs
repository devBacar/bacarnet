/**
 * Prepara cuenta de prueba para OAuth Google real: borra Auth + Firestore.
 * Después: login manual/automático en https://bacarnet.web.app con Google.
 *
 *   node backend/scripts/prep-e2e-google-oauth.mjs
 *   node backend/scripts/prep-e2e-google-oauth.mjs --verify
 */

import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadTestEnv } from './get-test-token.mjs'

const TEST_EMAIL = (
  process.env.E2E_GOOGLE_TEST_EMAIL?.trim() || 'visual.requester@bacarsa.com.ar'
).toLowerCase()

loadTestEnv()
if (!getApps().length) {
  const credPath = process.env.ADMIN_SDK_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS
  const sa = JSON.parse(readFileSync(resolve(credPath), 'utf8'))
  initializeApp({ credential: cert(sa), projectId: sa.project_id })
}

const auth = getAuth()
const db = getFirestore()
const verifyOnly = process.argv.includes('--verify')

async function main() {
  let uid = null
  try {
    const user = await auth.getUserByEmail(TEST_EMAIL)
    uid = user.uid
    console.log('Auth user:', {
      uid,
      email: user.email,
      providers: user.providerData.map((p) => p.providerId),
      created: user.metadata.creationTime,
    })
  } catch {
    console.log('Auth user: NO EXISTE (listo para primer OAuth Google)')
  }

  if (uid) {
    const snap = await db.collection('users').doc(uid).get()
    console.log('Firestore profile:', snap.exists ? { role: snap.get('role'), email: snap.get('email') } : 'NO EXISTE')
  }

  if (verifyOnly) return

  if (uid) {
    await db.collection('users').doc(uid).delete().catch(() => {})
    console.log(`Eliminado users/${uid}`)
    await auth.deleteUser(uid)
    console.log(`Eliminado Auth ${TEST_EMAIL}`)
  }

  await db.collection('pendingUserSetup').doc(TEST_EMAIL).delete().catch(() => {})
  console.log(`\nListo. Iniciá sesión con Google en prod usando: ${TEST_EMAIL}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
