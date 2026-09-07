/**
 * Verifica gate UI lógico: pending no puede usar rutas activas; corporate sí.
 * node backend/scripts/test-external-account-ui-gates.mjs
 */

import { getTestIdToken, initAdmin, getAdminDb } from './get-test-token.mjs'

initAdmin()
const db = getAdminDb()

async function profileFor(email) {
  process.env.TEST_EMAIL = email
  const session = await getTestIdToken({ requireSuperAdmin: false })
  const snap = await db.collection('users').doc(session.uid).get()
  return { session, data: snap.data() ?? {} }
}

console.log('=== Pending UI gate (datos + auth) ===')
const pending = await profileFor('checklist-pending-ui@example.com')
console.log('email:', pending.session.email)
console.log('accountStatus:', pending.data.accountStatus)
console.log('Gate esperado: Home/AccountStatusRoute → /cuenta-pendiente, sin /intranet')
if (pending.data.accountStatus !== 'pending_approval') throw new Error('pending status')

console.log('\n=== Approved external UI (datos) ===')
const approved = await profileFor('checklist-ext-1788458586913@example.com')
console.log('accountStatus:', approved.data.accountStatus)
console.log('view_directory:', approved.data.permissions?.view_directory)
console.log('view_drive:', approved.data.permissions?.view_drive)
console.log('view_links:', approved.data.permissions?.view_links)
console.log('Navegador prod: navbar solo Inicio+Contactos, home sin herramientas/noticias')

console.log('\n=== Corporate direct access (datos) ===')
const corp = await profileFor('checklist-corp-1788458586913@bacarsa.com.ar')
console.log('accountType:', corp.data.accountType)
console.log('accountStatus:', corp.data.accountStatus)
console.log('view_drive:', corp.data.permissions?.view_drive)
if (corp.data.accountStatus !== 'active' || corp.data.accountType !== 'corporate') {
  throw new Error('corporate must be active')
}

console.log('\nUI gates script OK')
