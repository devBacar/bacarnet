/**
 * Verifica rate limit ampliado (50/15min) en prod para generar-enlace.
 *
 *   node backend/scripts/test-helpdesk-generar-enlace-rate-limit-prod.mjs
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROD_BASE =
  process.env.FUNCTIONS_API_BASE?.trim()?.replace(/\/+$/, '') ||
  'https://bacarnet.web.app'
const N8N_HEADER = 'X-Api-Key'
const CALLS = 15

function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadEnvFile(resolve(SCRIPTS_DIR, '.env'))
loadEnvFile(resolve(SCRIPTS_DIR, '.env.local'))

const apiKey = process.env.HELPDESK_N8N_API_KEY?.trim()
if (!apiKey) throw new Error('HELPDESK_N8N_API_KEY requerida')

const url = `${PROD_BASE}/api/helpdesk/campana/generar-enlace`
const body = {
  email: 'rate-limit-probe@bacarsa.com.ar',
  nombre: 'Rate Limit Probe',
  areaNombre: 'Sistemas',
}

const statuses = []
for (let i = 0; i < CALLS; i++) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      [N8N_HEADER]: apiKey,
    },
    body: JSON.stringify({ ...body, email: `rate-limit-probe+${i}@bacarsa.com.ar` }),
  })
  statuses.push(res.status)
  if (res.status === 429) {
    const json = await res.json().catch(() => ({}))
    console.log(`429 en llamada ${i + 1}/${CALLS}`, json)
    break
  }
}

const count429 = statuses.filter((s) => s === 429).length
const count200 = statuses.filter((s) => s === 200).length
console.log(`Base: ${PROD_BASE}`)
console.log(`Llamadas: ${statuses.length}, 200: ${count200}, 429: ${count429}`)
console.log('Status por llamada:', statuses.join(', '))

if (count429 > 0 && statuses.findIndex((s) => s === 429) < 10) {
  console.error('\nFAIL: 429 antes de superar 10 llamadas (límite viejo?)')
  process.exit(1)
}
if (count200 < 11) {
  console.error('\nFAIL: menos de 11 respuestas 200')
  process.exit(1)
}
console.log('\n✅ PASS: más de 10 llamadas seguidas sin 429 (hasta', count200, 'x 200)')
