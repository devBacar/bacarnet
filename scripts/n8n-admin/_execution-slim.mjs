import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const BASE = 'https://bacarit.app.n8n.cloud/api/v1'

function loadEnv() {
  for (const p of [resolve(ROOT, 'backend/.env.local')]) {
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
const id = process.argv[2]
const res = await fetch(`${BASE}/executions/${id}?includeData=true`, {
  headers: { 'X-N8N-API-KEY': process.env.N8N_MGMT_API_KEY, Accept: 'application/json' },
})
const j = await res.json()
delete j.workflowData
console.log(JSON.stringify(j, null, 2))
