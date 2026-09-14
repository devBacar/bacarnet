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

const id = process.argv[2] || '213'
const r = await fetch(`https://bacarit.app.n8n.cloud/api/v1/executions/${id}?includeData=true`, {
  headers: { 'X-N8N-API-KEY': process.env.N8N_MGMT_API_KEY, Accept: 'application/json' },
})
const j = await r.json()
const ge = j.data?.resultData?.runData?.['Generar Enlace']?.[0]?.[0]
console.log(
  JSON.stringify(
    {
      execution: {
        id: j.id,
        status: j.status,
        mode: j.mode,
        startedAt: j.startedAt,
        stoppedAt: j.stoppedAt,
        trigger: j.data?.executionData?.runtimeData?.triggerNode?.name,
      },
      resultDataError: j.data?.resultData?.error,
      generarEnlaceNodeError: ge?.error,
    },
    null,
    2,
  ),
)
