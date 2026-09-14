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
const BASE = 'https://bacarit.app.n8n.cloud/api/v1'
for (const path of [
  '/data-tables/H89zKU8ofZrpbFP5/rows',
  '/data-tables/H89zKU8ofZrpbFP5',
  '/tables/H89zKU8ofZrpbFP5/rows',
]) {
  const res = await fetch(BASE + path, { headers: { 'X-N8N-API-KEY': key, Accept: 'application/json' } })
  const text = await res.text()
  console.log(path, res.status, text.slice(0, 500))
}
