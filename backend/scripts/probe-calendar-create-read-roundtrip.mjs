/**
 * Crea evento a las 07:00 vía executeCalendarCreate y lee raw + formatEventForAssistant.
 */
import { loadTestEnv } from './get-test-token.mjs'
import { executeCalendarCreate } from '../lib/modules/assistant-actions/executeCalendarCreate.js'
import { getCalendar } from '../lib/lib/google/workspaceGoogleClients.js'
import { listCalendarEventsTool } from '../lib/modules/assistant-actions/calendarReadTools.js'
import { toFloatingDateTimeInZone } from '../lib/modules/assistant-actions/calendarDateTime.js'
import { deleteCalendarEvent, TEST_EVENT_TITLE } from './test-calendar-utils.mjs'

loadTestEnv()

const SUBJECT = 'implementaciones.it@bacarsa.com.ar'
const today = '2026-09-09'
const inputs = [
  { label: 'floating-local', start: `${today}T07:00:00`, end: `${today}T07:30:00` },
  { label: 'with-Z-UTC', start: `${today}T07:00:00.000Z`, end: `${today}T07:30:00.000Z` },
  { label: 'with-offset-AR', start: `${today}T07:00:00-03:00`, end: `${today}T07:30:00-03:00` },
]

const calendar = await getCalendar(SUBJECT)

for (const fmt of inputs) {
  console.log('\n==========', fmt.label, '==========')
  console.log('Payload startDateTime:', fmt.start)

  const created = await executeCalendarCreate({
    impersonateAs: SUBJECT,
    payload: {
      title: `${TEST_EVENT_TITLE} roundtrip ${fmt.label}`,
      description: 'timezone roundtrip',
      location: null,
      startDateTime: fmt.start,
      endDateTime: fmt.end,
      timeZone: 'America/Argentina/Buenos_Aires',
      attendees: [],
    },
  })
  console.log('Created eventId:', created.eventId)

  const raw = await calendar.events.get({ calendarId: 'primary', eventId: created.eventId })
  console.log('Google RAW start:', JSON.stringify(raw.data.start))
  console.log('Google RAW end:', JSON.stringify(raw.data.end))

  const listed = await listCalendarEventsTool({
    impersonateAs: SUBJECT,
    args: { dateFrom: today, dateTo: today },
  })
  const match = (listed.events ?? []).find((e) => e.eventId === created.eventId)
  console.log('formatEventForAssistant start/end:', match?.start, match?.end)
  console.log(
    'toFloatingDateTimeInZone on RAW dateTime:',
    raw.data.start?.dateTime
      ? toFloatingDateTimeInZone(raw.data.start.dateTime, raw.data.start.timeZone ?? 'America/Argentina/Buenos_Aires')
      : 'n/a',
  )

  await deleteCalendarEvent(calendar, created.eventId)
  console.log('Cleanup OK')
}
