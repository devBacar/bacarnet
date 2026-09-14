/**
 * Corrige filtro email → requesterEmail en "Marcar Respondido (Formulario)".
 *
 *   node scripts/n8n-admin/patch-solicitud-creada-requester-email.mjs
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output')
const BASE = 'https://bacarit.app.n8n.cloud/api/v1'
const WORKFLOW_ID = 'dyMMnr83naXid6re'
const NODE_NAME = 'Marcar Respondido (Formulario)'
const OLD_EXPR = '={{ $json.body.email }}'
const NEW_EXPR = '={{ $json.body.requesterEmail }}'

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

function filterEmailExpr(node) {
  const conds = node?.parameters?.filters?.conditions
  if (!Array.isArray(conds) || conds.length === 0) return null
  return conds.find((c) => c.keyName === 'email')?.keyValue ?? null
}

function putBody(wf) {
  return {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: {
      executionOrder: wf.settings?.executionOrder ?? 'v1',
      timezone: wf.settings?.timezone ?? 'America/Argentina/Buenos_Aires',
      ...(wf.settings?.binaryMode ? { binaryMode: wf.settings.binaryMode } : {}),
    },
    staticData: wf.staticData ?? {},
    pinData: wf.pinData ?? {},
  }
}

loadEnv()
const key = process.env.N8N_MGMT_API_KEY?.trim()
if (!key) throw new Error('N8N_MGMT_API_KEY missing')

const headers = { 'X-N8N-API-KEY': key, Accept: 'application/json' }

const getRes = await fetch(`${BASE}/workflows/${WORKFLOW_ID}`, { headers })
const wf = await getRes.json()
if (!getRes.ok) throw new Error(`GET ${getRes.status}`)

const node = wf.nodes?.find((n) => n.name === NODE_NAME)
if (!node) throw new Error(`Nodo ${NODE_NAME} no encontrado`)

const before = filterEmailExpr(node)
console.log('Antes (editor):', before)
if (before !== OLD_EXPR && before !== NEW_EXPR) {
  console.warn('Expresión inesperada; se fuerza requesterEmail')
}
for (const cond of node.parameters.filters.conditions) {
  if (cond.keyName === 'email') cond.keyValue = NEW_EXPR
}

const putRes = await fetch(`${BASE}/workflows/${WORKFLOW_ID}`, {
  method: 'PUT',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify(putBody(wf)),
})
const putJson = await putRes.json().catch(() => ({}))
if (!putRes.ok) {
  console.error(putRes.status, putJson)
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })
writeFileSync(resolve(OUT, `workflow-${WORKFLOW_ID}.json`), JSON.stringify(putJson, null, 2))

const verifyRes = await fetch(`${BASE}/workflows/${WORKFLOW_ID}`, { headers })
const verified = await verifyRes.json()
const editorNode = verified.nodes?.find((n) => n.name === NODE_NAME)
const activeNode = verified.activeVersion?.nodes?.find((n) => n.name === NODE_NAME)
const editorExpr = filterEmailExpr(editorNode)
const activeExpr = filterEmailExpr(activeNode)

console.log('Después (editor):', editorExpr)
console.log('Después (activeVersion):', activeExpr)

if (editorExpr !== NEW_EXPR || activeExpr !== NEW_EXPR) {
  console.error('FAIL: editor o activeVersion no tienen requesterEmail')
  process.exit(1)
}
console.log('OK: editor y activeVersion sincronizados con requesterEmail')
