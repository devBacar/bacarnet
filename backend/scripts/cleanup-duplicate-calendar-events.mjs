/**
 * Elimina eventos duplicados de prueba en el calendario del usuario piloto.
 *
 *   node backend/scripts/cleanup-duplicate-calendar-events.mjs
 *   node backend/scripts/cleanup-duplicate-calendar-events.mjs --dry-run
 */

import { getCalendar } from '../lib/lib/google/workspaceGoogleClients.js'
import { loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const IMPERSONATE_AS =
  process.env.CALENDAR_CLEANUP_USER?.trim() || 'implementaciones.it@bacarsa.com.ar'
const dryRun = process.argv.includes('--dry-run')
const titleFilter = process.argv.find((arg) => arg.startsWith('--title='))?.slice(8) ?? 'Battery test'

function eventKey(event) {
  const title = event.summary?.trim() || '(Sin título)'
  const start = event.start?.dateTime ?? event.start?.date ?? ''
  const end = event.end?.dateTime ?? event.end?.date ?? ''
  return `${title}|${start}|${end}`
}

async function main() {
  const calendar = await getCalendar(IMPERSONATE_AS)
  const now = new Date()
  const timeMin = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  const timeMax = new Date(now.getTime() + 30 * 86_400_000).toISOString()

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
    q: titleFilter,
  })

  const items = res.data.items ?? []
  console.log(`Usuario: ${IMPERSONATE_AS}`)
  console.log(`Eventos con filtro "${titleFilter}": ${items.length}`)

  const groups = new Map()
  for (const event of items) {
    const key = eventKey(event)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(event)
  }

  let deleted = 0
  for (const [key, events] of groups) {
    if (events.length <= 1) continue
    console.log(`\nDuplicado (${events.length}x): ${key}`)
    const [, ...duplicates] = events
    for (const dup of duplicates) {
      console.log(`  - borrar ${dup.id} (${dup.summary})`)
      if (!dryRun && dup.id) {
        await calendar.events.delete({ calendarId: 'primary', eventId: dup.id })
        deleted += 1
      }
    }
  }

  console.log(`\n${dryRun ? 'Dry-run' : 'Eliminados'}: ${deleted} evento(s) duplicado(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
