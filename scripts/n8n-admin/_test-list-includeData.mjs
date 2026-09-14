import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
for (const line of readFileSync(resolve('backend/.env.local'), 'utf8').split(/\r?\n/)) {
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
  'https://bacarit.app.n8n.cloud/api/v1/executions?workflowId=5MALmWt9r3Sj7ORF&limit=1&includeData=true'
const r = await fetch(url, { headers: { 'X-N8N-API-KEY': process.env.N8N_MGMT_API_KEY } })
const j = await r.json()
console.log(JSON.stringify({ httpStatus: r.status, first: j.data?.[0] }, null, 2))
