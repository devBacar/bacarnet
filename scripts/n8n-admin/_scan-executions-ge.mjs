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
const wf = '5MALmWt9r3Sj7ORF'
const listRes = await fetch(`${BASE}/executions?workflowId=${wf}&limit=25`, {
  headers: { 'X-N8N-API-KEY': key, Accept: 'application/json' },
})
const list = (await listRes.json()).data ?? []
for (const row of list) {
  const res = await fetch(`${BASE}/executions/${row.id}?includeData=true`, {
    headers: { 'X-N8N-API-KEY': key, Accept: 'application/json' },
  })
  const j = await res.json()
  const rd = j.data?.resultData?.runData ?? {}
  const names = Object.keys(rd)
  let ge = ''
  if (rd['Generar Enlace']) {
    const run = rd['Generar Enlace'][0]?.[0]
    const items = run?.data?.main?.[0] ?? []
    ge = ` GE:${run?.executionStatus} n=${items.length} codes=${items.map((i) => i.json?.statusCode).join(',')}`
  }
  const trigger = j.data?.executionData?.runtimeData?.triggerNode?.name ?? ''
  console.log(
    row.id,
    row.status,
    row.mode,
    row.startedAt,
    `nodes=${names.length}`,
    trigger ? `trigger=${trigger}` : '',
    names.includes('Generar Enlace') ? 'HAS_GE' : '',
    ge,
    j.data?.resultData?.error?.node?.name ?? j.data?.resultData?.error?.description ?? '',
  )
}
