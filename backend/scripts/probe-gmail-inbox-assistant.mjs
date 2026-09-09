/**
 * Prueba asistente: bandeja Gmail de hoy vía API.
 *   node backend/scripts/probe-gmail-inbox-assistant.mjs
 */

import { getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const API_BASE = process.env.RAG_API_BASE_URL ?? 'https://bacarnet.web.app'
const QUESTION = '¿Qué correos tengo hoy?'

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
console.log('Question:', QUESTION)

const r = await ask(idToken, QUESTION)
console.log('HTTP', r.res.status, `(${r.ms}ms)`)
console.log('tools:', (r.body.toolsUsed ?? []).join(', ') || '(none)')

if (!r.res.ok) {
  console.log('ERROR body:', JSON.stringify(r.body, null, 2))
  process.exit(1)
}

const answer = String(r.body.answer ?? '')
console.log('answer:', answer.slice(0, 500).replace(/\n/g, ' '))

if (
  !/orchestrated_list_inbox_today|list_inbox_today/.test((r.body.toolsUsed ?? []).join(',')) &&
  !/\*\*.*\*\*/.test(answer) &&
  !/correo/i.test(answer)
) {
  console.error('\nFAIL: respuesta no parece contener correos reales')
  process.exit(1)
}

if (/limitaci[oó]n|gmail\.readonly|no (est[aá]|tengo) habilitad/i.test(answer)) {
  console.error('\nFAIL: respuesta indica limitación de Gmail readonly')
  process.exit(1)
}

console.log('\nGMAIL_INBOX_ASSISTANT_OK')
