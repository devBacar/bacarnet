/**
 * Respaldo JSON de Firestore emulador (Admin SDK). Complemento fiable a export-on-exit.
 *
 *   $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
 *   node scripts/emulator-firestore-backup.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAdminDb, loadTestEnv } from '../backend/scripts/get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dataRoot =
  process.env.BACARNET_EMULATOR_DATA?.trim() || 'C:\\bacarnet-emulator-data'
const backupDir = resolve(dataRoot, 'admin-backup')

mkdirSync(backupDir, { recursive: true })

loadTestEnv()
const db = getAdminDb()

const collections = await db.listCollections()
const manifest = {
  exportedAt: new Date().toISOString(),
  collections: [],
}

for (const colRef of collections) {
  const snap = await colRef.get()
  const docs = snap.docs.map((doc) => ({
    id: doc.id,
    data: doc.data(),
  }))
  const fileName = `${colRef.id}.json`
  writeFileSync(resolve(backupDir, fileName), JSON.stringify(docs, null, 0), 'utf8')
  manifest.collections.push({ name: colRef.id, count: docs.length, file: fileName })
}

writeFileSync(resolve(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
console.log(
  `[emulator-backup] OK → ${backupDir} (${manifest.collections.length} colecciones)`,
)
