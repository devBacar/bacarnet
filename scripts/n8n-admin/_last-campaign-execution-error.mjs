/**
 * Última ejecución con trigger Programar Envío + detalle error Generar Enlace.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const BASE = 'https://bacarit.app.n8n.cloud/api/v1'
const WF = '5MALmWt9r3Sj7ORF'

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
const key = process.env.N8N_MGMT_API_KEY?.trim()
const headers = { 'X-N8N-API-KEY': key, Accept: 'application/json' }

const listUrl = `${BASE}/executions?workflowId=${encodeURIComponent(WF)}&limit=15`
const listRes = await fetch(listUrl, { headers })
const listJson = await listRes.json()
console.error('=== GET list (limit=15) status', listRes.status, '===')

for (const row of listJson.data ?? []) {
  const detailRes = await fetch(`${BASE}/executions/${row.id}?includeData=true`, { headers })
  const j = await detailRes.json()
  const trigger = j.data?.executionData?.runtimeData?.triggerNode?.name ?? ''
  const err = j.data?.resultData?.error
  const hasGE = j.data?.resultData?.runData?.['Generar Enlace']
  if (trigger === 'Programar Envío' && (err?.node?.name === 'Generar Enlace' || hasGE)) {
    console.log(JSON.stringify({ pickedExecutionId: row.id, listRow: row }, null, 2))
    console.log('\n=== resultData.error (completo) ===')
    console.log(JSON.stringify(err, null, 2))
    const geRuns = j.data?.resultData?.runData?.['Generar Enlace']
    if (geRuns) {
      console.log('\n=== runData["Generar Enlace"] (completo) ===')
      console.log(JSON.stringify(geRuns, null, 2))
    }
    process.exit(0)
  }
}

// fallback: limit=1 with includeData as user asked
const url = `${BASE}/executions?workflowId=${encodeURIComponent(WF)}&limit=1`
const r1 = await fetch(url, { headers })
const j1 = await r1.json()
const id = j1.data?.[0]?.id
console.log(JSON.stringify({ note: 'No Programar Envío+GE in last 15; fallback limit=1 id', id, listRow: j1.data?.[0] }, null, 2))
const j2 = await (await fetch(`${BASE}/executions/${id}?includeData=true`, { headers })).json()
console.log('\n=== resultData.error ===')
console.log(JSON.stringify(j2.data?.resultData?.error, null, 2))
console.log('\n=== runData Generar Enlace ===')
console.log(JSON.stringify(j2.data?.resultData?.runData?.['Generar Enlace'], null, 2))
