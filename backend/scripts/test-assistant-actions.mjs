/**
 * Prueba flujo prepare + confirm de acciones del asistente (prod o local).
 *
 *   node backend/scripts/test-assistant-actions.mjs --case=calendar
 *   node backend/scripts/test-assistant-actions.mjs --case=calendar-with-attendee
 *   node backend/scripts/test-assistant-actions.mjs --case=email
 *   node backend/scripts/test-assistant-actions.mjs --case=list-events
 */

import { getTestIdToken, loadTestEnv } from './get-test-token.mjs'
import { getCalendar } from '../lib/lib/google/workspaceGoogleClients.js'
import { TEST_EVENT_TITLE, deleteCalendarEvent } from './test-calendar-utils.mjs'

loadTestEnv()

const API_BASE = process.env.RAG_API_BASE_URL ?? 'https://bacarnet.web.app'
const caseKey = process.argv.find((a) => a.startsWith('--case='))?.split('=')[1] ?? 'calendar'

async function ask(token, question, history = []) {
  const res = await fetch(`${API_BASE}/api/drive/ask`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question, history }),
  })
  const body = await res.json().catch(() => ({}))
  return { res, body }
}

async function confirm(token, actionId) {
  const res = await fetch(
    `${API_BASE}/api/drive/assistant/actions/${encodeURIComponent(actionId)}/confirm`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    },
  )
  const body = await res.json().catch(() => ({}))
  return { res, body }
}

function tomorrowAt(hour, minute = 0) {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(hour, minute, 0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

const { idToken, email } = await getTestIdToken({ requireSuperAdmin: false })

console.log('=== Assistant actions test ===')
console.log('Case:', caseKey)
console.log('User:', email)
console.log('API:', API_BASE)

if (caseKey === 'list-events') {
  const q = '¿Qué tengo en el calendario mañana? Listame los eventos con horario.'
  const result = await ask(idToken, q)
  console.log('\nASK', result.res.status)
  console.log('tools:', result.body.toolsUsed)
  console.log(result.body.answer ?? result.body.error)
  process.exit(result.res.ok ? 0 : 1)
}

if (caseKey === 'free-busy') {
  const q = '¿Tengo algún hueco libre mañana entre las 9 y las 18 de al menos 30 minutos?'
  const result = await ask(idToken, q)
  console.log('\nASK', result.res.status)
  console.log('tools:', result.body.toolsUsed)
  console.log(result.body.answer ?? result.body.error)
  process.exit(result.res.ok ? 0 : 1)
}

if (caseKey === 'email') {
  const q =
    'Preparame un correo para sistemas.ti@bacarsa.com.ar con asunto "PRUEBA — Correo de testing, borrar" y cuerpo "Prueba automatizada de confirmación."'
  const prepared = await ask(idToken, q)
  console.log('\nPREPARE', prepared.res.status, prepared.body.toolsUsed)
  const action = prepared.body.pendingActions?.[0]
  if (!action) {
    console.error('Sin pendingAction:', JSON.stringify(prepared.body, null, 2))
    process.exit(1)
  }
  const confirmed = await confirm(idToken, action.id)
  console.log('CONFIRM', confirmed.res.status, JSON.stringify(confirmed.body, null, 2))
  process.exit(confirmed.res.ok ? 0 : 1)
}

const attendee =
  caseKey === 'calendar-with-attendee' ? 'sistemas.ti@bacarsa.com.ar' : null
const start = tomorrowAt(15, 0)
const end = tomorrowAt(15, 30)
const dateLabel = start.slice(0, 10)
const attendeePart = attendee ? ` Invitá a ${attendee}.` : ''
const q = `Usá prepare_calendar_event ahora mismo: evento el ${dateLabel} de ${start.slice(11, 16)} a ${end.slice(11, 16)} titulado "${TEST_EVENT_TITLE}" con descripción "Prueba automatizada".${attendeePart}`

const prepared = await ask(idToken, q)
console.log('\nPREPARE', prepared.res.status)
console.log('tools:', prepared.body.toolsUsed)
console.log('answer:', prepared.body.answer?.slice(0, 200))
const action = prepared.body.pendingActions?.[0]
if (!action) {
  console.error('Sin pendingAction:', JSON.stringify(prepared.body, null, 2))
  process.exit(1)
}
console.log('pendingAction:', JSON.stringify(action, null, 2))

const confirmed = await confirm(idToken, action.id)
console.log('\nCONFIRM', confirmed.res.status)
console.log(JSON.stringify(confirmed.body, null, 2))

const eventId = confirmed.body.result?.eventId
if (eventId) {
  try {
    const calendar = await getCalendar(email)
    await deleteCalendarEvent(calendar, eventId)
    console.log('Self-cleanup: evento eliminado', eventId)
  } catch (err) {
    console.warn('Self-cleanup falló:', err instanceof Error ? err.message : err)
  }
}

process.exit(confirmed.res.ok ? 0 : 1)
