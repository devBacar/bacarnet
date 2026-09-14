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

const url =
  'https://southamerica-east1-bacar-web.cloudfunctions.net/api/api/helpdesk/campana/generar-enlace'
const body = JSON.stringify({
  email: 'surlymeyer@gmail.com',
  nombre: 'Surly Meyer',
  areaNombre: 'Seguridad de Planta',
})

const cases = [
  ['sin header', {}],
  ['X-Api-Key vacío', { 'X-Api-Key': '' }],
  ['X-Api-Key literal {{api_key}}', { 'X-Api-Key': '{{api_key}}' }],
  ['HELPDESK_N8N_API_KEY (nombre viejo) + inbound value', { HELPDESK_N8N_API_KEY: process.env.HELPDESK_N8N_API_KEY }],
  ['X-Api-Key + outbound key', { 'X-Api-Key': process.env.HELPDESK_N8N_OUTBOUND_API_KEY }],
  ['X-Api-Key + inbound key', { 'X-Api-Key': process.env.HELPDESK_N8N_API_KEY }],
]

for (const [label, extraHeaders] of cases) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body,
  })
  const t = await r.text()
  console.log(label, '→', r.status, t.slice(0, 100))
}
