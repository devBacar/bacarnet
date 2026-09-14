/**
 * Plantillas específicas para analisis_aprobado / analisis_rechazado en aviso interno.
 *
 *   node scripts/n8n-admin/patch-aviso-interno-analisis-templates.mjs
 */

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const BASE = 'https://bacarit.app.n8n.cloud/api/v1'
const WORKFLOW_ID = 'D4JOi5Wieofe7HEq'
const PREP_NODE_NAME = 'Preparar email aviso'

const PREP_JS = `const item = $input.first().json;
const body = item.body ?? {};
const tipo = body.tipoAviso ?? '';
let emailSubject = 'Sistemas · Aviso interno — ' + (body.area ?? '');
let emailHtml =
  '<p><b>Aviso interno Sistemas</b></p><ul>' +
  '<li><b>Tipo:</b> ' + tipo + '</li>' +
  '<li><b>Ticket:</b> ' + (body.ticketId ?? '') + '</li>' +
  '<li><b>Área:</b> ' + (body.area ?? '') + '</li>' +
  '<li><b>Problemática:</b> ' + (body.problematica ?? '') + '</li>' +
  '<li><b>Urgencia:</b> ' + (body.urgencia ?? '') + '</li>' +
  '<li><b>Reunión:</b> ' + (body.reunionFecha ?? '') + ' ' + (body.reunionHora ?? '') +
  (body.reunionTipo ? ' (' + body.reunionTipo + ')' : '') +
  '</li></ul>';

if (tipo === 'analisis_aprobado') {
  emailSubject = 'Análisis aprobado — ' + (body.area ?? '');
  emailHtml =
    '<p>Hola,</p>' +
    '<p><b>' + (body.decididoPorEmail ?? 'Un aprobador') + '</b> aprobó el análisis del ticket ' +
    '<b>' + (body.ticketId ?? '') + '</b> correspondiente al área <b>' + (body.area ?? '') + '</b>.</p>' +
    '<p>El proyecto ya pasó a <b>En proceso de planificación y desarrollo</b>.</p>' +
    (body.archivoDriveLink
      ? '<p><a href="' + body.archivoDriveLink + '">Ver documento en Drive</a></p>'
      : '') +
    '<p>Saludos,<br>Equipo de Sistemas</p>';
}

if (tipo === 'analisis_rechazado') {
  const com =
    body.comentario && String(body.comentario).trim()
      ? String(body.comentario).trim()
      : 'sin comentario';
  emailSubject = 'Análisis rechazado — ' + (body.area ?? '');
  emailHtml =
    '<p>Hola,</p>' +
    '<p><b>' + (body.decididoPorEmail ?? 'Un aprobador') + '</b> rechazó el análisis del ticket ' +
    '<b>' + (body.ticketId ?? '') + '</b> del área <b>' + (body.area ?? '') + '</b>.</p>' +
    '<p><b>Comentario:</b> ' + com + '</p>' +
    '<p>Podés subir un análisis nuevo cuando quieras desde el panel de mesa de ayuda (mientras no haya otro pendiente de aprobación).</p>' +
    (body.archivoDriveLink
      ? '<p><a href="' + body.archivoDriveLink + '">Ver documento rechazado en Drive</a></p>'
      : '') +
    '<p>Saludos,<br>Equipo de Sistemas</p>';
}

return [{ json: { ...item, emailSubject, emailHtml } }];`

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
if (!key) throw new Error('N8N_MGMT_API_KEY')
const headers = { 'X-N8N-API-KEY': key, Accept: 'application/json', 'Content-Type': 'application/json' }

const wf = await (await fetch(`${BASE}/workflows/${WORKFLOW_ID}`, { headers })).json()
let prep = wf.nodes.find((n) => n.name === PREP_NODE_NAME)
if (!prep) {
  prep = {
    id: randomUUID(),
    name: PREP_NODE_NAME,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [360, -100],
    parameters: { mode: 'runOnceForAllItems', jsCode: PREP_JS },
  }
  wf.nodes.push(prep)
} else {
  prep.parameters = { mode: 'runOnceForAllItems', jsCode: PREP_JS }
}

const send = wf.nodes.find((n) => n.name === 'Enviar Aviso Interno')
if (!send) throw new Error('Nodo Gmail no encontrado')
send.parameters.subject = '={{ $json.emailSubject }}'
send.parameters.message = '={{ $json.emailHtml }}'

const validateName = 'Validar API Key'
const okName = 'Responder OK'
wf.connections[validateName] = {
  main: [[{ node: PREP_NODE_NAME, type: 'main', index: 0 }], wf.connections[validateName].main[1]],
}
wf.connections[PREP_NODE_NAME] = { main: [[{ node: send.name, type: 'main', index: 0 }]] }
if (!wf.connections[send.name]) {
  wf.connections[send.name] = { main: [[{ node: okName, type: 'main', index: 0 }]] }
}

const res = await fetch(`${BASE}/workflows/${WORKFLOW_ID}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
    staticData: wf.staticData ?? {},
    pinData: wf.pinData ?? {},
  }),
})
if (!res.ok) throw new Error(await res.text())
console.log('Plantillas analisis_aprobado / analisis_rechazado aplicadas en', WORKFLOW_ID)
