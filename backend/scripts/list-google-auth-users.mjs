/** Usuarios Auth con provider google.com (candidatos E2E). */
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

const auth = getAuth()
const db = getFirestore()

let pageToken
const googleUsers = []
do {
  const res = await auth.listUsers(1000, pageToken)
  for (const u of res.users) {
    const email = (u.email || '').toLowerCase()
    if (!email.endsWith('@bacarsa.com.ar')) continue
    const hasGoogle = u.providerData.some((p) => p.providerId === 'google.com')
    if (!hasGoogle) continue
    const snap = await db.collection('users').doc(u.uid).get()
    googleUsers.push({
      uid: u.uid,
      email,
      profile: snap.exists,
      role: snap.exists ? snap.get('role') : null,
      lastSignIn: u.metadata.lastSignInTime,
      created: u.metadata.creationTime,
    })
  }
  pageToken = res.pageToken
} while (pageToken)

console.log(`Usuarios Google @bacarsa.com.ar: ${googleUsers.length}`)
for (const u of googleUsers.slice(0, 20)) console.log(JSON.stringify(u))
