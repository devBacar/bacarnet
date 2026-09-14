/**
 * Crea, activa y prueba el webhook n8n de recordatorio de solicitudes.
 *
 *   node scripts/n8n-admin/create-helpdesk-reminder-webhook.mjs
 */

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const API_BASE = 'https://bacarit.app.n8n.cloud/api/v1'
const WEBHOOK_BASE = 'https://bacarit.app.n8n.cloud/webhook'
const SOURCE_WORKFLOW_ID = 'EpIjkFZdxRp7FoWh'
const PATH = 'recordatorio-solicitud'
const WORKFLOW_NAME = 'Recordatorio Solicitud Helpdesk - Sistemas'
const TEST_SUBJECT = `Recordatorio de solicitud a Sistemas [prueba ${Date.now()}]`
const PRODUCTION_SUBJECT = 'Recordatorio: completá tu solicitud a Sistemas'

function loadEnv() {
  for (const path of [
    resolve(ROOT, 'backend/.env.local'),
    resolve(ROOT, 'backend/.env'),
  ]) {
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
    throw new Error(`n8n API ${options.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`)
  }
  return body
}

async function setProductionSubject(workflowId, managementKey) {
  const current = await api(`/workflows/${workflowId}`, {
    headers: apiHeaders(managementKey),
  })
  const sendNode = current.nodes.find((node) => node.name === 'Enviar Recordatorio')
  if (!sendNode) throw new Error('No se encontró Enviar Recordatorio')
  sendNode.parameters.subject = `=${PRODUCTION_SUBJECT}`
  await api(`/workflows/${workflowId}`, {
    method: 'PUT',
    headers: apiHeaders(managementKey),
    body: JSON.stringify({
      name: current.name,
      nodes: current.nodes,
      connections: current.connections,
      settings: current.settings,
      staticData: current.staticData ?? {},
      pinData: current.pinData ?? {},
    }),
  })
  const verified = await api(`/workflows/${workflowId}`, {
    headers: apiHeaders(managementKey),
  })
  const activeSubject = verified.activeVersion?.nodes?.find(
    (node) => node.name === 'Enviar Recordatorio',
  )?.parameters?.subject
  if (activeSubject !== `=${PRODUCTION_SUBJECT}`) {
    throw new Error('La versión activa no tomó el asunto de producción')
  }
  console.log(`Asunto de producción configurado: ${PRODUCTION_SUBJECT}`)
}

loadEnv()
const managementKey = process.env.N8N_MGMT_API_KEY?.trim()
if (!managementKey) throw new Error('N8N_MGMT_API_KEY no configurada')

const source = await api(`/workflows/${SOURCE_WORKFLOW_ID}`, {
  headers: apiHeaders(managementKey),
})
const sourceIf = source.nodes.find((node) => node.name === 'Validar API Key')
const sourceGmail = source.nodes.find((node) => node.name === 'Enviar Aviso Estado')
const sharedSecret =
  sourceIf?.parameters?.conditions?.conditions?.[0]?.rightValue
const gmailCredential = sourceGmail?.credentials?.gmailOAuth2

if (typeof sharedSecret !== 'string' || !sharedSecret) {
  throw new Error('No se pudo leer el secreto compartido del webhook existente')
}
if (!gmailCredential?.id || gmailCredential.name !== 'Gmail admin@bacarsa.com.ar') {
  throw new Error('No se encontró la credencial Gmail admin@bacarsa.com.ar en el workflow fuente')
}
const configuredOutboundSecret =
  process.env.HELPDESK_N8N_OUTBOUND_API_KEY?.trim()
if (configuredOutboundSecret && configuredOutboundSecret !== sharedSecret) {
  throw new Error('HELPDESK_N8N_OUTBOUND_API_KEY no coincide con el secreto de los webhooks')
}
console.log('Secreto X-Api-Key compartido: coincide con la configuración del backend')

const list = await api('/workflows?limit=100', {
  headers: apiHeaders(managementKey),
})
const existing = (list.data ?? []).find((workflow) => workflow.name === WORKFLOW_NAME)
if (existing) {
  if (process.argv.includes('--finalize-subject')) {
    await setProductionSubject(existing.id, managementKey)
    console.log(`URL producción: ${WEBHOOK_BASE}/${PATH}`)
    process.exit(0)
  }
  throw new Error(`Ya existe ${WORKFLOW_NAME} (${existing.id}); no se crea duplicado`)
}

const webhookName = 'Webhook Recordatorio Solicitud'
const validateName = 'Validar API Key'
const sendName = 'Enviar Recordatorio'
const okName = 'Responder OK'
const unauthorizedName = 'Responder 401'

const workflow = {
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
        sendTo: '={{ $json.body.email }}',
        subject: `=${TEST_SUBJECT}`,
        emailType: 'html',
        message:
          '=Hola {{ $json.body.nombre }},<br><br>Hace unos días el equipo de Sistemas te escribió por las necesidades del área de <b>{{ $json.body.area }}</b> y todavía no recibimos el formulario completo.<br><br>Por favor, completalo desde este enlace personalizado:<br><a href="{{ $json.body.link }}">Completar formulario de Sistemas</a><br><br>Si ya lo completaste, podés ignorar este mensaje.<br><br>Saludos,<br>Equipo de Sistemas',
        options: {},
      },
      credentials: {
        gmailOAuth2: gmailCredential,
      },
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
    [webhookName]: {
      main: [[{ node: validateName, type: 'main', index: 0 }]],
    },
    [validateName]: {
      main: [
        [{ node: sendName, type: 'main', index: 0 }],
        [{ node: unauthorizedName, type: 'main', index: 0 }],
      ],
    },
    [sendName]: {
      main: [[{ node: okName, type: 'main', index: 0 }]],
    },
  },
  settings: {
    executionOrder: 'v1',
    timezone: 'America/Argentina/Buenos_Aires',
  },
}

const created = await api('/workflows', {
  method: 'POST',
  headers: apiHeaders(managementKey),
  body: JSON.stringify(workflow),
})
console.log(`Workflow creado: ${created.id}`)

await api(`/workflows/${created.id}/activate`, {
  method: 'POST',
  headers: apiHeaders(managementKey),
  body: '{}',
})
console.log('Workflow activado')

const webhookUrl = `${WEBHOOK_BASE}/${PATH}`
const testBody = {
  email: 'admin@bacarsa.com.ar',
  nombre: 'Prueba',
  area: 'Sistemas',
  link: 'https://bacarnet.web.app/support?t=test',
}

const unauthorized = await fetch(webhookUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(testBody),
})
console.log(`Sin X-Api-Key: ${unauthorized.status}`)
if (unauthorized.status !== 401) throw new Error('El webhook no devolvió 401 sin API key')

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
console.log(`Con X-Api-Key: ${authorized.status} ${JSON.stringify(authorizedBody)}`)
if (authorized.status !== 200 || authorizedBody.ok !== true) {
  throw new Error('El webhook autenticado no devolvió 200 { ok: true }')
}

const { getGmailReadonly } = await import(
  '../../backend/lib/lib/google/workspaceGoogleClients.js'
)
const gmail = await getGmailReadonly('admin@bacarsa.com.ar')
let delivered = null
for (let attempt = 0; attempt < 12 && !delivered; attempt++) {
  const found = await gmail.users.messages.list({
    userId: 'me',
    q: `subject:"${TEST_SUBJECT}" newer_than:1d`,
    maxResults: 5,
  })
  const messageId = found.data.messages?.[0]?.id
  if (messageId) {
    const message = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Subject'],
    })
    const headers = Object.fromEntries(
      (message.data.payload?.headers ?? []).map((header) => [
        header.name?.toLowerCase() ?? '',
        header.value ?? '',
      ]),
    )
    delivered = { id: messageId, headers }
    break
  }
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 5000))
}

if (!delivered) throw new Error('No se encontró el correo real en Gmail después del envío')
const from = delivered.headers.from ?? ''
const to = delivered.headers.to ?? ''
if (!from.toLowerCase().includes('admin@bacarsa.com.ar')) {
  throw new Error(`Remitente incorrecto: ${from}`)
}
if (!to.toLowerCase().includes('admin@bacarsa.com.ar')) {
  throw new Error(`Destinatario incorrecto: ${to}`)
}

console.log(`Correo verificado. From: ${from}; To: ${to}`)
await setProductionSubject(created.id, managementKey)
console.log(`URL producción: ${webhookUrl}`)
