/**
 * Seed de global_settings/rag para RAG-lite (Fase 0).
 *
 *   npm run rag:seed:dry-run
 *   npm run rag:seed
 */

import { FieldValue } from 'firebase-admin/firestore'
import { initAdmin, loadTestEnv, getAdminDb } from './get-test-token.mjs'

loadTestEnv()
initAdmin()

const APPLY = process.argv.includes('--apply')
const db = getAdminDb()

const payload = {
  enabled: false,
  stagingBucket: process.env.RAG_STAGING_BUCKET?.trim() || 'bacar-rag-staging',
  stagingLocation: process.env.RAG_STAGING_LOCATION?.trim() || 'SOUTHAMERICA-EAST1',
  pilot: {
    governingAreaId: 'r7QVKsrSiqDWC8DrXCac',
    driveFolderId: '188-zgNhMIfeUjAI8GracINlItBbFwoUb',
    label: 'Sistemas',
  },
  excludedGoverningAreaIds: ['OWWnpfsRRx0XQ6FCqlOa'],
  excludedAreaLabels: {
    OWWnpfsRRx0XQ6FCqlOa: 'Cumplimiento',
  },
  regulatoryMessage:
    'Esta función no está disponible para documentos de Cumplimiento por motivos regulatorios: la información no puede procesarse fuera del país.',
  chunkChars: 2048,
  chunkOverlapChars: 200,
  embeddingDims: 768,
  queryMemoryMiB: 512,
  updatedAt: FieldValue.serverTimestamp(),
}

console.log('=== Seed global_settings/rag ===')
console.log(JSON.stringify(payload, null, 2))

if (!APPLY) {
  console.log('\nDry-run. Ejecutá: npm run rag:seed')
  process.exit(0)
}

await db.collection('global_settings').doc('rag').set(payload, { merge: true })
console.log('\nOK global_settings/rag')
