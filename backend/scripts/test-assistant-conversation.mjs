/**
 * Prueba multi-turno que replica la conversación real reportada.
 *
 *   node backend/scripts/test-assistant-conversation.mjs
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

function assert(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  return ok
}

const { idToken, email } = await getTestIdToken({ requireSuperAdmin: false })
const history = []
let failed = 0

console.log('=== Conversación multi-turno ===')
console.log('User:', email)
console.log('API:', API_BASE)

async function turn(question, checks) {
  console.log(`\n→ Usuario: ${question}`)
  const result = await ask(idToken, question, history)
  console.log(`  HTTP ${result.res.status} (${result.ms}ms)`)
  console.log(`  tools: ${(result.body.toolsUsed ?? []).join(', ') || '(ninguna)'}`)
  const answer = String(result.body.answer ?? '')
  console.log(`  respuesta (${answer.length} chars): ${answer.slice(0, 180).replace(/\n/g, ' ')}...`)

  history.push({ role: 'user', content: question })
  history.push({ role: 'assistant', content: answer })

  for (const check of checks) {
    if (!check(result)) failed += 1
  }
  return result
}

await turn('¿Qué tengo mañana en el calendario?', [
  (r) =>
    assert(
      'calendario-responde',
      r.res.ok && r.body.toolsUsed?.includes('list_calendar_events'),
    ),
  (r) => {
    const events = r.body.answer ?? ''
    const matches = events.match(/PRUEBA — Evento de testing, borrar/gi) ?? []
    return assert(
      'calendario-sin-duplicados-visibles',
      matches.length <= 1,
      matches.length > 1 ? `aparece ${matches.length} veces` : 'ok',
    )
  },
])

await turn('¿Qué archivos tengo en mi carpeta?', [
  (r) =>
    assert(
      'listado-responde',
      r.res.ok &&
        (r.body.toolsUsed?.includes('orchestrated_list_files') ||
          r.body.toolsUsed?.includes('list_accessible_files')),
    ),
  (r) => {
    const answer = String(r.body.answer ?? '').toLowerCase()
    const mentionsWord =
      answer.includes('.docx') ||
      answer.includes('word') ||
      answer.includes('atm.docx')
    return assert('listado-incluye-word', mentionsWord, mentionsWord ? 'ok' : 'faltan docx')
  },
])

await turn('Haceme un resumen de los 3 archivos pdf que tengo', [
  (r) => assert('resumen-http-ok', r.res.ok, `status ${r.res.status}`),
  (r) =>
    assert(
      'resumen-usa-orquestador',
      (r.body.toolsUsed ?? []).includes('orchestrated_summarize_batch'),
    ),
  (r) => {
    const answer = String(r.body.answer ?? '').toLowerCase()
    const badLimitation =
      answer.includes('search_document_content') &&
      answer.includes('no puedo') &&
      !answer.includes('acá van los resúmenes')
    return assert('resumen-sin-mensaje-limitacion', !badLimitation)
  },
  (r) => assert('resumen-contenido', String(r.body.answer ?? '').length > 120),
])

await turn(
  'Hacé un resumen de todos los archivos y enviale a sistemas.ti@bacarsa.com.ar el correo con los resúmenes, y armá un evento mañana de 11:00 a 11:30 titulado "Seguimiento resúmenes".',
  [
    (r) => assert('combinado-http-ok', r.res.ok, `status ${r.res.status}`),
    (r) => {
      const answer = String(r.body.answer ?? '').toLowerCase()
      const loops =
        (answer.match(
          /qu[eé] archivos quer[eé]s|cu[aá]les archivos quer[eé]s|cu[aá]les documentos quer[eé]s resumir/gi,
        ) ?? []).length >= 1
      return assert('combinado-sin-bucle-aclaracion', !loops)
    },
    (r) =>
      assert(
        'combinado-prepara-acciones',
        (r.body.toolsUsed ?? []).some((tool) =>
          [
            'prepare_email_draft',
            'prepare_calendar_event',
            'orchestrated_prepare_email',
            'orchestrated_prepare_calendar',
          ].includes(tool),
        ) || Boolean(r.body.pendingActions?.length),
        'mail o calendario preparados',
      ),
  ],
)

await turn('Eso lo tenés que saber vos, usá los PDF y Word que ya listaste. Bueno, hacelo entonces.', [
  (r) => assert('frustracion-http-ok', r.res.ok),
  (r) => {
    const answer = String(r.body.answer ?? '').toLowerCase()
    return assert(
      'frustracion-no-repregunta',
      !answer.includes('¿cuáles archivos') && !answer.includes('qué archivos querés'),
    )
  },
])

console.log(`\n=== Resultado: ${failed === 0 ? 'PASS' : `FAIL (${failed} checks)`} ===`)
process.exit(failed === 0 ? 0 : 1)
