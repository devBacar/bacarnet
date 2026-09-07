/**
 * Bucket GCS para snapshots RAG-lite (embeddings + manifest por área).
 *
 *   npm run rag:staging:setup
 *
 * Tras crear el bucket, otorgá en GCP Console → Permisos del bucket:
 *   Principal: datos-drive-sa@bacar-web.iam.gserviceaccount.com
 *   Rol: Storage Object Admin
 */

import { Storage } from '@google-cloud/storage'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const APPLY = process.argv.includes('--apply')
const BUCKET = process.env.RAG_STAGING_BUCKET?.trim() || 'bacar-rag-staging'
const LOCATION = process.env.RAG_STAGING_LOCATION?.trim() || 'SOUTHAMERICA-EAST1'
const RUNTIME_SA =
  process.env.DRIVE_RUNTIME_SA?.trim() || 'datos-drive-sa@bacar-web.iam.gserviceaccount.com'

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

async function main() {
  const bucketRef = storage.bucket(BUCKET)
  const [exists] = await bucketRef.exists()
  console.log(`Bucket: gs://${BUCKET} (${LOCATION})`)
  console.log(`Runtime SA (Cloud Functions): ${RUNTIME_SA}`)
  console.log(`Existe: ${exists ? 'sí' : 'no'}`)

  if (!APPLY) {
    console.log('\nDry-run. Ejecutá: npm run rag:staging:setup')
    console.log(
      `\nLuego otorgá Storage Object Admin sobre gs://${BUCKET} a:\n  ${RUNTIME_SA}`,
    )
    return
  }

  if (!exists) {
    await storage.createBucket(BUCKET, {
      location: LOCATION,
      uniformBucketLevelAccess: true,
    })
    console.log('Bucket creado.')
  }

  const probe = bucketRef.file('probe/setup.txt')
  await probe.save('ok', { resumable: false })
  await probe.delete({ ignoreNotFound: true })
  console.log('Probe write/delete OK (admin SDK).')
  console.log(
    `\nIMPORTANTE: otorgá Storage Object Admin sobre gs://${BUCKET} a:\n  ${RUNTIME_SA}`,
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
