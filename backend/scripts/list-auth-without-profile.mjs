/** Lista usuarios Auth @bacarsa.com.ar sin perfil Firestore. */
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
const orphans = []
do {
  const res = await auth.listUsers(1000, pageToken)
  for (const u of res.users) {
    const email = (u.email || '').toLowerCase()
    if (!email.endsWith('@bacarsa.com.ar')) continue
    const snap = await db.collection('users').doc(u.uid).get()
    if (!snap.exists) {
      orphans.push({
        uid: u.uid,
        email,
        providers: u.providerData.map((p) => p.providerId),
        created: u.metadata.creationTime,
      })
    }
  }
  pageToken = res.pageToken
} while (pageToken)

console.log(`Auth sin perfil Firestore (@bacarsa.com.ar): ${orphans.length}`)
for (const o of orphans) console.log(JSON.stringify(o))
