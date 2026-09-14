/**
 * Crea un evento de prueba, verifica RSVP accepted y lo borra.
 *
 *   npm --prefix backend run build
 *   node backend/scripts/test-helpdesk-calendar-auto-accept.mjs
 */
import { loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const organizer = (
  process.env.HELPDESK_CALENDAR_TEST_ORGANIZER ?? 'admin@bacarsa.com.ar'
)
  .trim()
  .toLowerCase()

const start = new Date()
start.setDate(start.getDate() + 14)
start.setHours(16, 0, 0, 0)
const end = new Date(start)
end.setMinutes(end.getMinutes() + 45)

const { createCalendarEvent, deleteCalendarEvent, getEventAttendeeStatus } = await import(
  '../lib/modules/helpdesk/calendar.js'
)

const created = await createCalendarEvent({
  organizerEmail: organizer,
  attendeeEmails: [organizer],
  summary: '[PRUEBA] Auto-accept RSVP — borrar',
  description: 'Evento de verificación; se elimina al instante.',
  startISO: start.toISOString(),
  endISO: end.toISOString(),
})

try {
  if (!created.eventId) throw new Error('createCalendarEvent no devolvió eventId')
  const attendees = await getEventAttendeeStatus(organizer, created.eventId)
  const self = attendees.find((a) => a.email === organizer)
  const allAccepted = attendees.length > 0 && attendees.every((a) => a.responseStatus === 'accepted')
  console.log(
    JSON.stringify({
      eventId: created.eventId,
      location: created.location,
      attendeeCount: attendees.length,
      selfStatus: self?.responseStatus ?? null,
      allAccepted,
    }),
  )
  if (created.location !== 'En la oficina de sistemas') {
    throw new Error(`ubicación inesperada: ${created.location}`)
  }
  if (!allAccepted) {
    throw new Error(
      `RSVP no quedó accepted: ${JSON.stringify(attendees)}`,
    )
  }
  console.log('PASS: ubicación y RSVP correctos')
} finally {
  if (created.eventId) {
    await deleteCalendarEvent(organizer, created.eventId)
    console.log('evento de prueba eliminado')
  }
}
