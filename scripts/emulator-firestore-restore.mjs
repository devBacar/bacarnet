/**
 * Restaura respaldo JSON en Firestore emulador (merge por documento).
 *
 *   $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
 *   node scripts/emulator-firestore-restore.mjs
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getAdminDb, loadTestEnv } from '../backend/scripts/get-test-token.mjs'

const dataRoot =
  process.env.BACARNET_EMULATOR_DATA?.trim() || 'C:\\bacarnet-emulator-data'
const backupPath = resolve(dataRoot, 'admin-backup')
const manifestPath = resolve(backupPath, 'manifest.json')

if (!existsSync(manifestPath)) {
  console.log('[emulator-restore] Sin manifest; nada que restaurar.')
  process.exit(0)
}

loadTestEnv()
const db = getAdminDb()

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
let restored = 0

for (const entry of manifest.collections ?? []) {
  const filePath = resolve(backupPath, entry.file)
  if (!existsSync(filePath)) continue
  const docs = JSON.parse(readFileSync(filePath, 'utf8'))
  for (const row of docs) {
    if (!row?.id || !row.data) continue
    await db.collection(entry.name).doc(row.id).set(row.data, { merge: true })
    restored += 1
  }
}

console.log(`[emulator-restore] OK ${restored} documentos desde ${backupPath}`)
