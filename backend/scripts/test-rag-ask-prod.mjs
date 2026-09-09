/**
 * Prueba POST /api/drive/ask en prod.
 *   TEST_EMAIL=sistemas.ti@bacarsa.com.ar node backend/scripts/test-rag-ask-prod.mjs
 */

import { getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const API_BASE = process.env.RAG_API_BASE_URL ?? 'https://bacarnet.web.app'
const question =
  process.argv[2] ??
  '¿Cómo instalo el driver ASR de Queclink para las cámaras?'

const requireSuperAdmin = process.env.TEST_REQUIRE_SUPER_ADMIN !== 'false'
const { idToken, email } = await getTestIdToken({ requireSuperAdmin })
const started = Date.now()
const res = await fetch(`${API_BASE}/api/drive/ask`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${idToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ question }),
})
const body = await res.json().catch(() => ({}))

console.log('=== RAG ask prod ===')
console.log(`Usuario: ${email}`)
console.log(`Pregunta: ${question}`)
console.log(`HTTP ${res.status} · ${Date.now() - started} ms`)
console.log(JSON.stringify(body, null, 2))

if (body.answer) {
  console.log('\n--- Respuesta ---')
  console.log(body.answer)
  if (Array.isArray(body.citations) && body.citations.length > 0) {
    console.log('\n--- Fuentes ---')
    for (const [i, c] of body.citations.entries()) {
      console.log(`[${i + 1}] ${c.fileName}`)
      if (c.webViewLink) console.log(`    ${c.webViewLink}`)
    }
  }
}

process.exit(res.ok ? 0 : 1)
