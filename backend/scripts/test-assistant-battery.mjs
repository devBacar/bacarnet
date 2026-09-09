/**
 * Batería amplia de pruebas del asistente (prod).
 *
 *   node backend/scripts/test-assistant-battery.mjs
 */

import { getTestIdToken, loadTestEnv } from './get-test-token.mjs'
import { getCalendar } from '../lib/lib/google/workspaceGoogleClients.js'
import { TEST_EVENT_TITLE, deleteCalendarEvent } from './test-calendar-utils.mjs'

loadTestEnv()

const API_BASE = process.env.RAG_API_BASE_URL ?? 'https://bacarnet.web.app'

async function ask(token, question, history = []) {
  const started = Date.now()
  const res = await fetch(`${API_BASE}/api/drive/ask`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question, history }),
  })
  const body = await res.json().catch(() => ({}))
  return { res, body, ms: Date.now() - started }
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

function tomorrowDateLabel() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

const { idToken, email } = await getTestIdToken({ requireSuperAdmin: false })
const tomorrow = tomorrowDateLabel()

const cases = [
  {
    name: 'inventario-pdf',
    run: async () => {
      const r = await ask(idToken, '¿Cuántos archivos PDF hay en el área Sistemas?')
      return r.res.ok && r.body.toolsUsed?.includes('count_files_by_type')
    },
  },
  {
    name: 'agenda-manana',
    run: async () => {
      const r = await ask(idToken, '¿Qué tengo en el calendario mañana?')
      return r.res.ok && r.body.toolsUsed?.includes('list_calendar_events')
    },
  },
  {
    name: 'agenda-semana',
    run: async () => {
      const r = await ask(idToken, '¿Qué tengo agendado esta semana en el calendario?')
      return r.res.ok && r.body.toolsUsed?.includes('list_calendar_events')
    },
  },
  {
    name: 'huecos-libres',
    run: async () => {
      const r = await ask(
        idToken,
        `¿Tengo algún hueco libre mañana ${tomorrow} entre las 9 y las 18 de al menos 30 minutos?`,
      )
      return r.res.ok && r.body.toolsUsed?.includes('find_calendar_free_slots')
    },
  },
  {
    name: 'calendar-prepare-confirm',
    run: async () => {
      const q = `Preparame un evento el ${tomorrow} de 16:00 a 16:30 titulado "${TEST_EVENT_TITLE}" invitando a sistemas.ti@bacarsa.com.ar.`
      const prepared = await ask(idToken, q)
      const action = prepared.body.pendingActions?.[0]
      if (!prepared.res.ok || !action || action.type !== 'calendar_event') return false
      const confirmed = await confirm(idToken, action.id)
      const ok = confirmed.res.ok && confirmed.body.type === 'calendar_event'
      const eventId = confirmed.body.result?.eventId
      if (eventId) {
        try {
          const calendar = await getCalendar(email)
          await deleteCalendarEvent(calendar, eventId)
        } catch {
          // best-effort cleanup
        }
      }
      return ok
    },
  },
  {
    name: 'email-prepare-confirm',
    run: async () => {
      const q =
        'Preparame un mail para sistemas.ti@bacarsa.com.ar con asunto "PRUEBA — Correo de testing, borrar" y cuerpo "Prueba batería asistente."'
      const prepared = await ask(idToken, q)
      const action = prepared.body.pendingActions?.[0]
      if (!prepared.res.ok || !action || action.type !== 'email') return false
      const confirmed = await confirm(idToken, action.id)
      return confirmed.res.ok && confirmed.body.type === 'email'
    },
  },
  {
    name: 'email-resumen-conversacion',
    run: async () => {
      const q1 = '¿Cuántos archivos PDF hay en el área Sistemas?'
      const first = await ask(idToken, q1)
      const summary = first.body.answer ?? 'Sin respuesta'
      const q2 =
        'Preparame un correo para sistemas.ti@bacarsa.com.ar con asunto "Resumen PDF Sistemas" y en el cuerpo el resumen de tu respuesta anterior.'
      const history = [
        { role: 'user', content: q1 },
        { role: 'assistant', content: summary },
      ]
      const second = await ask(idToken, q2, history)
      const tools = second.body.toolsUsed ?? []
      const hasEmailTool = tools.some((tool) =>
        ['prepare_email_draft', 'orchestrated_prepare_email'].includes(tool),
      )
      return (
        second.res.ok &&
        hasEmailTool &&
        !tools.includes('orchestrated_summarize_batch') &&
        Boolean(second.body.pendingActions?.[0])
      )
    },
  },
  {
    name: 'gmail-read-limitacion',
    run: async () => {
      const r = await ask(idToken, '¿Qué mails me llegaron hoy a la bandeja de entrada?')
      const answer = String(r.body.answer ?? '').toLowerCase()
      return (
        r.res.ok &&
        (answer.includes('no') || answer.includes('limit') || answer.includes('habilit') || answer.includes('disponible'))
      )
    },
  },
  {
    name: 'summarize-3-pdfs',
    run: async () => {
      const r = await ask(idToken, 'Hacé un resumen de los 3 PDF que tengo en Sistemas')
      const tools = r.body.toolsUsed ?? []
      const answer = String(r.body.answer ?? '').toLowerCase()
      const usedSummarize =
        tools.includes('orchestrated_summarize_batch') ||
        tools.filter((t) => t === 'summarize_document').length >= 1
      const noBadLimitation =
        !(answer.includes('search_document_content') && answer.includes('no puedo'))
      return (
        r.res.ok &&
        usedSummarize &&
        noBadLimitation &&
        typeof r.body.answer === 'string' &&
        r.body.answer.length > 120
      )
    },
  },
  {
    name: 'calendar-conflict-warning',
    run: async () => {
      const list = await ask(idToken, `¿Qué tengo en el calendario el ${tomorrow}?`)
      const q = `Preparame un evento el ${tomorrow} de 15:00 a 15:30 titulado "${TEST_EVENT_TITLE}" con descripcion prueba.`
      const prepared = await ask(idToken, q)
      const action = prepared.body.pendingActions?.[0]
      const preview = action?.preview
      const hasConflictInPreview =
        preview &&
        typeof preview === 'object' &&
        Array.isArray(preview.calendarConflicts) &&
        preview.calendarConflicts.length > 0
      const answer = String(prepared.body.answer ?? '').toLowerCase()
      const mentionsConflict =
        answer.includes('superpon') ||
        answer.includes('conflict') ||
        answer.includes('ya ten') ||
        answer.includes('ojo')
      return (
        prepared.res.ok &&
        prepared.body.toolsUsed?.includes('prepare_calendar_event') &&
        (hasConflictInPreview || mentionsConflict || list.body.toolsUsed?.includes('list_calendar_events'))
      )
    },
  },
]

console.log('=== Assistant battery ===')
console.log('User:', email)
console.log('API:', API_BASE)

const results = []
for (const testCase of cases) {
  process.stdout.write(`\n→ ${testCase.name} ... `)
  try {
    const ok = await testCase.run()
    results.push({ name: testCase.name, ok })
    console.log(ok ? 'OK' : 'FAIL')
  } catch (err) {
    results.push({ name: testCase.name, ok: false, error: err instanceof Error ? err.message : String(err) })
    console.log('ERROR', err instanceof Error ? err.message : err)
  }
}

console.log('\n=== Resumen ===')
for (const row of results) {
  console.log(`${row.ok ? '✓' : '✗'} ${row.name}${row.error ? ` (${row.error})` : ''}`)
}

const failed = results.filter((row) => !row.ok)
process.exit(failed.length === 0 ? 0 : 1)
