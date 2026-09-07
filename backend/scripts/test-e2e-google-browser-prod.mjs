/**
 * Resetea cuenta Workspace para primer login Google, verifica resultado, restaura backup.
 *
 *   node backend/scripts/test-e2e-google-browser-prod.mjs --prep
 *   ***REMOVED*** completar OAuth Google en https://bacarnet.web.app
 *   node backend/scripts/test-e2e-google-browser-prod.mjs --verify
 *   node backend/scripts/test-e2e-google-browser-prod.mjs --restore
 */

import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TEST_EMAIL = (
  process.env.E2E_GOOGLE_TEST_EMAIL?.trim() || 'implementaciones.it@bacarsa.com.ar'
).toLowerCase()
const BACKUP_PATH = resolve(ROOT, 'backend/.tmp/e2e-google-backup.json')

function initAdmin() {
  if (getApps().length > 0) return
  loadTestEnv()
  const credPath = process.env.ADMIN_SDK_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS
  const serviceAccount = JSON.parse(readFileSync(resolve(credPath), 'utf8'))
  initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id })
}

function line(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

async function loadBackup() {
  if (!existsSync(BACKUP_PATH)) return null
  return JSON.parse(readFileSync(BACKUP_PATH, 'utf8'))
}

async function prep(auth, db) {
  const user = await auth.getUserByEmail(TEST_EMAIL)
  const profileSnap = await db.collection('users').doc(user.uid).get()
  mkdirSync(dirname(BACKUP_PATH), { recursive: true })
  writeFileSync(
    BACKUP_PATH,
    JSON.stringify(
      {
        email: TEST_EMAIL,
        uid: user.uid,
        auth: {
          displayName: user.displayName,
          emailVerified: user.emailVerified,
          providerData: user.providerData,
        },
        profile: profileSnap.exists ? profileSnap.data() : null,
      },
      null,
      2,
    ),
  )
  if (profileSnap.exists) await db.collection('users').doc(user.uid).delete()
  await auth.deleteUser(user.uid)
  console.log(`Backup en ${BACKUP_PATH}`)
  console.log(`Eliminado Auth+Firestore para ${TEST_EMAIL}`)
  console.log('\nAhora: https://bacarnet.web.app → Continuar con Google →', TEST_EMAIL)
}

async function verify(auth, db) {
  let ok = true
  let user
  try {
    user = await auth.getUserByEmail(TEST_EMAIL)
  } catch {
    line(false, 'Usuario Auth recreado por Google OAuth')
    process.exit(1)
  }

  ok =
    line(
      user.providerData.some((p) => p.providerId === 'google.com'),
      'Auth recreado con provider google.com',
      user.providerData.map((p) => p.providerId).join(','),
    ) && ok

  const snap = await db.collection('users').doc(user.uid).get()
  ok = line(snap.exists, 'Perfil Firestore creado tras primer login Google') && ok
  ok =
    line(
      snap.get('role') === 'user' && snap.get('permissions')?.super_admin !== true,
      'Perfil role=user sin escalada',
      `role=${snap.get('role')}`,
    ) && ok
  ok =
    line(
      snap.get('email') === TEST_EMAIL && snap.get('accountType') === 'corporate',
      'Perfil corporativo activo',
      `accountType=${snap.get('accountType')}`,
    ) && ok

  if (!ok) process.exit(1)
  console.log('\nOK: primer login Google verificado para', TEST_EMAIL, `(uid=${user.uid})`)
}

async function restore(auth, db) {
  const backup = await loadBackup()
  if (!backup) throw new Error('No hay backup — correr --prep primero')

  try {
    await auth.getUserByEmail(TEST_EMAIL).then((u) => auth.deleteUser(u.uid))
  } catch {
    // no auth
  }

  const recreated = await auth.createUser({
    uid: backup.uid,
    email: TEST_EMAIL,
    emailVerified: backup.auth.emailVerified,
    displayName: backup.auth.displayName,
  })

  for (const provider of backup.auth.providerData ?? []) {
    await auth.updateUser(recreated.uid, {
      providerToLink: {
        providerId: provider.providerId,
        uid: provider.uid,
        email: provider.email,
        displayName: provider.displayName,
      },
    })
  }

  if (backup.profile) {
    await db.collection('users').doc(backup.uid).set(backup.profile)
  }

  console.log(`Restaurado ${TEST_EMAIL} (uid=${backup.uid})`)
}

async function main() {
  initAdmin()
  const auth = getAuth()
  const db = getFirestore()

  if (process.argv.includes('--restore')) {
    await restore(auth, db)
    return
  }
  if (process.argv.includes('--verify')) {
    await verify(auth, db)
    return
  }
  if (process.argv.includes('--prep')) {
    await prep(auth, db)
    return
  }

  console.log('Uso: --prep | --verify | --restore')
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
