/**
 * Borra únicamente los seis tickets confirmados el 14/09/2026.
 * Requiere --confirm para evitar ejecuciones accidentales.
 */
import { getAdminDb, initAdmin, loadTestEnv } from './get-test-token.mjs'
import { deleteHelpdeskTicketFull } from './helpdesk-e2e-cleanup.mjs'

if (!process.argv.includes('--confirm')) {
  throw new Error('Falta --confirm')
}

const candidates = new Map([
  ['PDO77JK3g5dBgMKRrirn', 'E2E Layout Probe'],
  ['etCQQaUet2AtofO0XBkO', 'E2E Layout Probe'],
  ['lMfSsREpMAAbZlXpQn0y', 'N8N Outbound Test'],
  ['OZbZNef4UmkthVACy6YF', 'Sistemas'],
  ['Yb3sorasmR4pl7fW3qIp', 'Sistemas'],
  ['z9JoHDQWw3bkvf0CFiK0', 'Sistemas'],
  ['Wug9qhtGyVIwGcB1tBzI', 'E2E Sticky Header'],
])

loadTestEnv()
initAdmin()
const db = getAdminDb()

for (const [ticketId, expectedArea] of candidates) {
  const snapshot = await db.collection('helpdeskTickets').doc(ticketId).get()
  if (!snapshot.exists) {
    console.log(`SKIP ${ticketId}: ya no existe`)
    continue
  }
  const ticket = snapshot.data()
  if (ticket.areaNombre !== expectedArea) {
    throw new Error(`${ticketId}: área inesperada ${String(ticket.areaNombre)}`)
  }
  if (
    expectedArea === 'Sistemas' &&
    !String(ticket.problematica ?? '').toLowerCase().includes('prueba automática')
  ) {
    throw new Error(`${ticketId}: el ticket de Sistemas no parece una prueba automática`)
  }
  const deleted = await deleteHelpdeskTicketFull(ticketId)
  console.log(`${deleted ? 'DELETED' : 'FAILED'} ${ticketId}`)
}
