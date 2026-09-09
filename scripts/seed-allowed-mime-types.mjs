/**
 * Seed de `allowedMimeTypes` (idempotente: upsert por id estable).
 *
 * Uso:
 *   node scripts/seed-allowed-mime-types.mjs --dry-run
 *   node scripts/seed-allowed-mime-types.mjs
 *
 * Credenciales (en este orden): ADMIN_SDK_KEY_PATH, GOOGLE_APPLICATION_CREDENTIALS, ADC.
 * ADMIN_SDK_KEY_PATH se puede leer de backend/.env (no uses FIREBASE_* ahí).
 */

import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const COLLECTION = 'allowedMimeTypes'
const dryRun = process.argv.includes('--dry-run')
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** id de documento: MIME con `/` → `__` */
function docId(mimeType) {
  return mimeType.replaceAll('/', '__')
}

const SEED = [
  { mimeType: 'application/vnd.google-apps.document', label: 'Google Doc', allowed: true, isNativeGoogle: true },
  { mimeType: 'application/vnd.google-apps.spreadsheet', label: 'Google Sheet', allowed: true, isNativeGoogle: true },
  { mimeType: 'application/vnd.google-apps.folder', label: 'Carpeta', allowed: true, isNativeGoogle: true },
  { mimeType: 'application/pdf', label: 'PDF', allowed: true, isNativeGoogle: false },
  { mimeType: 'image/png', label: 'PNG', allowed: true, isNativeGoogle: false },
  { mimeType: 'image/jpeg', label: 'JPEG', allowed: true, isNativeGoogle: false },
  { mimeType: 'video/mp4', label: 'Video MP4 (.mp4)', allowed: true, isNativeGoogle: false },
  { mimeType: 'video/quicktime', label: 'Video QuickTime (.mov)', allowed: true, isNativeGoogle: false },
  { mimeType: 'video/webm', label: 'Video WebM (.webm)', allowed: true, isNativeGoogle: false },
  { mimeType: 'video/x-msvideo', label: 'Video AVI (.avi)', allowed: true, isNativeGoogle: false },
  { mimeType: 'video/mpeg', label: 'Video MPEG (.mpeg/.mpg)', allowed: true, isNativeGoogle: false },
  { mimeType: 'application/x-msdownload', label: 'Instalador Windows (.exe)', allowed: true, isNativeGoogle: false },
  {
    mimeType: 'application/vnd.microsoft.portable-executable',
    label: 'Ejecutable Windows (.exe)',
    allowed: true,
    isNativeGoogle: false,
  },
  { mimeType: 'application/x-dosexec', label: 'Ejecutable DOS/Windows (.exe)', allowed: true, isNativeGoogle: false },
  { mimeType: 'application/x-msi', label: 'Instalador Windows (.msi)', allowed: true, isNativeGoogle: false },
  { mimeType: 'application/vnd.ms-msi', label: 'Instalador MSI (.msi)', allowed: true, isNativeGoogle: false },
  { mimeType: 'application/x-apple-diskimage', label: 'Imagen disco Mac (.dmg)', allowed: true, isNativeGoogle: false },
  {
    mimeType: 'application/vnd.apple.installer+xml',
    label: 'Instalador Mac (.pkg)',
    allowed: true,
    isNativeGoogle: false,
  },
  {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    label: 'Word (.docx)',
    allowed: false,
    isNativeGoogle: false,
  },
  {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    label: 'Excel (.xlsx)',
    allowed: false,
    isNativeGoogle: false,
  },
  {
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    label: 'PowerPoint (.pptx)',
    allowed: false,
    isNativeGoogle: false,
  },
  { mimeType: 'application/msword', label: 'Word (.doc)', allowed: false, isNativeGoogle: false },
  { mimeType: 'application/vnd.ms-excel', label: 'Excel (.xls)', allowed: false, isNativeGoogle: false },
  { mimeType: 'application/vnd.ms-powerpoint', label: 'PowerPoint (.ppt)', allowed: false, isNativeGoogle: false },
  { mimeType: 'application/vnd.oasis.opendocument.text', label: 'OpenDocument Texto (.odt)', allowed: true, isNativeGoogle: false },
  { mimeType: 'application/vnd.oasis.opendocument.spreadsheet', label: 'OpenDocument Hoja (.ods)', allowed: true, isNativeGoogle: false },
  { mimeType: 'application/vnd.oasis.opendocument.presentation', label: 'OpenDocument Presentación (.odp)', allowed: true, isNativeGoogle: false },
  { mimeType: 'application/zip', label: 'Archivo ZIP (.zip)', allowed: true, isNativeGoogle: false },
  { mimeType: 'application/x-zip-compressed', label: 'Archivo ZIP comprimido', allowed: true, isNativeGoogle: false },
  { mimeType: 'application/x-iso9660-image', label: 'Imagen ISO (.iso)', allowed: true, isNativeGoogle: false },
  { mimeType: 'application/x-7z-compressed', label: 'Archivo 7-Zip (.7z)', allowed: true, isNativeGoogle: false },
  { mimeType: 'application/vnd.rar', label: 'Archivo RAR (.rar)', allowed: true, isNativeGoogle: false },
  { mimeType: 'text/plain', label: 'Texto plano (.txt)', allowed: true, isNativeGoogle: false },
]

function loadBackendEnv() {
  const envPath = resolve(ROOT, 'backend/.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('***REMOVED***')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function initAdmin() {
  if (getApps().length > 0) return

  loadBackendEnv()
  const adminPath = process.env.ADMIN_SDK_KEY_PATH
  const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  const credPath = adminPath || gacPath

  if (credPath) {
    const absolute = resolve(credPath)
    const serviceAccount = JSON.parse(readFileSync(absolute, 'utf8'))
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    })
    console.log(
      adminPath
        ? 'Admin: cert desde ADMIN_SDK_KEY_PATH'
        : 'Admin: cert desde GOOGLE_APPLICATION_CREDENTIALS',
    )
    return
  }

  initializeApp({ credential: applicationDefault() })
  console.log('Admin: ADC')
}

async function main() {
  initAdmin()
  const db = getFirestore()

  console.log(
    dryRun
      ? `=== DRY-RUN: no se escribe ${COLLECTION} ===`
      : `=== UPSERT real en ${COLLECTION} ===`,
  )

  for (const row of SEED) {
    const id = docId(row.mimeType)
    console.log(`${row.allowed ? 'ALLOW' : 'BLOCK'} ${row.mimeType} → ${id}`)
    if (dryRun) continue

    await db.collection(COLLECTION).doc(id).set(
      {
        ...row,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  }

  console.log(dryRun ? 'Dry-run listo.' : `Listo. Documentos: ${SEED.length}.`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
