/**
 * Webhook: invitación a revisar análisis pendiente (aprobadores).
 *
 *   node scripts/n8n-admin/create-helpdesk-analisis-pendiente-webhook.mjs
 */

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const API_BASE = 'https://bacarit.app.n8n.cloud/api/v1'
const WEBHOOK_BASE = 'https://bacarit.app.n8n.cloud/webhook'
const SOURCE_WORKFLOW_ID = 'dyMMnr83naXid6re'
const PATH = 'analisis-pendiente-aprobacion'
const WORKFLOW_NAME = 'Análisis pendiente aprobación - Helpdesk'

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

const emailHtml = `=Hola,<br><br>
Te escribimos desde el equipo de <b>Sistemas</b> de Bacarsa.<br><br>
Hay un <b>documento de análisis</b> del área <b>{{ $json.body.area }}</b> que necesita tu revisión antes de seguir avanzando con el proyecto.<br><br>
<b>Problemática:</b> {{ $json.body.problematica }}<br>
<b>Subido por:</b> {{ $json.body.subidoPorNombre }} ({{ $json.body.subidoPorEmail }})<br>
<b>Documento:</b> <a href="{{ $json.body.archivoDriveLink }}">Abrir en Google Drive</a><br><br>
Para <b>aprobar o rechazar</b>, entrá a Bacarnet con tu cuenta corporativa y andá a <b>Aprobaciones pendientes</b>:<br>
<a href="{{ $json.body.appUrl }}">{{ $json.body.appUrl }}</a><br><br>
(No uses este enlace si no iniciaste sesión: siempre ingresá primero a la intranet con tu usuario de Bacarsa.)<br><br>
Saludos,<br>
Equipo de Sistemas`

const workflowBody = {
  name: WORKFLOW_NAME,
  nodes: [
    {
      id: randomUUID(),
      name: 'Webhook Analisis Pendiente',
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
      name: 'Validar API Key',
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
      name: 'Enviar invitacion',
      type: 'n8n-nodes-base.gmail',
      typeVersion: 2.2,
      position: [480, -100],
      parameters: {
        resource: 'message',
        operation: 'send',
        sendTo: '={{ $json.body.destinatarioEmail }}',
        subject:
          '=Revisión de análisis — proyecto Sistemas ({{ $json.body.area }})',
        emailType: 'html',
        message: emailHtml,
        options: {},
      },
      credentials: { gmailOAuth2: gmailCredential },
    },
    {
      id: randomUUID(),
      name: 'Responder OK',
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
      name: 'Responder 401',
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
    'Webhook Analisis Pendiente': {
      main: [[{ node: 'Validar API Key', type: 'main', index: 0 }]],
    },
    'Validar API Key': {
      main: [
        [{ node: 'Enviar invitacion', type: 'main', index: 0 }],
        [{ node: 'Responder 401', type: 'main', index: 0 }],
      ],
    },
    'Enviar invitacion': { main: [[{ node: 'Responder OK', type: 'main', index: 0 }]] },
  },
  settings: {
    executionOrder: 'v1',
    timezone: 'America/Argentina/Buenos_Aires',
  },
}

const list = await api('/workflows?limit=100', { headers: apiHeaders(managementKey) })
let workflowId = (list.data ?? []).find((w) => w.name === WORKFLOW_NAME)?.id

if (workflowId) {
  const current = await api(`/workflows/${workflowId}`, { headers: apiHeaders(managementKey) })
  workflowBody.nodes[0].webhookId =
    current.nodes.find((n) => n.name === 'Webhook Analisis Pendiente')?.webhookId ??
    workflowBody.nodes[0].webhookId
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

await api(`/workflows/${workflowId}/activate`, {
  method: 'POST',
  headers: apiHeaders(managementKey),
  body: '{}',
})

const webhookUrl = `${WEBHOOK_BASE}/${PATH}`
console.log(`URL producción: ${webhookUrl}`)
console.log(`WORKFLOW_ID=${workflowId}`)
console.log(`Agregar a Secret Manager / .env.local:`)
console.log(`HELPDESK_N8N_WEBHOOK_ANALISIS_PENDIENTE=${webhookUrl}`)
