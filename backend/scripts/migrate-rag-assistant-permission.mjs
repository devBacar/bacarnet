/**
 * Migra acceso al asistente RAG de global_settings/rag.pilotUserEmails
 * a users/{uid}.permissions.rag_assistant.
 *
 *   node backend/scripts/migrate-rag-assistant-permission.mjs
 *   node backend/scripts/migrate-rag-assistant-permission.mjs --apply
 */

import { FieldValue } from 'firebase-admin/firestore'
import { initAdmin, loadTestEnv, getAdminDb } from './get-test-token.mjs'

loadTestEnv()
initAdmin()

const APPLY = process.argv.includes('--apply')
const db = getAdminDb()

const LEGACY_PILOT_EMAILS = ['implementaciones.it@bacarsa.com.ar']

console.log('=== Migración permissions.rag_assistant ===')
console.log('Emails a migrar:', LEGACY_PILOT_EMAILS.join(', '))
console.log('Modo:', APPLY ? 'APPLY' : 'dry-run')

for (const email of LEGACY_PILOT_EMAILS) {
  const normalized = email.trim().toLowerCase()
  const snap = await db.collection('users').where('email', '==', normalized).limit(2).get()

  if (snap.empty) {
    console.warn(`\n⚠ No se encontró usuario con email ${normalized}`)
    continue
  }

  if (snap.size > 1) {
    console.warn(`\n⚠ Múltiples usuarios con email ${normalized}; omitiendo por seguridad`)
    continue
  }

  const doc = snap.docs[0]
  const data = doc.data()
  const permissions =
    data.permissions && typeof data.permissions === 'object' && !Array.isArray(data.permissions)
      ? { ...data.permissions }
      : {}

  if (permissions.rag_assistant === true) {
    console.log(`\n✓ ${normalized} (${doc.id}) ya tiene rag_assistant=true`)
    continue
  }

  console.log(`\n→ ${normalized} (${doc.id}): rag_assistant false → true`)

  if (APPLY) {
    await doc.ref.set(
      {
        permissions: {
          ...permissions,
          rag_assistant: true,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
    console.log('  OK aplicado')
  }
}

if (!APPLY) {
  console.log('\nDry-run. Ejecutá con --apply para persistir.')
}

console.log('\nNota: podés eliminar pilotUserEmails de global_settings/rag cuando quieras; ya no se usa.')
