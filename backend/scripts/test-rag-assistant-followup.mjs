/**
 * Prueba memoria conversacional + auditoría (prod).
 *
 *   node backend/scripts/test-rag-assistant-followup.mjs
 *   node backend/scripts/test-rag-assistant-followup.mjs --case=audit-denied
 */

import { getTestIdToken, loadTestEnv } from './get-test-token.mjs'

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

const caseKey = process.argv.find((arg) => arg.startsWith('--case='))?.split('=')[1] ?? 'followup'
const requireSuperAdmin = caseKey !== 'audit-denied'
const { idToken, email } = await getTestIdToken({ requireSuperAdmin })

console.log('=== RAG assistant follow-up ===')
console.log(`Caso: ${caseKey}`)
console.log(`Usuario: ${email}`)

if (caseKey === 'followup') {
  const q1 = '¿Cuántos archivos PDF hay en el área?'
  const first = await ask(idToken, q1)
  console.log(`\n[1] ${q1}`)
  console.log(`HTTP ${first.res.status} · ${first.ms} ms`)
  console.log(first.body.answer ?? first.body.error)
  console.log('tools:', first.body.toolsUsed)

  const q2 = '¿Y quién subió el más reciente de esos PDF?'
  const history = [
    { role: 'user', content: q1 },
    { role: 'assistant', content: first.body.answer ?? '' },
  ]
  const second = await ask(idToken, q2, history)
  console.log(`\n[2] ${q2}`)
  console.log(`HTTP ${second.res.status} · ${second.ms} ms`)
  console.log(second.body.answer ?? second.body.error)
  console.log('tools:', second.body.toolsUsed)

  const ok =
    second.res.ok &&
    typeof second.body.answer === 'string' &&
    !second.body.answer.match(/\b[a-zA-Z0-9]{20,}\b/)
  process.exit(ok ? 0 : 1)
}

if (caseKey === 'audit') {
  const q = '¿Quién otorgó permisos recientemente sobre archivos?'
  const result = await ask(idToken, q)
  console.log(`\nPregunta: ${q}`)
  console.log(`HTTP ${result.res.status} · ${result.ms} ms`)
  console.log(JSON.stringify(result.body, null, 2))
  const ok =
    result.res.ok &&
    Array.isArray(result.body.toolsUsed) &&
    result.body.toolsUsed.includes('query_audit_logs')
  process.exit(ok ? 0 : 1)
}

if (caseKey === 'audit-denied') {
  const q = '¿Quién aprobó permisos en auditoría la semana pasada?'
  const result = await ask(idToken, q)
  console.log(`\nPregunta: ${q}`)
  console.log(`HTTP ${result.res.status} · ${result.ms} ms`)
  console.log(result.body.answer ?? result.body.error)
  const denied =
    typeof result.body.answer === 'string' &&
    (result.body.answer.toLowerCase().includes('administr') ||
      result.body.answer.toLowerCase().includes('auditoría'))
  process.exit(result.res.ok && denied ? 0 : 1)
}

console.error('Caso desconocido')
process.exit(1)
