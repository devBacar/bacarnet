/**
 * Timestamps de versiones del secret + revisión Cloud Run de api (si hay credenciales).
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GoogleAuth } from 'google-auth-library'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function loadEnvLocalKeys() {
  const path = resolve(ROOT, 'backend/.env.local')
  const keys = []
  if (!existsSync(path)) return keys
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    keys.push(t.slice(0, eq).trim())
  }
  return keys
}

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
})
const client = await auth.getClient()
const project = 'bacar-web'
const secret = 'HELPDESK_N8N_WEBHOOK_ANALISIS_PENDIENTE'

const listUrl = `https://secretmanager.googleapis.com/v1/projects/${project}/secrets/${secret}/versions`
const listRes = await client.request({ url: listUrl })
const versions = (listRes.data.versions ?? []).map((v) => ({
  name: v.name,
  state: v.state,
  createTime: v.createTime,
  destroyTime: v.destroyTime ?? null,
}))

let revision = null
try {
  const runUrl =
    'https://run.googleapis.com/v2/projects/bacar-web/locations/southamerica-east1/services/api/revisions/-'
  const runRes = await client.request({ url: runUrl })
  const latest = runRes.data?.revisions?.[0] ?? runRes.data
  revision = {
    name: latest?.name ?? runRes.data?.name,
    createTime: latest?.createTime,
    containers: latest?.containers?.[0]?.env?.map((e) => e.name) ?? null,
  }
} catch (err) {
  revision = { error: err instanceof Error ? err.message : String(err) }
}

console.log(
  JSON.stringify(
    {
      envLocalKeys: loadEnvLocalKeys(),
      secretVersions: versions,
      latestApiRevision: revision,
    },
    null,
    2,
  ),
)
