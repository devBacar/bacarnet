/**
 * Evidencia prod: driveFiles lectura, auditLogs create, contenido sin email verificado.
 *
 *   node backend/scripts/test-security-rules-prod.mjs
 */

import { initializeApp } from 'firebase/app'
import { getAuth, signInWithCustomToken } from 'firebase/auth'
import {
  getFirestore,
  doc,
  getDoc,
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

async function main() {
  initAdmin()
  const adminAuth = getAdminAuth()
  const adminDb = getAdminFirestore()
  const webConfig = loadWebConfig()

  const sampleDriveFile = await adminDb.collection('driveFiles').limit(1).get()
  const driveFileId = sampleDriveFile.empty ? null : sampleDriveFile.docs[0].id

  const sampleNews = await adminDb.collection('news').limit(1).get()
  const newsId = sampleNews.empty ? null : sampleNews.docs[0].id

  const unverifiedEmail = `unverified-rules-${Date.now()}@bacarsa.com.ar`
  const unverifiedUser = await adminAuth.createUser({
    email: unverifiedEmail,
    emailVerified: false,
  })
  const unverifiedToken = await adminAuth.createCustomToken(unverifiedUser.uid)

  const verifiedEmail = `verified-rules-${Date.now()}@bacarsa.com.ar`
  const verifiedUser = await adminAuth.createUser({
    email: verifiedEmail,
    emailVerified: true,
  })
  const verifiedToken = await adminAuth.createCustomToken(verifiedUser.uid)

  const results = []

  // Usuario sin email verificado
  {
    const app = initializeApp(webConfig, 'unverified-rules')
    const auth = getAuth(app)
    const db = getFirestore(app)
    await signInWithCustomToken(auth, unverifiedToken)

    if (driveFileId) {
      results.push(
        await expectDenied(`driveFiles/${driveFileId} lectura (no verificado)`, () =>
          getDoc(doc(db, 'driveFiles', driveFileId)),
        ),
      )
    } else {
      results.push(line(true, 'driveFiles lectura (skip — sin docs en prod)'))
    }

    results.push(
      await expectDenied('auditLogs create (no verificado)', () =>
        addDoc(collection(db, 'auditLogs'), {
          userId: unverifiedUser.uid,
          userEmail: unverifiedEmail,
          action: 'fake',
          targetType: 'file',
          targetId: 'x',
          targetName: 'x',
          parentFolderId: null,
          mimeType: null,
          reason: null,
          metadata: {},
          createdAt: serverTimestamp(),
        }),
      ),
    )

    if (newsId) {
      results.push(
        await expectDenied(`news/${newsId} lectura (no verificado)`, () =>
          getDoc(doc(db, 'news', newsId)),
        ),
      )
    } else {
      results.push(line(true, 'news lectura no verificado (skip — sin docs)'))
    }
  }

  // Usuario corporativo verificado (audit/driveFiles siguen bloqueados)
  {
    const app = initializeApp(webConfig, 'verified-rules')
    const auth = getAuth(app)
    const db = getFirestore(app)
    await signInWithCustomToken(auth, verifiedToken)

    if (driveFileId) {
      results.push(
        await expectDenied(`driveFiles/${driveFileId} lectura (verificado)`, () =>
          getDoc(doc(db, 'driveFiles', driveFileId)),
        ),
      )
    }

    results.push(
      await expectDenied('auditLogs create (verificado corporativo)', () =>
        addDoc(collection(db, 'auditLogs'), {
          userId: verifiedUser.uid,
          userEmail: verifiedEmail,
          action: 'fake',
          targetType: 'file',
          targetId: 'x',
          targetName: 'x',
          parentFolderId: null,
          mimeType: null,
          reason: null,
          metadata: {},
          createdAt: serverTimestamp(),
        }),
      ),
    )

    if (newsId) {
      try {
        await getDoc(doc(db, 'news', newsId))
        results.push(line(true, `news/${newsId} lectura (verificado corporativo)`))
      } catch (err) {
        const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : String(err)
        results.push(line(false, `news/${newsId} lectura (verificado corporativo)`, code))
      }
    }
  }

  await adminAuth.deleteUser(unverifiedUser.uid)
  await adminAuth.deleteUser(verifiedUser.uid)

  const failed = results.filter((ok) => !ok).length
  if (failed > 0) {
    console.log(`\n${failed} chequeo(s) fallaron.`)
    process.exit(1)
  }
  console.log('\nOK: reglas de seguridad (driveFiles, auditLogs, email_verified) verificadas en prod.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
