/**
 * POST al webhook real con payload del 14/09 (Eduardo) y verifica fila en jefes_areas.
 *
 *   node scripts/n8n-admin/test-solicitud-creada-eduardo.mjs
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TABLE_ID = 'H89zKU8ofZrpbFP5'
const BASE = 'https://bacarit.app.n8n.cloud/api/v1'
const EMAIL = 'eduardo.asinardi@bacarsa.com.ar'

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
const webhookUrl = process.env.HELPDESK_N8N_WEBHOOK_SOLICITUD_CREADA?.trim()
const apiKey = process.env.HELPDESK_N8N_OUTBOUND_API_KEY?.trim()
const mgmt = process.env.N8N_MGMT_API_KEY?.trim()
if (!webhookUrl || !apiKey || !mgmt) throw new Error('Faltan URLs/keys en backend/.env.local')

const payload = {
  evento: 'solicitud_creada',
  ticketId: 'qg7QU8KrNu7jfG3rYcdI',
  requesterUid: null,
  requesterEmail: EMAIL,
  requesterNombre: 'Eduardo Asinardi',
  areaId: 'MM25DIlzctON9kegb4MF',
  areaNombre: 'Comisión Ejecutiva',
  problematica: 'lo resolvemos con la gente de operaciones o dario avendaño',
  urgencia: 'baja',
  estadoIdx: 1,
  estado: 'Reunión inicial agendada',
  asignadoATeamId: 'hrpHRUs3WouvBudsl2aW',
  reunionId: 'KaGoleTuuYc2DPmwd2ve',
  reunionFecha: '17/09/2026',
  reunionHora: '09:00',
}

const beforeRes = await fetch(`${BASE}/data-tables/${TABLE_ID}/rows`, {
  headers: { 'X-N8N-API-KEY': mgmt, Accept: 'application/json' },
})
const beforeRows = (await beforeRes.json()).data?.filter((r) => r.email === EMAIL) ?? []
console.log('Antes:', JSON.stringify(beforeRows.map((r) => ({ id: r.id, respondido: r.respondido }))))

const res = await fetch(webhookUrl, {
  method: 'POST',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Api-Key': apiKey,
  },
  body: JSON.stringify(payload),
})
const body = await res.json().catch(() => ({}))
console.log(`Webhook: ${res.status}`, JSON.stringify(body))

await new Promise((r) => setTimeout(r, 2000))

const afterRes = await fetch(`${BASE}/data-tables/${TABLE_ID}/rows`, {
  headers: { 'X-N8N-API-KEY': mgmt, Accept: 'application/json' },
})
const afterRows = (await afterRes.json()).data?.filter((r) => r.email === EMAIL) ?? []
console.log('Después:', JSON.stringify(afterRows, null, 2))

const row = afterRows[0]
const marked = row?.respondido === true && row?.fecha_respuesta
if (res.status !== 200 || !marked) {
  console.error('FAIL: webhook o fila no actualizada')
  process.exit(1)
}
console.log('PASS: nodo marcó respondido para Eduardo')
