/**
 * Marca respondido=true para eduardo.asinardi@bacarsa.com.ar (sin tocar area).
 *
 *   node scripts/n8n-admin/mark-eduardo-respondido.mjs
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const BASE = 'https://bacarit.app.n8n.cloud/api/v1'
const TABLE_ID = 'H89zKU8ofZrpbFP5'
const EMAIL = 'eduardo.asinardi@bacarsa.com.ar'
/** Ticket creado 14/09/2026 11:49 ART (log Cloud: 14:49:39Z) */
const FECHA_RESPUESTA = '2026-09-14T14:49:39.000Z'

function loadEnv() {
  for (const p of [resolve(ROOT, 'backend/.env.local'), resolve(ROOT, 'backend/.env')]) {
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq <= 0) continue
      const k = t.slice(0, eq).trim()
      let v = t.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1)
      if (process.env[k] === undefined) process.env[k] = v
    }
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

const patchRes = await fetch(`${BASE}/data-tables/${TABLE_ID}/rows/update`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({
    filter: {
      type: 'and',
      filters: [{ columnName: 'email', condition: 'eq', value: EMAIL }],
    },
    data: { respondido: true, fecha_respuesta: FECHA_RESPUESTA },
    returnData: true,
  }),
})
const patchBody = await patchRes.json().catch(() => ({}))
if (!patchRes.ok) {
  console.error(patchRes.status, patchBody)
  process.exit(1)
}
console.log('PATCH:', JSON.stringify(patchBody, null, 2))

const getRes = await fetch(`${BASE}/data-tables/${TABLE_ID}/rows`, {
  headers: { 'X-N8N-API-KEY': key, Accept: 'application/json' },
})
const rows = (await getRes.json()).data?.filter((r) => r.email === EMAIL) ?? []
console.log('Verificación:', JSON.stringify(rows, null, 2))
const ok = rows.some((r) => r.respondido === true && r.fecha_respuesta)
process.exit(ok ? 0 : 1)
