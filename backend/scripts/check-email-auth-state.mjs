/** Chequea si emails existen en Auth y Firestore. */
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
if (!getApps().length) {
  const credPath = process.env.ADMIN_SDK_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS
  const sa = JSON.parse(readFileSync(resolve(credPath), 'utf8'))
  initializeApp({ credential: cert(sa), projectId: sa.project_id })
}

const emails = process.argv.slice(2)
if (emails.length === 0) {
  emails.push(
    'visual.requester@bacarsa.com.ar',
    'contable@bacarsa.com.ar',
    'ivan.barrera@bacarsa.com.ar',
    'implementaciones.it@bacarsa.com.ar',
  )
}

const auth = getAuth()
const db = getFirestore()

for (const email of emails) {
  const normalized = email.toLowerCase()
  let authInfo = 'NO_AUTH'
  try {
    const u = await auth.getUserByEmail(normalized)
    authInfo = `AUTH uid=${u.uid} providers=${u.providerData.map((p) => p.providerId).join(',')}`
  } catch {
    // no auth
  }
  const q = await db.collection('users').where('email', '==', normalized).limit(1).get()
  const profile = q.empty ? 'NO_PROFILE' : `PROFILE uid=${q.docs[0].id} role=${q.docs[0].get('role')}`
  console.log(`${normalized}: ${authInfo} | ${profile}`)
}
