/**
 * Notifica al usuario piloto del asistente RAG (in-app).
 *   node backend/scripts/notify-rag-pilot-user.mjs --apply
 */

import { FieldValue } from 'firebase-admin/firestore'
import { createHash } from 'node:crypto'
import { initAdmin, loadTestEnv, getAdminDb } from './get-test-token.mjs'

loadTestEnv()
initAdmin()

const APPLY = process.argv.includes('--apply')
const PILOT_EMAIL = 'implementaciones.it@bacarsa.com.ar'
const DEEP_LINK = '/recursos/asistente-sistemas'

const db = getAdminDb()

const q = await db.collection('users').where('email', '==', PILOT_EMAIL).limit(1).get()
if (q.empty) {
  throw new Error(`No hay users con email ${PILOT_EMAIL}`)
}

const recipientUid = q.docs[0].id
const dedupeKey = `rag-pilot-launch-2026-09-07:${PILOT_EMAIL}`
const docId = createHash('sha256').update(dedupeKey).digest('hex').slice(0, 40)

const notification = {
  type: 'user_governance_change',
  category: 'passive',
  read: false,
  createdAt: FieldValue.serverTimestamp(),
  actor: {
    uid: 'system',
    email: 'sistemas.ti@bacarsa.com.ar',
    displayName: 'Sistemas TI',
  },
  title: 'Asistente de documentación Sistemas disponible',
  body:
    'Ya podés consultar documentación del área Sistemas en el asistente interno. ' +
    'Durante las próximas 1–2 semanas usalo con preguntas reales de tu trabajo diario ' +
    '(no de prueba): eso nos ayuda a validar el piloto antes de expandirlo.',
  deepLink: { path: DEEP_LINK },
  context: { areaName: 'Sistemas', feature: 'rag_pilot' },
  dedupeKey,
}

console.log('=== Notificación piloto RAG ===')
console.log(`Destinatario: ${PILOT_EMAIL} (${recipientUid})`)
console.log(JSON.stringify({ ...notification, createdAt: '(serverTimestamp)' }, null, 2))

if (!APPLY) {
  console.log('\nDry-run. Ejecutá con --apply')
  process.exit(0)
}

const ref = db.collection('users').doc(recipientUid).collection('notifications').doc(docId)
const existing = await ref.get()
if (existing.exists) {
  console.log('\nYa existía la notificación (dedupe).')
  process.exit(0)
}

await ref.set(notification)
console.log('\nOK notificación enviada')
