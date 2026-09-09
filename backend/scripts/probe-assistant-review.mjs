/**
 * Verifica logging + correcciones del asistente.
 *
 *   node backend/scripts/probe-assistant-review.mjs
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
    body: JSON.stringify({ question }),
  })
  const body = await res.json().catch(() => ({}))
  return { res, body }
}

async function listInteractions(token, category) {
  const res = await fetch(
    `${API_BASE}/api/drive/rag/interactions?category=${encodeURIComponent(category)}&limit=5`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const body = await res.json().catch(() => ({}))
  return { res, body }
}

async function createCorrection(token, payload) {
  const res = await fetch(`${API_BASE}/api/drive/rag/corrections`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  return { res, body }
}

const pilot = await getTestIdToken({ requireSuperAdmin: false })
process.env.TEST_EMAIL = 'sistemas.ti@bacarsa.com.ar'
const admin = await getTestIdToken()

const gmailQ = '¿Qué mails me llegaron hoy a la bandeja de entrada?'

console.log('Pilot:', pilot.email)
console.log('Admin:', admin.email)

console.log('\n1) Pregunta Gmail (limitación esperada)')
const gmail = await ask(pilot.idToken, gmailQ)
console.log('  HTTP', gmail.res.status)
console.log('  answer:', String(gmail.body.answer ?? '').slice(0, 140).replace(/\n/g, ' '))

await new Promise((r) => setTimeout(r, 2500))

console.log('\n2) Listar could_not_answer')
const listed = await listInteractions(admin.idToken, 'could_not_answer')
console.log('  HTTP', listed.res.status, '| count', listed.body.count ?? listed.body.interactions?.length)
if (!listed.res.ok) console.log('  error:', listed.body.error)
const match = (listed.body.interactions ?? []).find((row) =>
  String(row.question ?? '').toLowerCase().includes('mail'),
)
console.log('  encontró pregunta gmail:', Boolean(match))

console.log('\n3) Agregar corrección')
const correctionText =
  'No puedo leer tu bandeja de entrada porque solo tenemos habilitado el envío de correos (gmail.send), no la lectura (gmail.readonly). Podés pedirme que prepare un mail saliente.'
const created = await createCorrection(admin.idToken, {
  originalQuestion: gmailQ,
  correctionText,
})
console.log('  HTTP', created.res.status, '| id', created.body.correctionId ?? created.body.error)

console.log('\n4) Repreguntar similar')
const similar = await ask(pilot.idToken, '¿Puedo ver los correos que recibí hoy en Gmail?')
const answer = String(similar.body.answer ?? '').toLowerCase()
console.log('  tools', (similar.body.toolsUsed ?? []).join(', ') || '(none)')
console.log(
  '  usa corrección/readonly:',
  (similar.body.toolsUsed ?? []).includes('corrections_context') ||
    answer.includes('readonly') ||
    answer.includes('gmail.send'),
)
console.log('  answer:', String(similar.body.answer ?? '').slice(0, 200).replace(/\n/g, ' '))

process.exit(0)
