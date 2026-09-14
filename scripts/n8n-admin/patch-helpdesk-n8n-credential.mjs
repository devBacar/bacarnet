/**
 * PATCH credencial Helpdesk N8N API Key con HELPDESK_N8N_API_KEY de .env.local
 *   node scripts/n8n-admin/patch-helpdesk-n8n-credential.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const BASE = 'https://bacarit.app.n8n.cloud/api/v1'
const CRED_ID = 'pZsIZp5UuSV51nBb'

function loadEnv() {
  for (const line of readFileSync(resolve(ROOT, 'backend/.env.local'), 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[k] === undefined) process.env[k] = v
  }
}

loadEnv()
const mgmt = process.env.N8N_MGMT_API_KEY?.trim()
const apiKey = process.env.HELPDESK_N8N_API_KEY?.trim()
if (!mgmt) throw new Error('N8N_MGMT_API_KEY missing')
if (!apiKey) throw new Error('HELPDESK_N8N_API_KEY missing')

const headers = {
  'X-N8N-API-KEY': mgmt,
  Accept: 'application/json',
  'Content-Type': 'application/json',
}

const placeholderValues = JSON.stringify({ api_key: apiKey })

const patchRes = await fetch(`${BASE}/credentials/${CRED_ID}`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({
    data: { placeholderValues },
    isPartialData: true,
  }),
})
const patchJson = await patchRes.json().catch(() => ({}))
if (!patchRes.ok) {
  console.error('PATCH failed', patchRes.status, patchJson)
  process.exit(1)
}

/** GET público suele omitir `data`; probamos variantes por si la instancia expone metadatos enmascarados. */
const getAttempts = [
  `${BASE}/credentials/${CRED_ID}`,
  `${BASE}/credentials/${CRED_ID}?includeData=true`,
]
const getResults = []
for (const url of getAttempts) {
  const res = await fetch(url, { headers: { 'X-N8N-API-KEY': mgmt, Accept: 'application/json' } })
  const json = await res.json().catch(() => ({}))
  getResults.push({ url, status: res.status, body: json })
}

function describePlaceholderValues(data) {
  if (!data || typeof data !== 'object') return { present: false }
  const pv = data.placeholderValues
  if (pv === undefined) return { present: false, note: 'sin campo data.placeholderValues en GET' }
  const t = typeof pv
  if (t === 'string') {
    let parsed = null
    let parseOk = false
    try {
      parsed = JSON.parse(pv)
      parseOk = typeof parsed === 'object' && parsed !== null && 'api_key' in parsed
    } catch {
      parseOk = false
    }
    return {
      present: true,
      typeof: 'string',
      length: pv.length,
      parseOk,
      maskedPreview: pv.includes('api_key') ? '{ "api_key": "<redacted or value>" }' : pv.slice(0, 80),
      apiKeyLength: parseOk && typeof parsed.api_key === 'string' ? parsed.api_key.length : null,
    }
  }
  return { present: true, typeof: t, problem: 'debería ser string, no objeto' }
}

const verification = {
  patch: { ok: true, updatedAt: patchJson.updatedAt },
  sentPlaceholderValuesFormat: {
    typeof: 'string',
    length: placeholderValues.length,
    hasApiKeyField: placeholderValues.includes('"api_key"'),
  },
  getCredential: getResults.map((g) => ({
    url: g.url,
    status: g.status,
    updatedAt: g.body.updatedAt,
    placeholderValues: describePlaceholderValues(g.body.data),
  })),
}

console.log(JSON.stringify(verification, null, 2))

const getData = getResults.find((g) => g.status === 200)?.body?.data
const pvCheck = describePlaceholderValues(getData)
const ok =
  pvCheck.parseOk ||
  (pvCheck.present && pvCheck.typeof === 'string' && pvCheck.parseOk !== false) ||
  (!getData && patchRes.ok)

if (getData?.placeholderValues && typeof getData.placeholderValues === 'object') {
  console.error('\nFAIL: placeholderValues sigue siendo objeto en GET')
  process.exit(1)
}

if (getData?.placeholderValues && typeof getData.placeholderValues === 'string') {
  try {
    JSON.parse(getData.placeholderValues)
  } catch {
    console.error('\nFAIL: placeholderValues string no parsea como JSON')
    process.exit(1)
  }
}

if (!patchRes.ok) process.exit(1)
console.error('\nPATCH aplicado. Si GET no expone data, validación final: ejecutar Programar Envío en n8n.')
process.exit(0)
