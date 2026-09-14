/**
 * GET workflow n8n por ID (lee N8N_MGMT_API_KEY de backend/.env.local).
 *
 *   node scripts/n8n-admin/fetch-workflow.mjs [workflowId]
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'output')
const BASE = 'https://bacarit.app.n8n.cloud/api/v1'
const DEFAULT_ID = '5MALmWt9r3Sj7ORF'

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
if (!key) throw new Error('N8N_MGMT_API_KEY missing in backend/.env.local')

const id = process.argv[2]?.trim() || DEFAULT_ID
const res = await fetch(`${BASE}/workflows/${id}`, {
  headers: { 'X-N8N-API-KEY': key, Accept: 'application/json' },
})
const text = await res.text()
if (!res.ok) {
  console.error(res.status, text)
  process.exit(1)
}
const json = JSON.parse(text)
mkdirSync(OUT_DIR, { recursive: true })
const outPath = resolve(OUT_DIR, `workflow-${id}.json`)
writeFileSync(outPath, JSON.stringify(json, null, 2), 'utf8')
console.log('Saved:', outPath)
console.log('name:', json.name)
console.log('nodes:', json.nodes?.length ?? 0)
