/**
 * E2E prod: primer login Google REAL vía signInWithIdp (access token DWD).
 * Crea usuario Auth con provider google.com — igual que OAuth popup.
 *
 *   node backend/scripts/test-e2e-google-oauth-real.mjs
 */

import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const base = process.env.FUNCTIONS_API_BASE?.trim() || 'https://bacarnet.web.app'
const TEST_EMAIL = (
  process.env.E2E_GOOGLE_TEST_EMAIL?.trim() || 'visual.requester@bacarsa.com.ar'
).toLowerCase()
const TEST_AREA_ID = 'a36R9jwN4m47Ftn3wGCp'

const GOOGLE_USERINFO_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]

function line(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

function initAdmin() {
  if (getApps().length > 0) return
  loadTestEnv()
  const credPath = process.env.ADMIN_SDK_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS
  const serviceAccount = JSON.parse(readFileSync(resolve(credPath), 'utf8'))
  initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id })
}

async function cleanup(auth, db, uid) {
  if (uid) {
    await db.collection('users').doc(uid).delete().catch(() => {})
    await auth.deleteUser(uid).catch(() => {})
  }
  await db.collection('pendingUserSetup').doc(TEST_EMAIL).delete().catch(() => {})
}

async function signInWithGoogleIdp(accessToken) {
  const apiKey = process.env.VITE_FIREBASE_API_KEY?.trim()
  if (!apiKey) throw new Error('VITE_FIREBASE_API_KEY requerido')

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postBody: `access_token=${encodeURIComponent(accessToken)}&providerId=google.com`,
        requestUri: 'https://bacarnet.web.app',
        returnIdpCredential: true,
        returnSecureToken: true,
      }),
    },
  )
  const body = await res.json()
  if (!res.ok) {
    throw new Error(`signInWithIdp ${res.status}: ${JSON.stringify(body)}`)
  }
  return body
}

async function clientPostLogin(idToken, displayName) {
  const bootstrap = await fetch(`${base}/api/users/bootstrap-profile`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ source: 'google', displayName }),
  })
  const bootstrapBody = await bootstrap.json().catch(() => ({}))
  if (!bootstrap.ok) {
    throw new Error(`bootstrap ${bootstrap.status}: ${JSON.stringify(bootstrapBody)}`)
  }

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
      throw new Error(`apply-pending ${pending.status}: ${JSON.stringify(pendingBody)}`)
    }
  }

  return { bootstrap, bootstrapBody, pendingBody }
}

async function main() {
  initAdmin()
  loadTestEnv()

  const driveKeyPath = process.env.DRIVE_SERVICE_ACCOUNT_KEY_PATH?.trim()
  if (driveKeyPath && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = driveKeyPath
  }

  const auth = getAuth()
  const db = getFirestore()

  let existingUid = null
  try {
    existingUid = (await auth.getUserByEmail(TEST_EMAIL)).uid
  } catch {
    // no existe — ideal para primer login
  }

  if (existingUid) {
    console.log(`Limpiando Auth+Firestore previo para ${TEST_EMAIL} (${existingUid})`)
    await cleanup(auth, db, existingUid)
  }

  const { exchangeDwdAccessToken } = await import(
    pathToFileURL(resolve(ROOT, 'backend/lib/lib/google/dwdIamAuth.js')).href
  )

  const saEmail =
    process.env.DRIVE_SERVICE_ACCOUNT_EMAIL?.trim() ||
    'datos-drive-sa@bacar-web.iam.gserviceaccount.com'

  console.log(`\n=== E2E Google OAuth real: ${TEST_EMAIL} ===\n`)

  let ok = true
  let uid = null

  try {
    const { access_token: googleAccessToken } = await exchangeDwdAccessToken(
      saEmail,
      TEST_EMAIL,
      GOOGLE_USERINFO_SCOPES,
    )

    ok = line(Boolean(googleAccessToken), 'Token Google (DWD) para usuario de prueba') && ok

    const signIn = await signInWithGoogleIdp(googleAccessToken)
    uid = signIn.localId
    const idToken = signIn.idToken
    const provider = signIn.providerId ?? signIn.federatedId ?? 'google.com'

    ok =
      line(
        Boolean(uid) && Boolean(idToken),
        'signInWithIdp crea sesión Firebase (provider Google)',
        `uid=${uid} provider=${provider}`,
      ) && ok

    const authUser = await auth.getUser(uid)
    ok =
      line(
        authUser.providerData.some((p) => p.providerId === 'google.com'),
        'Auth user tiene provider google.com',
        authUser.providerData.map((p) => p.providerId).join(','),
      ) && ok

    ok =
      line(
        !(await db.collection('users').doc(uid).get()).exists,
        'Sin perfil Firestore antes de bootstrap (primer login)',
      ) && ok

    const displayName = authUser.displayName || TEST_EMAIL.split('@')[0]
    const { bootstrap, bootstrapBody } = await clientPostLogin(idToken, displayName)

    ok =
      line(
        bootstrap.status === 201 && bootstrapBody.created === true,
        'bootstrap-profile post-Google crea perfil',
        `status ${bootstrap.status}`,
      ) && ok

    const snap = await db.collection('users').doc(uid).get()
    ok =
      line(
        snap.exists &&
          snap.get('role') === 'user' &&
          snap.get('permissions')?.super_admin !== true &&
          snap.get('email') === TEST_EMAIL,
        'Perfil role=user sin escalada',
        `role=${snap.get('role')}`,
      ) && ok

    // Segundo login Google (idempotente)
    const signIn2 = await signInWithGoogleIdp(googleAccessToken)
    const bootstrap2 = await fetch(`${base}/api/users/bootstrap-profile`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signIn2.idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ source: 'google' }),
    })
    const bootstrap2Body = await bootstrap2.json().catch(() => ({}))
    ok =
      line(
        bootstrap2.status === 200 && bootstrap2Body.created === false,
        'Segundo login Google no recrea perfil',
        `status ${bootstrap2.status}`,
      ) && ok
  } catch (err) {
    line(false, 'E2E Google OAuth', err instanceof Error ? err.message : String(err))
    ok = false
  } finally {
    if (uid) {
      console.log(`\nLimpieza: borrando usuario de prueba ${uid}`)
      await cleanup(auth, db, uid)
    }
  }

  if (!ok) {
    console.log('\nFAIL: E2E Google OAuth real')
    process.exit(1)
  }

  console.log('\nOK: primer login Google real verificado en prod')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
