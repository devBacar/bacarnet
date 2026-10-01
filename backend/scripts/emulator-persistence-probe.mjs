/**
 * Escribe/lee un marcador en Firestore emulador para probar persistencia.
 *   $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
 *   node backend/scripts/emulator-persistence-probe.mjs write
 *   node backend/scripts/emulator-persistence-probe.mjs read
 */

import { getFirestore } from 'firebase-admin/firestore'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

const MARKER = 'emulatorPersistenceProbe'

loadTestEnv()
initAdmin()
const db = getFirestore()

const mode = process.argv[2] ?? 'read'
const ref = db.collection('_emulator_probes').doc(MARKER)

if (mode === 'write') {
  const payload = {
    updatedAt: new Date().toISOString(),
    note: 'bacarnet staging persistence test',
  }
  await ref.set(payload)
  console.log('WRITE OK', payload)
} else {
  const snap = await ref.get()
  if (!snap.exists) {
    console.log('READ: (sin documento)')
    process.exit(2)
  }
  console.log('READ OK', snap.data())
}
