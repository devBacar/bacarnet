/**
 * Verifica routing consulta vs creación de agenda (prod).
 *   node backend/scripts/test-calendar-routing.mjs
 */

import { getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const API_BASE = process.env.RAG_API_BASE_URL ?? 'https://bacarnet.web.app'

async function ask(token, question) {
  const res = await fetch(`${API_BASE}/api/drive/ask`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question, history: [] }),
  })
  const body = await res.json().catch(() => ({}))
  return {
    status: res.status,
    ok: res.ok,
    tools: body.toolsUsed ?? [],
    answer: String(body.answer ?? body.error ?? ''),
    pendingActions: body.pendingActions ?? [],
  }
}

const { idToken } = await getTestIdToken({ requireSuperAdmin: false })

const readCases = [
  '¿Cuál es mi agenda hoy?',
  '¿Qué tengo mañana?',
  'Mostrame mi agenda de la semana',
  '¿Tengo algo agendado para el viernes?',
]

const createCases = [
  'Agendame una reunión mañana a las 10',
  'Agendá algo con Juan el jueves',
]

let failed = 0

for (const question of readCases) {
  const result = await ask(idToken, question)
  const routedRead =
    result.ok &&
    !result.answer.includes('plan de acciones') &&
    (result.tools.includes('orchestrated_list_calendar_events') ||
      result.tools.includes('list_calendar_events'))
  console.log(`${routedRead ? '✓' : '✗'} READ  ${question}`)
  if (!routedRead) {
    failed += 1
    console.log(`    tools: ${result.tools.join(', ') || '(ninguna)'}`)
    console.log(`    answer: ${result.answer.slice(0, 160).replace(/\n/g, ' ')}`)
  }
}

for (const question of createCases) {
  const result = await ask(idToken, question)
  const routedCreate =
    result.ok &&
    !result.answer.includes('No se pudo extraer un plan de acciones') &&
    (result.tools.includes('orchestrated_extract_action_plan') ||
      result.pendingActions?.length > 0 ||
      result.tools.some((tool) => tool.includes('prepare_calendar')))
  console.log(`${routedCreate ? '✓' : '✗'} CREATE ${question}`)
  if (!routedCreate) {
    failed += 1
    console.log(`    tools: ${result.tools.join(', ') || '(ninguna)'}`)
    console.log(`    answer: ${result.answer.slice(0, 160).replace(/\n/g, ' ')}`)
  }
}

console.log(failed === 0 ? '\nOK' : `\n${failed} fallo(s)`)
process.exit(failed === 0 ? 0 : 1)
