/**
 * Compara slots "Ocupado" (disponibilidad-inicial) vs eventos reales (events.list).
 *
 *   npm --prefix backend run build
 *   node backend/scripts/compare-helpdesk-occupied-vs-events.mjs [semanaOffset]
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TEAM = [
  { nombre: 'Mauro', email: 'admin@bacarsa.com.ar' },
  { nombre: 'Franco', email: 'sistemas.ti@bacarsa.com.ar' },
]

function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function overlapsSlot(eventStart, eventEnd, slotStartISO, slotEndISO) {
  const aStart = new Date(slotStartISO).getTime()
  const aEnd = new Date(slotEndISO).getTime()
  const bStart = new Date(eventStart).getTime()
  const bEnd = new Date(eventEnd).getTime()
  return aStart < bEnd && aEnd > bStart
}

function formatEventLine(ev) {
  const start = ev.start?.dateTime ?? ev.start?.date ?? '?'
  const end = ev.end?.dateTime ?? ev.end?.date ?? '?'
  return `- ${start} → ${end} | ${ev.summary ?? '(sin título)'} [${ev.id}]`
}

async function listEventsForEmail(email, timeMinISO, timeMaxISO) {
  const { getCalendarReadonly } = await import('../lib/lib/google/workspaceGoogleClients.js')
  const calendar = await getCalendarReadonly(email)
  const events = []
  let pageToken
  do {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMinISO,
      timeMax: timeMaxISO,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
      pageToken,
    })
    events.push(...(res.data.items ?? []))
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return events
}

async function main() {
  loadEnvFile(resolve(SCRIPTS_DIR, '.env'))
  loadEnvFile(resolve(SCRIPTS_DIR, '.env.local'))

  const semanaOffset = Number.parseInt(process.argv[2] ?? '0', 10) || 0
  const { generarTokenSolicitud } = await import('../lib/modules/helpdesk/accessToken.js')
  const { buildAvailabilitySlotsForEmails } = await import(
    '../lib/modules/helpdesk/buildAvailabilitySlots.js'
  )
  const { parseSlotLabels } = await import('../lib/modules/helpdesk/slotScheduling.js')

  const token = generarTokenSolicitud({
    email: 'compare-script@bacarsa.com.ar',
    nombre: 'Compare Script',
    areaId: 'compare',
    areaNombre: 'Sistemas',
  })

  const emails = TEAM.map((m) => m.email)
  const slots = await buildAvailabilitySlotsForEmails(emails, semanaOffset)
  const occupied = slots.filter((s) => !s.libre)
  const { startISO: timeMinISO } = parseSlotLabels(slots[0].fecha, slots[0].hora)
  const { endISO: timeMaxISO } = parseSlotLabels(
    slots[slots.length - 1].fecha,
    slots[slots.length - 1].hora,
  )

  console.log(`\n=== Semana offset ${semanaOffset} ===`)
  console.log(`Ventana slots: ${timeMinISO} → ${timeMaxISO}`)
  console.log(`Días en grilla: ${[...new Set(slots.map((s) => s.fecha))].join(', ')}`)
  console.log(`Slots ocupados según API (${occupied.length}):`)

  const eventsByEmail = {}
  for (const member of TEAM) {
    eventsByEmail[member.email] = await listEventsForEmail(member.email, timeMinISO, timeMaxISO)
    console.log(`\n--- Eventos reales (${member.nombre}, events.list): ${eventsByEmail[member.email].length} ---`)
    for (const ev of eventsByEmail[member.email]) {
      console.log(formatEventLine(ev))
    }
  }

  console.log('\n--- Comparación slot a slot (Ocupado) ---')
  const orphans = []
  for (const slot of occupied) {
    const { startISO, endISO } = parseSlotLabels(slot.fecha, slot.hora)
    const hits = []
    for (const member of TEAM) {
      for (const ev of eventsByEmail[member.email]) {
        const start = ev.start?.dateTime ?? ev.start?.date
        const end = ev.end?.dateTime ?? ev.end?.date
        if (!start || !end) continue
        if (overlapsSlot(start, end, startISO, endISO)) {
          hits.push(`${member.nombre}: ${ev.summary ?? '(sin título)'} (${start})`)
        }
      }
    }
    const line = `${slot.fecha} ${slot.hora} → ${hits.length ? hits.join(' | ') : 'SIN EVENTO'}`
    console.log(line)
    if (hits.length === 0) orphans.push(slot)
  }

  console.log('\n=== Resumen ===')
  console.log(`Ocupados API: ${occupied.length}`)
  console.log(`Ocupados sin evento real (posible bug): ${orphans.length}`)
  if (orphans.length) {
    for (const o of orphans) {
      console.log(`  ⚠ ${o.fecha} ${o.hora}`)
    }
  } else {
    console.log('Cada slot Ocupado tiene al menos un evento en Mauro o Franco que lo solapa.')
  }

  // Verificación cruzada con endpoint HTTP
  const url = `http://127.0.0.1:8799/api/helpdesk/disponibilidad-inicial?token=${encodeURIComponent(token)}&semanaOffset=${semanaOffset}`
  try {
    const res = await fetch(url)
    if (res.ok) {
      const json = await res.json()
      const httpOccupied = (json.slots ?? []).filter((s) => !s.libre)
      console.log(`\n(HTTP local opcional) ocupados=${httpOccupied.length}`)
    }
  } catch {
    /* API local no levantada */
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
