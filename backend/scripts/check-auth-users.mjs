import { getAuth } from 'firebase-admin/auth'
import { getAdminDb, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const email = 'implementaciones.it@bacarsa.com.ar'
const db = getAdminDb()
const auth = getAuth()

const q = await db.collection('users').where('email', '==', email).limit(1).get()
console.log('Firestore users:', q.empty ? 'NO' : `OK uid=${q.docs[0].id}`)

if (!q.empty) {
  const data = q.docs[0].data()
  console.log('role:', data.role)
  console.log('managedAreaIds:', data.managedAreaIds ?? null)
}

try {
  const byEmail = await auth.getUserByEmail(email)
  console.log('Auth by email: OK', byEmail.uid, 'disabled', byEmail.disabled, 'verified', byEmail.emailVerified)
  console.log('providers:', byEmail.providerData.map((p) => p.providerId).join(', ') || '(none)')
  console.log('lastSignIn:', byEmail.metadata.lastSignInTime)
} catch (err) {
  console.log('Auth by email: FAIL', err instanceof Error ? err.message : err)
}

if (!q.empty) {
  try {
    const byUid = await auth.getUser(q.docs[0].id)
    console.log('Auth by uid: OK', byUid.email)
  } catch (err) {
    console.log('Auth by uid: FAIL', err instanceof Error ? err.message : err)
  }
}

const apiKey = process.env.VITE_FIREBASE_API_KEY?.trim()
if (apiKey) {
  for (const password of [
    process.env.CHECK_PASSWORD?.trim(),
    'REDACTED',
    'REDACTED',
  ].filter(Boolean)) {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    )
    const body = await res.json().catch(() => ({}))
    console.log(
      `signInWithPassword (${password.slice(0, 12)}…):`,
      res.ok ? 'OK' : body.error?.message ?? res.status,
    )
  }
}
