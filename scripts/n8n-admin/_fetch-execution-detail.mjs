import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const BASE = 'https://bacarit.app.n8n.cloud/api/v1'

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

const execId = process.argv[2]?.trim() || '210'
const url = `${BASE}/executions/${encodeURIComponent(execId)}?includeData=true`
const res = await fetch(url, { headers: { 'X-N8N-API-KEY': key, Accept: 'application/json' } })
const json = await res.json()
if (!res.ok) {
  console.error(res.status, json)
  process.exit(1)
}
console.log(JSON.stringify(json, null, 2))
