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
const key = process.env.N8N_MGMT_API_KEY
const res = await fetch('https://bacarit.app.n8n.cloud/api/v1/data-tables/H89zKU8ofZrpbFP5/rows', {
  headers: { 'X-N8N-API-KEY': key, Accept: 'application/json' },
})
const json = await res.json()
const rows = json.data ?? []
const test = rows.filter(
  (r) =>
    (r.email || '').includes('sistemas.ti@bacarsa.com.ar') ||
    (r.email || '').includes('surlymeyer') ||
    rows.length <= 5,
)
console.log(JSON.stringify({ total: rows.length, rows: test.length ? test : rows }, null, 2))
