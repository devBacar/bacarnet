/**
 * Activa rag.enabled en Firestore.
 *   node backend/scripts/enable-rag-pilot.mjs --apply
 */

import { FieldValue } from 'firebase-admin/firestore'
import { initAdmin, loadTestEnv, getAdminDb } from './get-test-token.mjs'

loadTestEnv()
initAdmin()

const APPLY = process.argv.includes('--apply')
const db = getAdminDb()

const payload = {
  enabled: true,
  updatedAt: FieldValue.serverTimestamp(),
}

console.log('=== Activar piloto RAG ===')
console.log(JSON.stringify({ ...payload, updatedAt: '(serverTimestamp)' }, null, 2))

if (!APPLY) {
  console.log('\nDry-run. Ejecutá con --apply')
  process.exit(0)
}

await db.collection('global_settings').doc('rag').set(payload, { merge: true })
const snap = await db.collection('global_settings').doc('rag').get()
console.log('\nOK global_settings/rag')
console.log('enabled =', snap.get('enabled'))
