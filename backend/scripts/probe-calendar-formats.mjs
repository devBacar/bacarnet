/**
 * Prueba directa de executeCalendarCreate con distintos formatos de fecha.
 */
import { loadTestEnv } from './get-test-token.mjs'
import { executeCalendarCreate } from '../lib/modules/assistant-actions/executeCalendarCreate.js'
import { getCalendar } from '../lib/lib/google/workspaceGoogleClients.js'
import { TEST_EVENT_TITLE, deleteCalendarEvent } from './test-calendar-utils.mjs'

loadTestEnv()

const SUBJECT = 'implementaciones.it@bacarsa.com.ar'
const formats = [
  { start: '2026-09-10T15:00:00', end: '2026-09-10T15:30:00', label: 'local-no-offset' },
  { start: '2026-09-10T18:00:00.000Z', end: '2026-09-10T18:30:00.000Z', label: 'utc-Z' },
  { start: '2026-09-10T15:00:00-03:00', end: '2026-09-10T15:30:00-03:00', label: 'with-offset' },
]

const calendar = await getCalendar(SUBJECT)
const createdIds = []

try {
  for (const fmt of formats) {
    console.log('\n===', fmt.label, '===')
    try {
      const result = await executeCalendarCreate({
        impersonateAs: SUBJECT,
        payload: {
          title: `${TEST_EVENT_TITLE} (${fmt.label})`,
          description: 'format test',
          location: null,
          startDateTime: fmt.start,
          endDateTime: fmt.end,
          timeZone: 'America/Argentina/Buenos_Aires',
          attendees: ['sistemas.ti@bacarsa.com.ar'],
        },
      })
      if (result.eventId) createdIds.push(result.eventId)
      console.log('OK', result)
    } catch (err) {
      console.error('FAIL', err instanceof Error ? err.message : err)
      if (err?.response?.data) console.error(JSON.stringify(err.response.data, null, 2))
    }
  }
} finally {
  for (const eventId of createdIds) {
    await deleteCalendarEvent(calendar, eventId)
    console.log('Self-cleanup: evento eliminado', eventId)
  }
}
