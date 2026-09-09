/**
 * Trazado paso a paso: raw Google Calendar → formatEventForAssistant → formatCalendarAsAnswer
 *
 *   node backend/scripts/probe-calendar-read-timezone-debug.mjs
 *   node backend/scripts/probe-calendar-read-timezone-debug.mjs --subject implementaciones.it@bacarsa.com.ar
 *   node backend/scripts/probe-calendar-read-timezone-debug.mjs --title "Reunión presencial"
 */

import { loadTestEnv } from './get-test-token.mjs'
import { getCalendar } from '../lib/lib/google/workspaceGoogleClients.js'
import { listCalendarEventsTool } from '../lib/modules/assistant-actions/calendarReadTools.js'
import { formatCalendarAsAnswer } from '../lib/modules/rag/formatAssistantAnswers.js'
import {
  DEFAULT_CALENDAR_TIMEZONE,
  calendarDayBoundaryIso,
  formatFloatingTimeRange,
  todayInTimeZone,
  toFloatingDateTimeInZone,
} from '../lib/modules/assistant-actions/calendarDateTime.js'
import { analyzeQuestionIntent } from '../lib/modules/rag/assistantIntent.js'
import { parseCalendarReadRange } from '../lib/modules/rag/parseCalendarReadRange.js'

loadTestEnv()

const subjectArg = process.argv.find((arg) => arg.startsWith('--subject='))?.split('=')[1]
const titleFilter = process.argv.find((arg) => arg.startsWith('--title='))?.split('=')[1] ?? ''
const SUBJECT = subjectArg ?? process.env.CALENDAR_DEBUG_SUBJECT ?? 'implementaciones.it@bacarsa.com.ar'

const question = '¿Cuál es mi agenda hoy?'
const intent = analyzeQuestionIntent(question)
const range = parseCalendarReadRange(question)
const today = todayInTimeZone()

console.log('=== Routing (¿cuál es mi agenda hoy?) ===')
console.log('wantsCalendarRead:', intent.wantsCalendarRead)
console.log('wantsCalendar:', intent.wantsCalendar)
console.log('wantsCalendarCancel:', intent.wantsCalendarCancel)
console.log('Ruta esperada: runRagAssistant → listCalendarEventsTool → formatCalendarAsAnswer')
console.log('Rango:', range.dateFrom, '→', range.dateTo, '| hoy AR:', today)

const timeMin = calendarDayBoundaryIso(range.dateFrom, 'start')
const timeMax = calendarDayBoundaryIso(range.dateTo, 'end')
console.log('timeMin/timeMax (API):', timeMin, timeMax)

const calendar = await getCalendar(SUBJECT)
const rawRes = await calendar.events.list({
  calendarId: 'primary',
  timeMin,
  timeMax,
  singleEvents: true,
  orderBy: 'startTime',
  maxResults: 25,
})

const rawItems = rawRes.data.items ?? []
console.log(`\n=== Raw Google Calendar API (${rawItems.length} eventos) ===`)

function traceEvent(raw) {
  const title = raw.summary?.trim() || '(Sin título)'
  if (titleFilter && !title.toLowerCase().includes(titleFilter.toLowerCase())) return

  console.log('\n---', title, '---')
  console.log('eventId:', raw.id)
  console.log('RAW start:', JSON.stringify(raw.start))
  console.log('RAW end:', JSON.stringify(raw.end))

  const startDt = raw.start?.dateTime ?? null
  const endDt = raw.end?.dateTime ?? null
  const startTz = raw.start?.timeZone?.trim() || DEFAULT_CALENDAR_TIMEZONE
  const endTz = raw.end?.timeZone?.trim() || DEFAULT_CALENDAR_TIMEZONE

  if (startDt) {
    const afterStartConvert = toFloatingDateTimeInZone(startDt, startTz)
    console.log('toFloatingDateTimeInZone(start,', startTz + '):', afterStartConvert)
    console.log('  slice(11,16) SIN convertir (bug viejo):', startDt.slice(11, 16))
    console.log(
      '  new Date(startDt).toISOString() (si se parseara como local servidor):',
      Number.isNaN(new Date(startDt).getTime()) ? 'NaN' : new Date(startDt).toISOString(),
    )
  }
  if (endDt) {
    const afterEndConvert = toFloatingDateTimeInZone(endDt, endTz)
    console.log('toFloatingDateTimeInZone(end,', endTz + '):', afterEndConvert)
    console.log('  slice(11,16) SIN convertir (bug viejo):', endDt.slice(11, 16))
  }
}

for (const raw of rawItems) {
  traceEvent(raw)
}

console.log('\n=== listCalendarEventsTool (formatEventForAssistant en map) ===')
const toolResult = await listCalendarEventsTool({
  impersonateAs: SUBJECT,
  args: { dateFrom: range.dateFrom, dateTo: range.dateTo },
})

for (const event of toolResult.events ?? []) {
  if (titleFilter && !event.title.toLowerCase().includes(titleFilter.toLowerCase())) continue
  console.log('\n---', event.title, '---')
  console.log('formatEventForAssistant → start:', event.start, '| end:', event.end)
  console.log(
    'formatFloatingTimeRange:',
    formatFloatingTimeRange(event.start, event.end, toolResult.timeZone),
  )
}

console.log('\n=== formatCalendarAsAnswer (respuesta final orquestada) ===')
console.log(formatCalendarAsAnswer(toolResult))

console.log('\n=== Cancela todo — intent ===')
const cancelIntent = analyzeQuestionIntent('Cancela todo')
console.log('wantsCalendarCancel:', cancelIntent.wantsCalendarCancel, '(esperado: true tras fix)')
