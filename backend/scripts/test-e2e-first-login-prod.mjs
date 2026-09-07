/**
 * E2E prod: primer login (flujo Google post-OAuth) + pendingUserSetup.
 *
 * Replica la secuencia exacta del cliente (AuthContext.loginWithGoogle / registerUser):
 *   1. bootstrap-profile (Admin SDK)
 *   2. apply-pending-setup (si created)
 *
 *   node backend/scripts/test-e2e-first-login-prod.mjs
 *   node backend/scripts/test-e2e-first-login-prod.mjs --google-only
 *   node backend/scripts/test-e2e-first-login-prod.mjs --pending-only
 */

import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const base = process.env.FUNCTIONS_API_BASE?.trim() || 'https://bacarnet.web.app'
const TEST_AREA_ID = 'a36R9jwN4m47Ftn3wGCp' // Operaciones (catálogo folders)

const googleOnly = process.argv.includes('--google-only')
const pendingOnly = process.argv.includes('--pending-only')

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

async function cleanupUser(auth, db, uid, email) {
  await auth.deleteUser(uid).catch(() => {})
  await db.collection('users').doc(uid).delete().catch(() => {})
  if (email) {
    await db.collection('pendingUserSetup').doc(email.trim().toLowerCase()).delete().catch(() => {})
  }
}

async function clientGoogleFirstLogin(idToken, displayName) {
  const bootstrap = await fetch(`${base}/api/users/bootstrap-profile`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: 'google',
      displayName,
    }),
  })
  const bootstrapBody = await bootstrap.json().catch(() => ({}))

  let pendingBody = null
  if (bootstrap.status === 201 && bootstrapBody.created === true) {
    const pending = await fetch(`${base}/api/users/apply-pending-setup`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    })
    pendingBody = await pending.json().catch(() => ({}))
    if (!pending.ok) {
      throw new Error(`apply-pending-setup ${pending.status}: ${JSON.stringify(pendingBody)}`)
    }
  }

  return { bootstrap, bootstrapBody, pendingBody }
}

async function testGoogleFirstLogin(auth, db) {
  console.log('\n=== 1. Primer login Google (secuencia cliente post-OAuth) ===\n')

  const testEmail = `e2e-google-first-${Date.now()}@bacarsa.com.ar`
  const displayName = 'E2E Google First Login'

  const user = await auth.createUser({
    email: testEmail,
    emailVerified: true,
    displayName,
  })

  let ok = true
  try {
    const idToken = await exchangeCustomToken(await auth.createCustomToken(user.uid))
    const { bootstrap, bootstrapBody } = await clientGoogleFirstLogin(idToken, displayName)

    ok =
      line(
        bootstrap.status === 201 && bootstrapBody.created === true,
        'bootstrap-profile (source=google) crea perfil',
        `status ${bootstrap.status}`,
      ) && ok

    const snap = await db.collection('users').doc(user.uid).get()
    ok =
      line(
        snap.exists &&
          snap.get('role') === 'user' &&
          snap.get('permissions')?.super_admin !== true &&
          snap.get('accountType') === 'corporate' &&
          snap.get('accountStatus') === 'active',
        'Perfil corporativo default sin super_admin',
        `role=${snap.get('role')} accountType=${snap.get('accountType')}`,
      ) && ok

    ok =
      line(
        snap.get('department') === 'General',
        'department=General (Google bootstrap)',
        String(snap.get('department')),
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
        'Segunda llamada idempotente (perfil ya existía)',
        `status ${bootstrap2.status}`,
      ) && ok
  } finally {
    await cleanupUser(auth, db, user.uid, testEmail)
  }

  return ok
}

async function testPendingUserSetup(auth, db) {
  console.log('\n=== 2. pendingUserSetup aplicado en primer login ===\n')

  const testEmail = `e2e-pending-first-${Date.now()}@bacarsa.com.ar`
  const displayName = 'E2E Pending Setup'

  const pendingDoc = {
    email: testEmail,
    role: 'admin',
    managedAreaIds: [TEST_AREA_ID],
    memberAreaIds: [TEST_AREA_ID],
    permissions: {
      view_directory: true,
      view_drive: false,
    },
    note: 'E2E pendingUserSetup prod test',
    createdByEmail: 'admin@bacarsa.com.ar',
    createdByUid: 'e2e-test',
    applied: false,
    createdAt: FieldValue.serverTimestamp(),
  }

  await db.collection('pendingUserSetup').doc(testEmail).set(pendingDoc)

  const user = await auth.createUser({
    email: testEmail,
    emailVerified: true,
    displayName,
  })

  let ok = true
  try {
    const idToken = await exchangeCustomToken(await auth.createCustomToken(user.uid))
    const { bootstrap, bootstrapBody, pendingBody } = await clientGoogleFirstLogin(
      idToken,
      displayName,
    )

    ok =
      line(
        bootstrap.status === 201 && bootstrapBody.created === true,
        'bootstrap crea perfil base antes de pending',
        `status ${bootstrap.status}`,
      ) && ok

    ok =
      line(
        pendingBody?.applied === true,
        'apply-pending-setup aplicó configuración',
        JSON.stringify(pendingBody),
      ) && ok

    const snap = await db.collection('users').doc(user.uid).get()
    const managed = snap.get('managedAreaIds') ?? []
    const member = snap.get('memberAreaIds') ?? []

    ok =
      line(snap.get('role') === 'admin', 'role=admin desde pending', String(snap.get('role'))) &&
      ok
    ok =
      line(
        Array.isArray(managed) && managed.includes(TEST_AREA_ID),
        'managedAreaIds incluye área de prueba',
        JSON.stringify(managed),
      ) && ok
    ok =
      line(
        Array.isArray(member) && member.includes(TEST_AREA_ID),
        'memberAreaIds incluye área de prueba',
        JSON.stringify(member),
      ) && ok
    ok =
      line(
        snap.get('permissions')?.view_drive === false &&
          snap.get('permissions')?.view_directory === true,
        'permissions parciales desde pending',
        JSON.stringify(snap.get('permissions')),
      ) && ok

    const pendingSnap = await db.collection('pendingUserSetup').doc(testEmail).get()
    ok =
      line(
        pendingSnap.get('applied') === true && pendingSnap.get('appliedToUid') === user.uid,
        'pendingUserSetup marcado applied',
        `appliedToUid=${pendingSnap.get('appliedToUid')}`,
      ) && ok

    const pending2 = await fetch(`${base}/api/users/apply-pending-setup`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    })
    const pending2Body = await pending2.json().catch(() => ({}))
    ok =
      line(
        pending2Body.applied === false && pending2Body.reason === 'already_applied',
        'Re-aplicar pending es idempotente',
        JSON.stringify(pending2Body),
      ) && ok
  } finally {
    await cleanupUser(auth, db, user.uid, testEmail)
  }

  return ok
}

async function main() {
  initAdmin()
  const auth = getAuth()
  const db = getFirestore()

  const results = []
  if (!pendingOnly) results.push(await testGoogleFirstLogin(auth, db))
  if (!googleOnly) results.push(await testPendingUserSetup(auth, db))

  if (results.some((ok) => !ok)) {
    console.log('\nFAIL: algún chequeo E2E falló.')
    process.exit(1)
  }

  console.log('\nOK: E2E primer login + pendingUserSetup verificados en', base)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
