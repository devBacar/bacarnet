/**
 * Repite el caso email-resumen-conversacion N veces para medir determinismo.
 *
 *   node backend/scripts/probe-email-resumen-conversacion.mjs
 *   node backend/scripts/probe-email-resumen-conversacion.mjs 5
 */

import { getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const API_BASE = process.env.RAG_API_BASE_URL ?? 'https://bacarnet.web.app'
const RUNS = Number.parseInt(process.argv[2] ?? '4', 10)

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

const { idToken, email } = await getTestIdToken({ requireSuperAdmin: false })
console.log('=== probe email-resumen-conversacion ===')
console.log('User:', email)
console.log('Runs:', RUNS)

const q1 = '¿Cuántos archivos PDF hay en el área Sistemas?'
const q2 =
  'Preparame un correo para sistemas.ti@bacarsa.com.ar con asunto "Resumen PDF Sistemas" y en el cuerpo el resumen de tu respuesta anterior.'

const results = []

for (let i = 1; i <= RUNS; i += 1) {
  console.log(`\n--- Run ${i}/${RUNS} ---`)
  const first = await ask(idToken, q1)
  const summary = first.body.answer ?? 'Sin respuesta'
  console.log(`  turn1: HTTP ${first.res.status} tools=${(first.body.toolsUsed ?? []).join(',') || 'none'}`)

  const history = [
    { role: 'user', content: q1 },
    { role: 'assistant', content: summary },
  ]
  const second = await ask(idToken, q2, history)
  const tools = second.body.toolsUsed ?? []
  const hasPrepare =
    tools.includes('prepare_email_draft') || tools.includes('orchestrated_prepare_email')
  const wronglySummarized = tools.includes('orchestrated_summarize_batch')
  const hasPending = Boolean(second.body.pendingActions?.[0])
  const ok = second.res.ok && hasPrepare && hasPending && !wronglySummarized

  console.log(`  turn2: HTTP ${second.res.status} (${second.ms}ms)`)
  console.log(`  tools: ${tools.join(', ') || '(ninguna)'}`)
  console.log(`  pendingAction: ${hasPending ? second.body.pendingActions[0].type : 'no'}`)
  console.log(`  answer: ${String(second.body.answer ?? '').slice(0, 160).replace(/\n/g, ' ')}`)
  console.log(`  PASS: ${ok}`)

  results.push({ ok, tools, hasPrepare, hasPending, status: second.res.status })
}

const passed = results.filter((r) => r.ok).length
console.log(`\n=== Resumen: ${passed}/${RUNS} PASS ===`)
for (const [idx, row] of results.entries()) {
  console.log(
    `  run ${idx + 1}: ${row.ok ? 'OK' : 'FAIL'} | status=${row.status} prepare=${row.hasPrepare} pending=${row.hasPending} tools=[${row.tools.join(',')}]`,
  )
}
process.exit(passed === RUNS ? 0 : 1)
