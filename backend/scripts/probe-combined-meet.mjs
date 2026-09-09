/**
 * Reproduce pedido combinado con Meet.
 *   node backend/scripts/probe-combined-meet.mjs
 *   node backend/scripts/probe-combined-meet.mjs 3
 */

import { getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const API_BASE = process.env.RAG_API_BASE_URL ?? 'https://bacarnet.web.app'
const RUNS = Number.parseInt(process.argv[2] ?? '2', 10)

const QUESTION =
  "Hacé un resumen de los PDF que tengo en mi carpeta, cuando tengas ese resumen enviale un correo a admin@bacarsa.com.ar con el asunto 'Info de prueba' e invitalo a una meet mañana a las 10 para conversar este tema"

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
console.log('User:', email)
console.log('Question:', QUESTION.slice(0, 100) + '...')

for (let i = 1; i <= RUNS; i += 1) {
  console.log(`\n--- Run ${i}/${RUNS} ---`)
  const r = await ask(idToken, QUESTION)
  console.log('HTTP', r.res.status, `(${r.ms}ms)`)
  console.log('tools:', (r.body.toolsUsed ?? []).join(', ') || '(none)')
  console.log('pendingActions:', (r.body.pendingActions ?? []).map((a) => a.type).join(', ') || '(none)')
  if (!r.res.ok) {
    console.log('ERROR body:', JSON.stringify(r.body, null, 2))
  } else {
    console.log('answer:', String(r.body.answer ?? '').slice(0, 220).replace(/\n/g, ' '))
  }
}
