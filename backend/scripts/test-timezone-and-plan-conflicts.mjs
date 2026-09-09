/**
 * Batería: timezone + conflictos intra-plan.
 *   node backend/scripts/test-timezone-and-plan-conflicts.mjs
 */

import { getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

process.env.TEST_EMAIL =
  process.env.TEST_EMAIL?.trim() || 'implementaciones.it@bacarsa.com.ar'

const API_BASE = process.env.RAG_API_BASE_URL ?? 'https://bacarnet.web.app'

function extractHour(isoFloating) {
  if (typeof isoFloating !== 'string') return null
  const match = /T(\d{2}):(\d{2})/.exec(isoFloating)
  if (!match) return null
  return Number.parseInt(match[1], 10)
}

async function ask(token, question) {
  const started = Date.now()
  const res = await fetch(`${API_BASE}/api/drive/ask`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question, history: [] }),
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body, ms: Date.now() - started }
}

function assertTimezoneHour(body, expectedHour, label) {
  const events = (body.pendingActions ?? []).filter((a) => a.type === 'calendar_event')
  if (events.length === 0) throw new Error(`${label}: no hay eventos preparados`)
  const event = events[0]
  const hour = extractHour(event.preview?.startDateTime)
  if (hour !== expectedHour) {
    throw new Error(
      `${label}: se pidió ${expectedHour}:00 pero preview.startDateTime=${event.preview?.startDateTime} (hora ${hour})`,
    )
  }
}

function assertPlanOverlapWarnings(body, label) {
  const events = (body.pendingActions ?? []).filter((a) => a.type === 'calendar_event')
  if (events.length < 2) {
    throw new Error(`${label}: se esperaban ≥2 eventos, hay ${events.length}`)
  }
  for (const event of events) {
    const conflicts = event.preview?.calendarConflicts ?? []
    const planConflict = conflicts.some((c) =>
      String(c.title).includes('(otro evento de este pedido)'),
    )
    if (!planConflict) {
      throw new Error(
        `${label}: evento "${event.preview?.title}" sin aviso de conflicto intra-plan. conflicts=${JSON.stringify(conflicts)}`,
      )
    }
  }
}

const TIMEZONE_CASES = [
  { hour: 10, question: 'Agendame mañana a las 10 una reunión de prueba timezone con admin@bacarsa.com.ar' },
  { hour: 14, question: 'Agendame mañana a las 14 una reunión de prueba timezone con admin@bacarsa.com.ar' },
  { hour: 16, question: 'Agendame mañana a las 16 una reunión de prueba timezone con admin@bacarsa.com.ar' },
]

const OVERLAP_QUESTION =
  'Agendame dos eventos mañana a las 11: uno presencial en la oficina con admin@bacarsa.com.ar y sistemas.ti@bacarsa.com.ar, y otro meet con implementaciones.it@bacarsa.com.ar para el mismo tema'

const { idToken, email } = await getTestIdToken({ requireSuperAdmin: false })
console.log('User:', email)
console.log('API:', API_BASE)

let failed = 0

console.log('\n=== Warmup ===')
await ask(idToken, '¿Qué correos tengo hoy?')

for (let i = 0; i < TIMEZONE_CASES.length; i += 1) {
  const testCase = TIMEZONE_CASES[i]
  const label = `timezone-${testCase.hour}h-run-${i + 1}`
  console.log(`\n=== ${label} ===`)
  let passed = false
  for (let attempt = 1; attempt <= 2 && !passed; attempt += 1) {
    if (attempt > 1) console.log(`  Reintento ${attempt}/2…`)
    try {
      const result = await ask(idToken, testCase.question)
      console.log('HTTP', result.status, `(${result.ms}ms)`)
      if (!result.ok) throw new Error(JSON.stringify(result.body))
      assertTimezoneHour(result.body, testCase.hour, label)
      console.log(`PASS — preview a las ${testCase.hour}:00`)
      passed = true
    } catch (err) {
      if (attempt === 2) {
        failed += 1
        console.error('FAIL:', err instanceof Error ? err.message : err)
      }
    }
  }
}

for (let run = 1; run <= 3; run += 1) {
  const label = `overlap-run-${run}/3`
  console.log(`\n=== ${label} ===`)
  let passed = false
  for (let attempt = 1; attempt <= 2 && !passed; attempt += 1) {
    if (attempt > 1) console.log(`  Reintento ${attempt}/2…`)
    try {
      const result = await ask(idToken, OVERLAP_QUESTION)
      console.log('HTTP', result.status, `(${result.ms}ms)`)
      console.log(
        'events:',
        (result.body.pendingActions ?? [])
          .filter((a) => a.type === 'calendar_event')
          .map((a) => a.preview?.title)
          .join(' | '),
      )
      if (!result.ok) throw new Error(JSON.stringify(result.body))
      assertPlanOverlapWarnings(result.body, label)
      console.log('PASS — ambos eventos con aviso intra-plan')
      passed = true
    } catch (err) {
      if (attempt === 2) {
        failed += 1
        console.error('FAIL:', err instanceof Error ? err.message : err)
      }
    }
  }
}

console.log('\n=== RESUMEN ===')
if (failed > 0) {
  console.error(`FALLARON ${failed} prueba(s)`)
  process.exit(1)
}
console.log('TODAS LAS PRUEBAS PASS')
