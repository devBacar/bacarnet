/**
 * Intenta escalada vía Firestore cliente en prod (debe fallar tras rules fix).
 *
 *   node backend/scripts/test-users-escalation-prod.mjs
 */

import { initializeApp } from 'firebase/app'
import { getAuth, signInWithCustomToken } from 'firebase/auth'
import { getFirestore, doc, setDoc } from 'firebase/firestore'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { initializeApp as initAdminApp, getApps, cert } from 'firebase-admin/app'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

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

async function main() {
  initAdmin()
  const adminAuth = getAdminAuth()
  const email = `escalation-test-${Date.now()}@bacarsa.com.ar`
  const user = await adminAuth.createUser({ email, emailVerified: true })
  const customToken = await adminAuth.createCustomToken(user.uid)

  const webConfig = loadWebConfig()
  const app = initializeApp(webConfig, 'escalation-test')
  const auth = getAuth(app)
  const db = getFirestore(app)

  await signInWithCustomToken(auth, customToken)

  let blocked = false
  try {
    await setDoc(doc(db, 'users', user.uid), {
      email,
      displayName: 'Escalation Test',
      role: 'super_admin',
      permissions: { super_admin: true, manage_users: true },
    })
  } catch (err) {
    blocked = true
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : String(err)
    console.log('PASS  setDoc users bloqueado por rules —', code)
  }

  if (!blocked) {
    console.log('FAIL  setDoc users NO fue bloqueado — escalada posible')
    process.exit(1)
  }

  await adminAuth.deleteUser(user.uid)
  console.log('\nOK: escalada Firestore cliente bloqueada en producción.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
