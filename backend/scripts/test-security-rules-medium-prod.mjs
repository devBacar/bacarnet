/**
 * Evidencia prod: puntos 7–9 (externas, isAdmin, permisos reales).
 *
 *   node backend/scripts/test-security-rules-medium-prod.mjs
 */

import { initializeApp } from 'firebase/app'
import { getAuth, signInWithCustomToken } from 'firebase/auth'
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  collection,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { initializeApp as initAdminApp, getApps, cert } from 'firebase-admin/app'
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
  const serviceAccount = JSON.parse(readFileSync(resolve(credPath), 'utf8'))
  initAdminApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id })
}

function loadWebConfig() {
  loadTestEnv()
  const envPath = resolve(ROOT, '.env.local')
  if (!existsSync(envPath)) throw new Error('.env.local requerido')
  const raw = readFileSync(envPath, 'utf8')
  const config = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('***REMOVED***')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    config[key] = value
  }
  return {
    apiKey: config.VITE_FIREBASE_API_KEY,
    authDomain: config.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: config.VITE_FIREBASE_PROJECT_ID,
  }
}

async function signInAs(authAdmin, uid) {
  const customToken = await authAdmin.createCustomToken(uid)
  return customToken
}

function line(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

async function expectDenied(label, fn) {
  try {
    await fn()
    line(false, label, 'operación permitida cuando debía fallar')
    return false
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : String(err)
    if (code.includes('permission-denied') || code.includes('PERMISSION_DENIED')) {
      line(true, label, code)
      return true
    }
    line(false, label, code)
    return false
  }
}

async function expectAllowed(label, fn) {
  try {
    await fn()
    line(true, label)
    return true
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : String(err)
    line(false, label, code)
    return false
  }
}

async function main() {
  initAdmin()
  const adminAuth = getAdminAuth()
  const adminDb = getAdminFirestore()
  const webConfig = loadWebConfig()
  const ts = Date.now()

  const externalNoDirEmail = `ext-no-dir-${ts}@example.com`
  const externalWithDirEmail = `ext-with-dir-${ts}@example.com`
  const corpNoNewsEmail = `corp-no-news-${ts}@bacarsa.com.ar`

  const externalNoDir = await adminAuth.createUser({
    email: externalNoDirEmail,
    emailVerified: true,
  })
  const externalWithDir = await adminAuth.createUser({
    email: externalWithDirEmail,
    emailVerified: true,
  })
  const corpNoNews = await adminAuth.createUser({
    email: corpNoNewsEmail,
    emailVerified: true,
  })

  await adminDb.collection('users').doc(externalNoDir.uid).set({
    email: externalNoDirEmail,
    displayName: 'External No Dir',
    role: 'user',
    accountType: 'external',
    accountStatus: 'active',
    permissions: {
      view_directory: false,
      view_drive: false,
      view_links: false,
      manage_news: false,
      manage_links: false,
      manage_users: false,
      super_admin: false,
    },
  })

  await adminDb.collection('users').doc(externalWithDir.uid).set({
    email: externalWithDirEmail,
    displayName: 'External With Dir',
    role: 'user',
    accountType: 'external',
    accountStatus: 'active',
    permissions: {
      view_directory: true,
      view_drive: false,
      view_links: false,
      manage_news: false,
      manage_links: false,
      manage_users: false,
      super_admin: false,
    },
  })

  await adminDb.collection('users').doc(corpNoNews.uid).set({
    email: corpNoNewsEmail,
    displayName: 'Corp No News',
    role: 'user',
    accountType: 'corporate',
    accountStatus: 'active',
    permissions: {
      view_directory: true,
      view_drive: true,
      view_links: true,
      manage_news: false,
      manage_links: false,
      manage_users: false,
      super_admin: false,
    },
  })

  const contactSnap = await adminDb.collection('contacts').limit(1).get()
  const contactId = contactSnap.empty ? null : contactSnap.docs[0].id

  const results = []

  console.log('\n=== Punto 7: externas — lectura mínima ===\n')

  {
    const app = initializeApp(webConfig, 'ext-no-dir')
    const auth = getAuth(app)
    const db = getFirestore(app)
    const token = await signInAs(adminAuth, externalNoDir.uid)
    await signInWithCustomToken(auth, token)

    if (contactId) {
      results.push(
        await expectDenied('7a  external sin view_directory NO lee contacts', () =>
          getDoc(doc(db, 'contacts', contactId)),
        ),
      )
    }

    results.push(
      await expectDenied('7b  external NO lee global_settings/main', () =>
        getDoc(doc(db, 'global_settings', 'main')),
      ),
    )

    results.push(
      await expectDenied('7c  external NO lee news', () =>
        getDoc(doc(db, 'news', 'dummy-doc-id')),
      ),
    )

    results.push(
      await expectAllowed('7d  external lee su propio users/{uid}', () =>
        getDoc(doc(db, 'users', externalNoDir.uid)),
      ),
    )
  }

  {
    const app = initializeApp(webConfig, 'ext-with-dir')
    const auth = getAuth(app)
    const db = getFirestore(app)
    const token = await signInAs(adminAuth, externalWithDir.uid)
    await signInWithCustomToken(auth, token)

    if (contactId) {
      results.push(
        await expectAllowed('7e  external con view_directory SÍ lee contacts', () =>
          getDoc(doc(db, 'contacts', contactId)),
        ),
      )
    } else {
      results.push(line(true, '7e  external con view_directory (skip — sin contacts en prod)'))
    }
  }

  console.log('\n=== Punto 9: sin isAdmin() — permisos desde Firestore ===\n')

  {
    const app = initializeApp(webConfig, 'corp-no-news')
    const auth = getAuth(app)
    const db = getFirestore(app)
    const token = await signInAs(adminAuth, corpNoNews.uid)
    await signInWithCustomToken(auth, token)

    results.push(
      await expectDenied('9a  corporativo sin manage_news NO crea news', () =>
        addDoc(collection(db, 'news'), {
          title: 'Hack',
          content: 'x',
          createdAt: serverTimestamp(),
        }),
      ),
    )

    results.push(
      await expectDenied('9b  corporativo común NO lista users', () =>
        getDocs(collection(db, 'users')),
      ),
    )
  }

  // super_admin real sigue pudiendo escribir news
  process.env.TEST_EMAIL = 'admin@bacarsa.com.ar'
  const { getTestIdToken } = await import('./get-test-token.mjs')
  const superAdmin = await getTestIdToken()
  const superApp = initializeApp(webConfig, 'super-admin')
  const superAuth = getAuth(superApp)
  const superDb = getFirestore(superApp)
  await signInWithCustomToken(superAuth, await signInAs(adminAuth, superAdmin.uid))

  results.push(
    await expectAllowed('9c  super_admin (permiso real) crea news', () =>
      addDoc(collection(superDb, 'news'), {
        title: `Rules test ${ts}`,
        content: 'E2E medium security',
        createdAt: serverTimestamp(),
        author: 'admin@bacarsa.com.ar',
      }),
    ),
  )

  // cleanup test users
  for (const uid of [externalNoDir.uid, externalWithDir.uid, corpNoNews.uid]) {
    await adminDb.collection('users').doc(uid).delete().catch(() => {})
    await adminAuth.deleteUser(uid).catch(() => {})
  }

  const failed = results.filter((ok) => !ok).length
  if (failed > 0) {
    console.log(`\n${failed} chequeo(s) fallaron.`)
    process.exit(1)
  }
  console.log('\nOK: reglas medium (7 y 9) verificadas en prod.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
