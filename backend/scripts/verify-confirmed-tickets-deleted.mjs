/** Verifica que los 6 tickets confirmados no existen y eventos Calendar ausentes. */
import { getAdminDb, initAdmin, loadTestEnv } from './get-test-token.mjs'
import { initHelpdeskCleanupAdmin } from './helpdesk-e2e-cleanup.mjs'

const IDS = [
  'PDO77JK3g5dBgMKRrirn',
  'etCQQaUet2AtofO0XBkO',
  'lMfSsREpMAAbZlXpQn0y',
  'OZbZNef4UmkthVACy6YF',
  'Yb3sorasmR4pl7fW3qIp',
  'z9JoHDQWw3bkvf0CFiK0',
]
const CALENDAR_EVENTS = [
  { id: 'h11pk3vltgvflcpd296m77nu8c', organizer: 'admin@bacarsa.com.ar' },
  { id: 'nqpqjtv80qikfdpvbrekpqfki4', organizer: 'admin@bacarsa.com.ar' },
]

loadTestEnv()
initAdmin()
initHelpdeskCleanupAdmin()
const db = getAdminDb()
const { getCalendar } = await import('../lib/lib/google/workspaceGoogleClients.js')

const ticketStatus = []
for (const id of IDS) {
  const snap = await db.collection('helpdeskTickets').doc(id).get()
  ticketStatus.push({ id, exists: snap.exists })
}

const calendarStatus = []
for (const event of CALENDAR_EVENTS) {
  let exists = false
  let status = null
  try {
    const calendar = await getCalendar(event.organizer)
    const res = await calendar.events.get({ calendarId: 'primary', eventId: event.id })
    status = res.data.status ?? null
    exists = status !== 'cancelled'
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? err.code : null
    exists = code !== 404 && code !== 410
    if (exists) throw err
  }
  calendarStatus.push({ eventId: event.id, exists, status })
}

console.log(JSON.stringify({ tickets: ticketStatus, calendar: calendarStatus }, null, 2))
const ok =
  ticketStatus.every((t) => !t.exists) && calendarStatus.every((c) => !c.exists)
process.exit(ok ? 0 : 1)
