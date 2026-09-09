/**
 * Prueba bootstrap-profile + intento de escalada contra API prod/local.
 *
 *   FUNCTIONS_API_BASE=https://bacarnet.web.app node backend/scripts/test-bootstrap-profile.mjs
 */

import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const base = process.env.FUNCTIONS_API_BASE?.trim() || 'https://bacarnet.web.app'

function initAdmin() {
  if (getApps().length > 0) return
  loadTestEnv()
  const credPath = process.env.ADMIN_SDK_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!credPath || !existsSync(resolve(credPath))) {
    throw new Error('ADMIN_SDK_KEY_PATH requerido')
  }
  const serviceAccount = JSON.parse(readFileSync(resolve(credPath), 'utf8'))
  initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id })
}

async function exchangeCustomToken(customToken) {
  const apiKey = process.env.VITE_FIREBASE_API_KEY?.trim()
  if (!apiKey) throw new Error('VITE_FIREBASE_API_KEY requerido en .env.local')
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  )
  const body = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(body))
  return body.idToken
}

function line(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

async function main() {
  initAdmin()
  const db = getFirestore()
  const auth = getAuth()

  const testEmail = `bootstrap-test-${Date.now()}@bacarsa.com.ar`
  const { requireTestAccountPassword } = await import('./lib/testSecrets.mjs')
  const user = await auth.createUser({
    email: testEmail,
    emailVerified: true,
    password: requireTestAccountPassword(),
  })
  const idToken = await exchangeCustomToken(await auth.createCustomToken(user.uid))

  let ok = true

  const bootstrap = await fetch(`${base}/api/users/bootstrap-profile`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: 'register',
      displayName: 'Bootstrap Test',
      department: 'General',
      birthDate: '1990-01-01',
    }),
  })
  const bootstrapBody = await bootstrap.json().catch(() => ({}))
  ok =
    line(
      bootstrap.status === 201 && bootstrapBody.created === true,
      'POST bootstrap-profile crea perfil',
      `status ${bootstrap.status}`,
    ) && ok

  const snap = await db.collection('users').doc(user.uid).get()
  ok =
    line(
      snap.exists && snap.get('role') === 'user' && snap.get('permissions')?.super_admin !== true,
      'Perfil creado sin super_admin',
      `role=${snap.get('role')}`,
    ) && ok

  const bootstrap2 = await fetch(`${base}/api/users/bootstrap-profile`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ source: 'google' }),
  })
  const bootstrap2Body = await bootstrap2.json().catch(() => ({}))
  ok =
    line(
      bootstrap2.status === 200 && bootstrap2Body.created === false,
      'bootstrap idempotente (segunda llamada)',
      `status ${bootstrap2.status}`,
    ) && ok

  await auth.deleteUser(user.uid)
  await db.collection('users').doc(user.uid).delete().catch(() => {})

  if (!ok) process.exit(1)
  console.log('\nOK: bootstrap-profile funciona en', base)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
