/**
 * Aplica CORS al bucket de subidas temporales (instaladores grandes).
 *
 *   node backend/scripts/apply-pending-uploads-cors.mjs
 */

import { Storage } from '@google-cloud/storage'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadTestEnv } from './get-test-token.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const corsPath = resolve(SCRIPT_DIR, 'pending-uploads-cors.json')

loadTestEnv()

const BUCKET = process.env.PENDING_UPLOADS_BUCKET?.trim() || 'bacar-pending-uploads'
const credPath = process.env.ADMIN_SDK_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS
if (!credPath) {
  console.error('Falta ADMIN_SDK_KEY_PATH')
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync(resolve(credPath), 'utf8'))
const storage = new Storage({
  projectId: serviceAccount.project_id,
  credentials: serviceAccount,
})

const cors = JSON.parse(readFileSync(corsPath, 'utf8'))
const bucket = storage.bucket(BUCKET)

console.log(`Aplicando CORS en gs://${BUCKET}...`)
await bucket.setMetadata({ cors })
console.log('CORS aplicado:')
console.log(JSON.stringify(cors, null, 2))

const [metadata] = await bucket.getMetadata()
console.log('\nVerificación:')
console.log(JSON.stringify(metadata.cors ?? [], null, 2))
