/**
 * Reset filas de prueba en jefes_areas (enviado=false, fecha_envio=null).
 *
 *   node scripts/n8n-admin/reset-jefes-test-rows.mjs
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const BASE = 'https://bacarit.app.n8n.cloud/api/v1'
const TABLE_ID = 'H89zKU8ofZrpbFP5'
const ROW_IDS = [1, 2]

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
const key = process.env.N8N_MGMT_API_KEY?.trim()
if (!key) throw new Error('N8N_MGMT_API_KEY missing')

const headers = {
  'X-N8N-API-KEY': key,
  Accept: 'application/json',
  'Content-Type': 'application/json',
}

async function patchRow(id) {
  const url = `${BASE}/data-tables/${TABLE_ID}/rows/update`
  const body = {
    filter: {
      type: 'and',
      filters: [{ columnName: 'id', condition: 'eq', value: id }],
    },
    data: { enviado: false, fecha_envio: null },
    returnData: true,
  }
  const res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(body) })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  if (!res.ok) {
    console.error(`PATCH id=${id} failed`, res.status, json)
    process.exit(1)
  }
  console.log(`PATCH id=${id} →`, JSON.stringify(json, null, 2))
}

for (const id of ROW_IDS) {
  await patchRow(id)
}

const getRes = await fetch(`${BASE}/data-tables/${TABLE_ID}/rows`, { headers: { 'X-N8N-API-KEY': key, Accept: 'application/json' } })
const getJson = await getRes.json()
const rows = (getJson.data ?? []).filter((r) => ROW_IDS.includes(r.id))
console.log('\n=== GET verificación (ids 1 y 2) ===')
console.log(JSON.stringify(rows, null, 2))

const ok = rows.length === 2 && rows.every((r) => r.enviado === false && (r.fecha_envio === null || r.fecha_envio === undefined))
console.log(ok ? '\nOK: ambas con enviado=false y fecha_envio vacía' : '\nFAIL: revisar valores arriba')
process.exit(ok ? 0 : 1)
