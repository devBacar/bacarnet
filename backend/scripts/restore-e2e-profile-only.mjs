/** Restaura perfil Firestore desde backup E2E. */
import { getFirestore } from 'firebase-admin/firestore'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const BACKUP_PATH = resolve(ROOT, 'backend/.tmp/e2e-google-backup.json')

loadTestEnv()
if (!getApps().length) {
  const credPath = process.env.ADMIN_SDK_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS
  const sa = JSON.parse(readFileSync(resolve(credPath), 'utf8'))
  initializeApp({ credential: cert(sa), projectId: sa.project_id })
}

if (!existsSync(BACKUP_PATH)) throw new Error('No hay backup')

const backup = JSON.parse(readFileSync(BACKUP_PATH, 'utf8'))
const db = getFirestore()
await db.collection('users').doc(backup.uid).set(backup.profile)
console.log(`Restaurado users/${backup.uid} (${backup.email})`)
