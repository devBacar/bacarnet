/**
 * Restaura el emulador desde .emulator-data/admin-backup usando TODOS los .json
 * presentes, no solo los listados en manifest.json (un export posterior puede
 * truncar el manifiesto y dejar archivos válidos huérfanos).
 *
 *   $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
 *   node scripts/emulator-restore-full.mjs
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getAdminDb, loadTestEnv } from '../backend_clean/scripts/get-test-token.mjs'

const dataRoot = process.env.BACARNET_EMULATOR_DATA?.trim() || resolve('.emulator-data')
const backupPath = resolve(dataRoot, 'admin-backup')

if (!existsSync(backupPath)) {
  console.error(`[restore-full] No existe ${backupPath}`)
  process.exit(1)
}

loadTestEnv()
const db = getAdminDb()

const files = readdirSync(backupPath).filter(
  (name) => name.endsWith('.json') && name !== 'manifest.json',
)

let restored = 0
for (const file of files) {
  const collectionName = file.replace(/\.json$/, '')
  const rows = JSON.parse(readFileSync(resolve(backupPath, file), 'utf8'))
  if (!Array.isArray(rows)) continue
  let count = 0
  for (const row of rows) {
    if (!row?.id || !row.data) continue
    await db.collection(collectionName).doc(row.id).set(row.data, { merge: true })
    count += 1
  }
  restored += count
  console.log(`${collectionName}: ${count}`)
}

console.log(`[restore-full] OK ${restored} documentos desde ${backupPath}`)
