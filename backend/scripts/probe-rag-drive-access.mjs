import { getDrive } from '../lib/lib/google/driveClient.js'
import { initAdmin, loadTestEnv, getTestIdToken } from './get-test-token.mjs'
import { getFirestore } from 'firebase-admin/firestore'
import { RAG_CHUNKS_COLLECTION, RAG_PILOT_GOVERNING_AREA_ID } from '../lib/modules/rag/constants.js'

loadTestEnv()
initAdmin()

const emails = [
  'sistemas.ti@bacarsa.com.ar',
  'implementaciones.it@bacarsa.com.ar',
  'admin@bacarsa.com.ar',
  'visual.requester@bacarsa.com.ar',
]

const db = getFirestore()
const snap = await db
  .collection(RAG_CHUNKS_COLLECTION)
  .where('governingAreaId', '==', RAG_PILOT_GOVERNING_AREA_ID)
  .limit(15)
  .get()

const files = [...new Map(snap.docs.map((d) => [d.get('fileId'), d.get('fileName')])).entries()]
console.log('=== Muestra archivos indexados ===')
for (const [id, name] of files.slice(0, 12)) {
  console.log(`- ${name} (${id})`)
}

console.log('\n=== Acceso Drive por usuario (files.get) ===')
for (const email of emails) {
  let ok = 0
  let fail = 0
  for (const [fileId, name] of files.slice(0, 8)) {
    try {
      const drive = await getDrive(email)
      await drive.files.get({ fileId, supportsAllDrives: true, fields: 'id' })
      ok += 1
    } catch {
      fail += 1
    }
  }
  console.log(`${email}: ${ok} OK / ${fail} denegados (muestra 8)`)
}

console.log('\n=== Previews con "cámara/driver/queclink" ===')
const all = await db.collection(RAG_CHUNKS_COLLECTION).where('governingAreaId', '==', RAG_PILOT_GOVERNING_AREA_ID).get()
for (const doc of all.docs) {
  const preview = String(doc.get('textPreview') ?? '').toLowerCase()
  const name = String(doc.get('fileName') ?? '')
  if (/cámara|camara|driver|queclink|asr|smart pss|rustdesk/i.test(preview + name)) {
    console.log(`\n${name}`)
    console.log(doc.get('textPreview'))
    console.log(`readers: ${(doc.get('allowedReaders') ?? []).slice(0, 4).join(', ')}`)
  }
}
