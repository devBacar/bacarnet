/**
 * Verifica mensaje claro al pedir más de 3 PDF.
 *
 *   node backend/scripts/probe-summarize-limit.mjs
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

const { idToken } = await getTestIdToken({ requireSuperAdmin: false })
const question = 'Haceme un resumen de todos los archivos PDF y Word que tengo'

console.log('=== probe summarize limit ===')
console.log('Pregunta:', question)

const result = await ask(idToken, question)
const answer = String(result.body.answer ?? '')
console.log('HTTP', result.res.status)
console.log('tools:', (result.body.toolsUsed ?? []).join(', '))
console.log('answer preview:\n', answer.slice(0, 800))

const checks = {
  mentionsLimit: /hasta\s+\*?\*?3|3\s+documentos\s+por\s+mensaje|hasta\s+3/i.test(answer),
  mentionsRemaining: /quedan|pendiente|continu[aá]|pr[oó]ximo\s+mensaje/i.test(answer),
  summarizesSome: (result.body.toolsUsed ?? []).includes('orchestrated_summarize_batch'),
}

console.log('\nChecks:', checks)
const ok = result.res.ok && checks.mentionsLimit && checks.mentionsRemaining && checks.summarizesSome
console.log(ok ? 'PASS' : 'FAIL')
process.exit(ok ? 0 : 1)
