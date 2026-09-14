/**
 * Crea y activa webhook aviso-interno-ticket (correo a destinatarioEmail del body).
 *
 *   node scripts/n8n-admin/create-helpdesk-aviso-interno-webhook.mjs
 */

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const API_BASE = 'https://bacarit.app.n8n.cloud/api/v1'
const WEBHOOK_BASE = 'https://bacarit.app.n8n.cloud/webhook'
const SOURCE_WORKFLOW_ID = 'dyMMnr83naXid6re'
const PATH = 'aviso-interno-ticket'
const WORKFLOW_NAME = 'Aviso Interno Ticket Helpdesk - Sistemas'
const TEST_MARKER = `[prueba aviso interno ${Date.now()}]`

function loadEnv() {
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
}

function apiHeaders(key) {
  return {
    'X-N8N-API-KEY': key,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      `n8n API ${options.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`,
    )
  }
  return body
}

loadEnv()
const managementKey = process.env.N8N_MGMT_API_KEY?.trim()
if (!managementKey) throw new Error('N8N_MGMT_API_KEY no configurada')

const source = await api(`/workflows/${SOURCE_WORKFLOW_ID}`, {
  headers: apiHeaders(managementKey),
})
const sourceIf = source.nodes.find((node) => node.name === 'Validar API Key (Solicitud)')
const sharedSecret = sourceIf?.parameters?.conditions?.conditions?.[0]?.rightValue

const estadoSource = await api('/workflows/EpIjkFZdxRp7FoWh', {
  headers: apiHeaders(managementKey),
})
const sourceGmail = estadoSource.nodes.find((node) => node.name === 'Enviar Aviso Estado')
const gmailCredential = sourceGmail?.credentials?.gmailOAuth2

if (typeof sharedSecret !== 'string' || !sharedSecret) {
  throw new Error('No se pudo leer el secreto compartido X-Api-Key')
}
if (!gmailCredential?.id) {
  throw new Error('No se encontró credencial Gmail admin@')
}

const list = await api('/workflows?limit=100', { headers: apiHeaders(managementKey) })
let workflowId =
  process.argv.find((a) => a.startsWith('--workflow-id='))?.split('=')[1]?.trim() ||
  (list.data ?? []).find((w) => w.name === WORKFLOW_NAME)?.id
const finalizeOnly = process.argv.includes('--finalize')

const webhookName = 'Webhook Aviso Interno'
const validateName = 'Validar API Key'
const sendName = 'Enviar Aviso Interno'
const okName = 'Responder OK'
const unauthorizedName = 'Responder 401'

const emailHtml = `=<p><b>Aviso interno Sistemas</b> ${TEST_MARKER}</p>
<ul>
<li><b>Tipo:</b> {{ $json.body.tipoAviso }}</li>
<li><b>Ticket:</b> {{ $json.body.ticketId }}</li>
<li><b>Área:</b> {{ $json.body.area }}</li>
<li><b>Problemática:</b> {{ $json.body.problematica }}</li>
<li><b>Urgencia:</b> {{ $json.body.urgencia }}</li>
<li><b>Reunión:</b> {{ $json.body.reunionFecha }} {{ $json.body.reunionHora }}{{ $json.body.reunionTipo ? ' (' + $json.body.reunionTipo + ')' : '' }}</li>
</ul>`

const workflowBody = {
  name: WORKFLOW_NAME,
  nodes: [
    {
      id: randomUUID(),
      name: webhookName,
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2.1,
      position: [0, 0],
      parameters: {
        httpMethod: 'POST',
        path: PATH,
        responseMode: 'responseNode',
        options: {},
      },
      webhookId: randomUUID(),
    },
    {
      id: randomUUID(),
      name: validateName,
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [240, 0],
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: '',
            typeValidation: 'strict',
            version: 2,
          },
          conditions: [
            {
              id: randomUUID(),
              leftValue: "={{ $json.headers['x-api-key'] }}",
              rightValue: sharedSecret,
              operator: { type: 'string', operation: 'equals' },
            },
          ],
          combinator: 'and',
        },
      },
    },
    {
      id: randomUUID(),
      name: sendName,
      type: 'n8n-nodes-base.gmail',
      typeVersion: 2.2,
      position: [480, -100],
      parameters: {
        resource: 'message',
        operation: 'send',
        sendTo: '={{ $json.body.destinatarioEmail }}',
        subject: `=Sistemas · Aviso interno — {{ $json.body.area }} ${TEST_MARKER}`,
        emailType: 'html',
        message: emailHtml,
        options: {},
      },
      credentials: { gmailOAuth2: gmailCredential },
    },
    {
      id: randomUUID(),
      name: okName,
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.5,
      position: [720, -100],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ { "ok": true } }}',
        options: { responseCode: 200 },
      },
    },
    {
      id: randomUUID(),
      name: unauthorizedName,
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.5,
      position: [480, 120],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ { "ok": false, "error": "unauthorized" } }}',
        options: { responseCode: 401 },
      },
    },
  ],
  connections: {
    [webhookName]: { main: [[{ node: validateName, type: 'main', index: 0 }]] },
    [validateName]: {
      main: [
        [{ node: sendName, type: 'main', index: 0 }],
        [{ node: unauthorizedName, type: 'main', index: 0 }],
      ],
    },
    [sendName]: { main: [[{ node: okName, type: 'main', index: 0 }]] },
  },
  settings: {
    executionOrder: 'v1',
    timezone: 'America/Argentina/Buenos_Aires',
  },
}

if (!finalizeOnly) {
  if (workflowId) {
    const current = await api(`/workflows/${workflowId}`, { headers: apiHeaders(managementKey) })
    workflowBody.nodes[0].webhookId =
      current.nodes.find((n) => n.name === webhookName)?.webhookId ?? workflowBody.nodes[0].webhookId
    await api(`/workflows/${workflowId}`, {
      method: 'PUT',
      headers: apiHeaders(managementKey),
      body: JSON.stringify({
        ...workflowBody,
        staticData: current.staticData ?? {},
        pinData: current.pinData ?? {},
      }),
    })
    console.log(`Workflow actualizado: ${workflowId}`)
  } else {
    const created = await api('/workflows', {
      method: 'POST',
      headers: apiHeaders(managementKey),
      body: JSON.stringify(workflowBody),
    })
    workflowId = created.id
    console.log(`Workflow creado: ${workflowId}`)
  }
} else if (!workflowId) {
  throw new Error('Falta workflow para --finalize')
}

await api(`/workflows/${workflowId}/activate`, {
  method: 'POST',
  headers: apiHeaders(managementKey),
  body: '{}',
})
await api(`/workflows/${workflowId}/deactivate`, {
  method: 'POST',
  headers: apiHeaders(managementKey),
  body: '{}',
})
await api(`/workflows/${workflowId}/activate`, {
  method: 'POST',
  headers: apiHeaders(managementKey),
  body: '{}',
})
await new Promise((resolvePromise) => setTimeout(resolvePromise, 4000))

const webhookUrl = `${WEBHOOK_BASE}/${PATH}`
const testBody = {
  evento: 'aviso_interno',
  tipoAviso: 'ticket_creado',
  destinatarioEmail: 'admin@bacarsa.com.ar',
  ticketId: 'test-aviso-interno',
  area: 'Sistemas',
  problematica: 'Prueba webhook aviso interno',
  urgencia: 'media',
  reunionFecha: '18/09/2026',
  reunionHora: '10:00',
}

const unauthorized = await fetch(webhookUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(testBody),
})
if (unauthorized.status === 404) {
  throw new Error(`Webhook 404 — workflow ${workflowId} no registró ${PATH}`)
}
if (unauthorized.status !== 401) {
  console.warn(`Sin X-Api-Key: ${unauthorized.status} (se esperaba 401)`)
}

const authorized = await fetch(webhookUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Api-Key': sharedSecret,
  },
  body: JSON.stringify(testBody),
})
const authorizedBody = await authorized.json().catch(() => ({}))
console.log(`Webhook autenticado: ${authorized.status}`, authorizedBody)
if (authorized.status !== 200 || authorizedBody.ok !== true) {
  throw new Error('Webhook no devolvió 200 { ok: true }')
}

const { getGmailReadonly } = await import(
  '../../backend/lib/lib/google/workspaceGoogleClients.js'
)
const gmail = await getGmailReadonly('admin@bacarsa.com.ar')
let delivered = null
for (let attempt = 0; attempt < 12 && !delivered; attempt++) {
  const found = await gmail.users.messages.list({
    userId: 'me',
    q: `newer_than:1d "${TEST_MARKER.slice(0, 30)}"`,
    maxResults: 5,
  })
  const messageId = found.data.messages?.[0]?.id
  if (messageId) {
    delivered = messageId
    break
  }
  await new Promise((r) => setTimeout(r, 5000))
}
if (!delivered) throw new Error('No llegó el correo de prueba a admin@')

console.log(`Correo verificado en Gmail (id ${delivered})`)
console.log(`URL producción: ${webhookUrl}`)
console.log(`WORKFLOW_ID=${workflowId}`)
