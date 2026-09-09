/**
 * Verifica que 07:00:00.000Z se trate como 7am local (no 4am) en caminos de escritura.
 */
import {
  parseAssistantCalendarDateTime,
  toCalendarDateTime,
  toFloatingDateTimeInZone,
} from '../lib/modules/assistant-actions/calendarDateTime.js'

const TZ = 'America/Argentina/Buenos_Aires'
const zInput = '2026-09-09T07:00:00.000Z'

console.log('READ path (toFloatingDateTimeInZone):', toFloatingDateTimeInZone(zInput, TZ))
console.log('WRITE path (parseAssistantCalendarDateTime):', parseAssistantCalendarDateTime(zInput, TZ))
console.log('WRITE path (toCalendarDateTime):', toCalendarDateTime(zInput, TZ))

const readOk = toFloatingDateTimeInZone(zInput, TZ).includes('T04:00:00')
const writeOk = parseAssistantCalendarDateTime(zInput, TZ).includes('T07:00:00')
console.log(readOk ? '✓ READ convierte Z como instante UTC (04:00 AR)' : '✗ READ')
console.log(writeOk ? '✓ WRITE trata Z como hora local (07:00 AR)' : '✗ WRITE')
process.exit(readOk && writeOk ? 0 : 1)
