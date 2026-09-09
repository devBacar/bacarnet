import { initAdmin, loadTestEnv } from './get-test-token.mjs'
import { getFirestore } from 'firebase-admin/firestore'
import { RAG_PILOT_GOVERNING_AREA_ID } from '../lib/modules/rag/constants.js'

loadTestEnv()
initAdmin()
const snap = await getFirestore()
  .collection('ragChunks')
  .where('governingAreaId', '==', RAG_PILOT_GOVERNING_AREA_ID)
  .get()
const readers = new Map()
for (const d of snap.docs) {
  for (const e of d.get('allowedReaders') ?? []) {
    readers.set(e, (readers.get(e) ?? 0) + 1)
  }
}
console.log('allowedReaders en chunks:')
for (const [email, count] of [...readers.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${count}x ${email}`)
}
