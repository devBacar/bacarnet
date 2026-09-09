/**
 * Prueba herramientas de metadata del asistente RAG en prod.
 *
 *   node backend/scripts/test-rag-metadata-tools.mjs
 *   node backend/scripts/test-rag-metadata-tools.mjs --case=cumplimiento
 *   TEST_EMAIL=otro@bacarsa.com.ar node backend/scripts/test-rag-metadata-tools.mjs --case=no-access
 */

import { getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const API_BASE = process.env.RAG_API_BASE_URL ?? 'https://bacarnet.web.app'

const CASES = {
  count: {
    label: 'Conteo por tipo en Sistemas',
    question: '¿Cuántos archivos hay en Sistemas, separados por tipo?',
    expectOk: true,
    expectTools: ['count_files_by_type'],
  },
  cumplimiento: {
    label: 'Bloqueo regulatorio Cumplimiento',
    question: '¿Cuántos archivos hay en Cumplimiento por tipo?',
    expectStatus: 403,
    expectCode: 'RAG_REGULATORY_AREA_EXCLUDED',
  },
  'no-access': {
    label: 'Usuario sin acceso al piloto',
    question: '¿Cuántos archivos hay en Sistemas por tipo?',
    expectStatus: 503,
    expectCode: 'RAG_PILOT_DISABLED',
    requireSuperAdmin: false,
  },
}

function parseArg(name) {
  const prefix = `--${name}=`
  const hit = process.argv.find((arg) => arg.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : null
}

const caseKey = parseArg('case') ?? 'count'
const testCase = CASES[caseKey]
if (!testCase) {
  console.error(`Caso desconocido: ${caseKey}. Opciones: ${Object.keys(CASES).join(', ')}`)
  process.exit(1)
}

const requireSuperAdmin = testCase.requireSuperAdmin !== false
const { idToken, email } = await getTestIdToken({ requireSuperAdmin })

const started = Date.now()
const res = await fetch(`${API_BASE}/api/drive/ask`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${idToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ question: testCase.question }),
})
const body = await res.json().catch(() => ({}))

console.log('=== RAG metadata tools ===')
console.log(`Caso: ${testCase.label}`)
console.log(`Usuario: ${email}`)
console.log(`Pregunta: ${testCase.question}`)
console.log(`HTTP ${res.status} · ${Date.now() - started} ms`)
console.log(JSON.stringify(body, null, 2))

let ok = true

if (testCase.expectStatus !== undefined && res.status !== testCase.expectStatus) {
  console.error(`FAIL: se esperaba HTTP ${testCase.expectStatus}, recibido ${res.status}`)
  ok = false
}

if (testCase.expectCode && body.code !== testCase.expectCode) {
  console.error(`FAIL: se esperaba code ${testCase.expectCode}, recibido ${body.code ?? '—'}`)
  ok = false
}

if (testCase.expectOk && !res.ok) {
  console.error('FAIL: se esperaba respuesta OK')
  ok = false
}

if (testCase.expectTools?.length) {
  const used = Array.isArray(body.toolsUsed) ? body.toolsUsed : []
  for (const tool of testCase.expectTools) {
    if (!used.includes(tool)) {
      console.error(`FAIL: se esperaba tool ${tool} en toolsUsed (${used.join(', ') || 'vacío'})`)
      ok = false
    }
  }
}

if (testCase.expectOk && body.answer) {
  console.log('\n--- Respuesta ---')
  console.log(body.answer)
  if (/\d+/.test(body.answer)) {
    console.log('OK: la respuesta incluye números (conteo real esperado).')
  } else {
    console.warn('WARN: la respuesta no parece incluir números.')
  }
}

process.exit(ok ? 0 : 1)
