/**
 * DELETE ticket desde API (panel) + verificación Firestore.
 */
import { Timestamp } from 'firebase-admin/firestore'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'
import { deleteHelpdeskTicketFull } from './helpdesk-e2e-cleanup.mjs'

loadTestEnv()
initAdmin()
const db = getAdminDb()
const { idToken, uid, email } = await getTestIdToken()
const API_PORT = 8793
const API = `http://127.0.0.1:${API_PORT}`

const { app } = await import('../lib/server.js')
const server = await new Promise((resolvePromise, reject) => {
  const instance = app.listen(API_PORT, '127.0.0.1', (error) =>
    error ? reject(error) : resolvePromise(instance),
  )
})

const ticketRef = db.collection('helpdeskTickets').doc()
const ticketId = ticketRef.id
await ticketRef.set({
  token: 'e2e-delete-panel',
  requesterUid: uid,
  requesterEmail: email,
  requesterNombre: 'E2E Delete Panel',
  areaId: 'e2e',
  areaNombre: 'E2E Delete Panel',
  problematica: 'Ticket de prueba para botón eliminar',
  urgencia: 'baja',
  estadoIdx: 1,
  asignadoATeamId: null,
  createdAt: Timestamp.now(),
})
await ticketRef.collection('reuniones').doc().set({
  tipo: 'Reunión inicial',
  fecha: '21/09/2026',
  hora: '10:00',
  conTeamId: 'x',
  participantesTeamIds: [],
  estado: 'pendiente',
  createdAt: Timestamp.now(),
})

try {
  const res = await fetch(`${API}/api/helpdesk/tickets/${ticketId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}` },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`DELETE failed ${res.status} ${JSON.stringify(body)}`)
  const snap = await ticketRef.get()
  if (snap.exists) throw new Error('FAIL: ticket sigue en Firestore')
  console.log('PASS: delete panel API + Firestore')
} finally {
  await deleteHelpdeskTicketFull(ticketId).catch(() => {})
  server.close()
}
