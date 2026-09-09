/**
 * Lee ragIndexState + conteo de chunks para el piloto Sistemas.
 */
import { getFirestore } from 'firebase-admin/firestore'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'
import { RAG_PILOT_GOVERNING_AREA_ID, RAG_CHUNKS_COLLECTION, RAG_INDEX_STATE_COLLECTION } from '../lib/modules/rag/constants.js'

loadTestEnv()
initAdmin()

const db = getFirestore()

const id = RAG_PILOT_GOVERNING_AREA_ID
const doc = await db.collection(RAG_INDEX_STATE_COLLECTION).doc(id).get()

if (!doc.exists) {
  console.log('NO_INDEX_STATE')
  process.exit(0)
}

const d = doc.data()
const lastIndexedAt = d.lastIndexedAt?.toDate?.()?.toISOString?.() ?? String(d.lastIndexedAt ?? '')

console.log('=== ragIndexState (Sistemas) ===')
console.log(`status: ${d.status}`)
console.log(`chunkCount (doc): ${d.chunkCount}`)
console.log(`fileCount: ${d.fileCount}`)
console.log(`lastIndexedAt: ${lastIndexedAt}`)
if (d.stats) {
  console.log(`stats.filesSeen: ${d.stats.filesSeen}`)
  console.log(`stats.filesIndexed: ${d.stats.filesIndexed}`)
  console.log(`stats.chunksWritten: ${d.stats.chunksWritten}`)
}

const countSnap = await db
  .collection(RAG_CHUNKS_COLLECTION)
  .where('governingAreaId', '==', id)
  .count()
  .get()
console.log(`chunks_in_firestore: ${countSnap.data().count}`)
