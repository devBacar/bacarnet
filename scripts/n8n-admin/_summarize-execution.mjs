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
const execId = process.argv[2]
const url = `${BASE}/executions/${encodeURIComponent(execId)}?includeData=true`
const res = await fetch(url, { headers: { 'X-N8N-API-KEY': key, Accept: 'application/json' } })
const j = await res.json()
const runData = j.data?.resultData?.runData ?? {}
const err = j.data?.resultData?.error
console.log('=== meta ===')
console.log(JSON.stringify({ id: j.id, status: j.status, mode: j.mode, startedAt: j.startedAt, stoppedAt: j.stoppedAt }, null, 2))
if (err) console.log('=== resultData.error ===', JSON.stringify(err, null, 2))
console.log('=== nodes in runData ===', Object.keys(runData).join(' | '))
for (const [name, runs] of Object.entries(runData)) {
  const main = runs?.[0]
  if (!main) continue
  for (let i = 0; i < main.length; i++) {
    const run = main[i]
    const items = run?.data?.main?.[0] ?? []
    console.log(`\n--- ${name} [run ${i}] executionStatus=${run.executionStatus} error=${run.error?.message ?? run.error ?? ''}`)
    for (const item of items.slice(0, 5)) {
      const json = item.json
      const slim = {}
      if (json?.statusCode != null) slim.statusCode = json.statusCode
      if (json?.link) slim.link = json.link
      if (json?.email) slim.email = json.email
      if (json?.enviado != null) slim.enviado = json.enviado
      if (json?.error) slim.error = json.error
      if (Object.keys(slim).length) console.log('  item:', JSON.stringify(slim))
      else console.log('  item keys:', json ? Object.keys(json).slice(0, 12).join(',') : '(empty)')
    }
    if (items.length > 5) console.log(`  ... +${items.length - 5} items`)
  }
}
