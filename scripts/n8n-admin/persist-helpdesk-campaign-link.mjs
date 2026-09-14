/**
 * Agrega la columna link a jefes_areas y hace que la campaña guarde el enlace tokenizado enviado.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const BASE = 'https://bacarit.app.n8n.cloud/api/v1'
const TABLE_ID = 'H89zKU8ofZrpbFP5'
const WORKFLOW_ID = '5MALmWt9r3Sj7ORF'

for (const path of [resolve(ROOT, 'backend/.env.local'), resolve(ROOT, 'backend/.env')]) {
  if (!existsSync(path)) continue
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

const credential = process.env.N8N_MGMT_API_KEY?.trim()
if (!credential) throw new Error('N8N_MGMT_API_KEY no configurada')
const headers = {
  'X-N8N-API-KEY': credential,
  Accept: 'application/json',
  'Content-Type': 'application/json',
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, { headers, ...options })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`)
  }
  return body
}

const table = await request(`/data-tables/${TABLE_ID}`)
if (!table.columns.some((column) => column.name === 'link')) {
  await request(`/data-tables/${TABLE_ID}/columns`, {
    method: 'POST',
    body: JSON.stringify({ name: 'link', type: 'string' }),
  })
  console.log('Columna jefes_areas.link creada')
} else {
  console.log('Columna jefes_areas.link ya existía')
}

const workflow = await request(`/workflows/${WORKFLOW_ID}`)
const markSent = workflow.nodes.find((node) => node.name === 'Marcar Enviado')
if (!markSent) throw new Error('No se encontró el nodo Marcar Enviado')
markSent.parameters.columns.value.link =
  "={{ $('Preparar Envio').item.json.link_generado }}"

const body = {
  name: workflow.name,
  nodes: workflow.nodes,
  connections: workflow.connections,
  settings: {
    executionOrder: workflow.settings?.executionOrder ?? 'v1',
    timezone: workflow.settings?.timezone ?? 'America/Argentina/Buenos_Aires',
  },
  staticData: workflow.staticData ?? {},
  pinData: workflow.pinData ?? {},
}
await request(`/workflows/${WORKFLOW_ID}`, {
  method: 'PUT',
  body: JSON.stringify(body),
})

const verified = await request(`/workflows/${WORKFLOW_ID}`)
const activeMarkSent = verified.activeVersion?.nodes?.find(
  (node) => node.name === 'Marcar Enviado',
)
const expression = activeMarkSent?.parameters?.columns?.value?.link
if (expression !== "={{ $('Preparar Envio').item.json.link_generado }}") {
  throw new Error('La versión activa no contiene el guardado de link')
}
console.log('Workflow activo verificado: Marcar Enviado persiste link_generado')
