/**
 * Unit checks for calendar read vs create routing.
 *   node backend/scripts/test-assistant-intent.mjs
 */

import {
  analyzeQuestionIntent,
  isCalendarCreateQuery,
  isCalendarReadQuery,
} from '../lib/modules/rag/assistantIntent.js'
import { parseCalendarReadRange } from '../lib/modules/rag/parseCalendarReadRange.js'

const readCases = [
  '¿Cuál es mi agenda hoy?',
  '¿Qué tengo mañana?',
  'Mostrame mi agenda de la semana',
  '¿Tengo algo agendado para el viernes?',
  '¿Qué tengo en el calendario mañana?',
]

const createCases = [
  'Agendame una reunión mañana a las 10',
  'Agendá algo con Juan el jueves',
  'Preparame un evento mañana a las 16:00 titulado "Sync"',
]

const cancelCases = [
  'Cancelá la reunión de las 16',
  'Eliminar el evento de mañana',
  'Cancelá todas las reuniones a las 4 de la tarde',
  'Cancela todo',
]

let failed = 0

for (const question of readCases) {
  const intent = analyzeQuestionIntent(question)
  const ok = intent.wantsCalendarRead && !intent.wantsCalendar
  console.log(`${ok ? '✓' : '✗'} READ  ${question}`)
  if (!ok) failed += 1
}

for (const question of createCases) {
  const intent = analyzeQuestionIntent(question)
  const ok = intent.wantsCalendar && !intent.wantsCalendarRead && !intent.wantsCalendarCancel
  console.log(`${ok ? '✓' : '✗'} CREATE ${question}`)
  if (!ok) failed += 1
}

for (const question of cancelCases) {
  const intent = analyzeQuestionIntent(question)
  const ok = intent.wantsCalendarCancel && !intent.wantsCalendar && !intent.wantsCalendarRead
  console.log(`${ok ? '✓' : '✗'} CANCEL ${question}`)
  if (!ok) failed += 1
}

const range = parseCalendarReadRange('Mostrame mi agenda de la semana', '2026-09-09')
const rangeOk = range.dateFrom === '2026-09-09' && range.dateTo === '2026-09-15'
console.log(`${rangeOk ? '✓' : '✗'} RANGE semana ${range.dateFrom} → ${range.dateTo}`)
if (!rangeOk) failed += 1

console.log(`\n${failed === 0 ? 'OK' : `${failed} fallo(s)`}`)
process.exit(failed === 0 ? 0 : 1)
