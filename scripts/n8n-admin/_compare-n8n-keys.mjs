import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
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

function mask(s) {
  if (!s) return '(vacío)'
  if (s.length <= 8) return `${s.length} chars`
  return `${s.slice(0, 4)}…${s.slice(-4)} (${s.length} chars)`
}

const inbound = process.env.HELPDESK_N8N_API_KEY?.trim() ?? ''
const outbound = process.env.HELPDESK_N8N_OUTBOUND_API_KEY?.trim() ?? ''

console.log('HELPDESK_N8N_API_KEY (entrante):', mask(inbound))
console.log('HELPDESK_N8N_OUTBOUND_API_KEY (saliente):', mask(outbound))
console.log('¿Son iguales entre sí?', inbound && outbound ? inbound === outbound : 'N/A')

const BASE = 'https://bacarit.app.n8n.cloud/api/v1'
const key = process.env.N8N_MGMT_API_KEY?.trim()
const credId = 'pZsIZp5UuSV51nBb'
for (const path of [`/credentials/${credId}`, `/credentials?id=${credId}`]) {
  const res = await fetch(BASE + path, { headers: { 'X-N8N-API-KEY': key, Accept: 'application/json' } })
  const text = await res.text()
  console.log(`\nGET ${path} → ${res.status}`, text.slice(0, 800))
}
