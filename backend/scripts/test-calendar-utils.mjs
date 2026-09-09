/**
 * Utilidades compartidas para pruebas de calendario (títulos legibles + limpieza).
 */

export const TEST_EVENT_TITLE = 'PRUEBA — Evento de testing, borrar'

export const CALENDAR_TEST_ACCOUNTS = [
  'implementaciones.it@bacarsa.com.ar',
  'sistemas.ti@bacarsa.com.ar',
  'admin@bacarsa.com.ar',
]

/** Resumen de evento que indica prueba automatizada (para listar y borrar). */
export const TEST_EVENT_SUMMARY_PATTERNS = [
  /probe/i,
  /bacarnet/i,
  /battery\s*test/i,
  /^PRUEBA/i,
  /\[probe\]/i,
  /test confirmaci/i,
  /test conflicto/i,
  /test acciones asistente/i,
  /info de prueba/i,
  /reporte [abc]/i,
  /ok parcial/i,
]

export function isTestCalendarEvent(summary) {
  const title = String(summary ?? '').trim()
  if (!title) return false
  return TEST_EVENT_SUMMARY_PATTERNS.some((re) => re.test(title))
}

export async function deleteCalendarEvent(calendar, eventId) {
  if (!eventId) return
  await calendar.events.delete({ calendarId: 'primary', eventId })
}

export async function listCalendarEventsInRange(calendar, { timeMin, timeMax, maxResults = 250 } = {}) {
  const now = new Date()
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin ?? new Date(now.getTime() - 30 * 86_400_000).toISOString(),
    timeMax: timeMax ?? new Date(now.getTime() + 90 * 86_400_000).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults,
  })
  return res.data.items ?? []
}

export async function cleanupTestEventsForUser(impersonateAs, { dryRun = false, getCalendar } = {}) {
  if (!getCalendar) {
    throw new Error('cleanupTestEventsForUser requiere getCalendar')
  }
  const calendar = await getCalendar(impersonateAs)
  const items = await listCalendarEventsInRange(calendar)
  const matches = items.filter((event) => isTestCalendarEvent(event.summary))

  let deleted = 0
  for (const event of matches) {
    console.log(`  - ${event.summary} (${event.id})`)
    if (!dryRun && event.id) {
      await deleteCalendarEvent(calendar, event.id)
      deleted += 1
    }
  }
  return { found: matches.length, deleted }
}
