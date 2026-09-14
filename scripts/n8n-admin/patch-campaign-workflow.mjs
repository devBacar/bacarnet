/**
 * Corrige workflow campaña jefes y PUT a n8n API.
 *
 *   node scripts/n8n-admin/patch-campaign-workflow.mjs
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output')
const BASE = 'https://bacarit.app.n8n.cloud/api/v1'
const WORKFLOW_ID = '5MALmWt9r3Sj7ORF'
const API_LINK =
  'https://southamerica-east1-bacar-web.cloudfunctions.net/api/api/helpdesk/campana/generar-enlace'

const FILTER_SENT_EXPR =
  "={{ ['true', true, 1, '1', 'TRUE'].includes($json.enviado) }}"

const PREPARAR_ENVIO_CODE = `const plantillas = $('Obtener Plantillas Envio').all().map(i => i.json);
const jefesItems = $('Filtrar No Enviados').all();
const linkByEmail = new Map();

for (const linkItem of $input.all()) {
  let jefeJson = null;
  const pair = linkItem.pairedItem;
  const pairIdx = Array.isArray(pair) ? pair[0]?.item : pair?.item;
  if (typeof pairIdx === 'number' && jefesItems[pairIdx]) {
    jefeJson = jefesItems[pairIdx].json;
  }
  const email = (jefeJson?.email || '').trim().toLowerCase();
  const link = linkItem.json?.link;
  if (email && typeof link === 'string' && link.includes('?t=')) {
    linkByEmail.set(email, link);
  }
}

if (linkByEmail.size < jefesItems.length) {
  const links = $input.all();
  for (let i = 0; i < jefesItems.length; i++) {
    const email = (jefesItems[i].json.email || '').trim().toLowerCase();
    const link = links[i]?.json?.link;
    if (email && link && !linkByEmail.has(email)) {
      linkByEmail.set(email, link);
    }
  }
}

const results = [];
for (const jefeItem of jefesItems) {
  const jefe = jefeItem.json;
  const email = (jefe.email || '').trim().toLowerCase();
  const link = linkByEmail.get(email) || 'https://bacarnet.web.app/support';
  const areaJefe = (jefe.area || '').trim().toLowerCase();
  const plantilla = plantillas.find(p => (p.area || '').trim().toLowerCase() === areaJefe);
  let cuerpo_final = '';
  let tiene_plantilla = false;
  if (plantilla && plantilla.cuerpo) {
    tiene_plantilla = true;
    const valores = {
      nombre: jefe.nombre || '',
      area: jefe.area || '',
      email: jefe.email || '',
      link_formulario: link,
      firma_jefe: 'Mauro Martinez'
    };
    let cuerpo = String(plantilla.cuerpo);
    for (const k of Object.keys(valores)) {
      const val = valores[k];
      cuerpo = cuerpo.split('{{' + k + '}}').join(val).split('{{ ' + k + ' }}').join(val);
    }
    cuerpo_final = cuerpo;
  }
  results.push({
    json: Object.assign({}, jefe, {
      cuerpo_final,
      tiene_plantilla,
      link_generado: link,
    }),
  });
}
return results;`

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

function patchNode(node) {
  if (node.name === 'Filtrar No Enviados') {
    const conds = node.parameters?.conditions?.conditions
    if (Array.isArray(conds)) {
      for (const c of conds) {
        if (c.id === 'no-enviado') {
          c.leftValue = FILTER_SENT_EXPR
          c.rightValue = false
          c.operator = { type: 'boolean', operation: 'equals' }
        }
        if (c.id === 'sin-error') {
          c.leftValue = "={{ ['true', true, 1, '1', 'TRUE'].includes($json.error) }}"
          c.rightValue = false
          c.operator = { type: 'boolean', operation: 'equals' }
        }
      }
    }
  }
  if (node.name === 'Generar Enlace') {
    node.parameters.url = API_LINK
  }
  if (node.name === 'Preparar Envio') {
    node.parameters.jsCode = PREPARAR_ENVIO_CODE
  }
  if (node.name === 'Filtrar Sin Respuesta 3d') {
    const conds = node.parameters?.conditions?.conditions
    if (Array.isArray(conds)) {
      for (const c of conds) {
        if (c.id === 'enviado') {
          c.leftValue = "={{ ['true', true, 1, '1', 'TRUE'].includes($json.enviado) }}"
          c.rightValue = true
          c.operator = { type: 'boolean', operation: 'equals' }
        }
        if (c.id === 'recordatorio') {
          c.leftValue =
            "={{ ['true', true, 1, '1', 'TRUE'].includes($json.recordatorio_enviado) }}"
          c.rightValue = false
          c.operator = { type: 'boolean', operation: 'equals' }
        }
      }
    }
  }
}

function ensureConnections(connections) {
  connections['Filtrar No Enviados'] = {
    main: [[{ node: 'Generar Enlace', type: 'main', index: 0 }]],
  }
  connections['Generar Enlace'] = {
    main: [[{ node: 'Preparar Envio', type: 'main', index: 0 }]],
  }
  connections['Preparar Envio'] = {
    main: [[{ node: 'Tiene Plantilla? (Envío)', type: 'main', index: 0 }]],
  }
}

loadEnv()
const key = process.env.N8N_MGMT_API_KEY?.trim()
if (!key) throw new Error('N8N_MGMT_API_KEY missing')

const getRes = await fetch(`${BASE}/workflows/${WORKFLOW_ID}`, {
  headers: { 'X-N8N-API-KEY': key, Accept: 'application/json' },
})
const wf = await getRes.json()
if (!getRes.ok) {
  console.error(getRes.status, wf)
  process.exit(1)
}

const hasGenerar = wf.nodes.some((n) => n.name === 'Generar Enlace')
if (!hasGenerar) {
  console.error('Falta nodo Generar Enlace en nodes[] — revisar workflow manualmente')
  process.exit(1)
}

for (const node of wf.nodes) patchNode(node)
ensureConnections(wf.connections)

const settings = {
  executionOrder: wf.settings?.executionOrder ?? 'v1',
  timezone: wf.settings?.timezone ?? 'America/Argentina/Buenos_Aires',
}
if (wf.settings?.binaryMode) settings.binaryMode = wf.settings.binaryMode

const body = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings,
  staticData: wf.staticData ?? {},
  pinData: wf.pinData ?? {},
}

writeFileSync(resolve(OUT, 'workflow-patched-body.json'), JSON.stringify(body, null, 2))

const putRes = await fetch(`${BASE}/workflows/${WORKFLOW_ID}`, {
  method: 'PUT',
  headers: {
    'X-N8N-API-KEY': key,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
})
const putJson = await putRes.json().catch(() => ({}))
writeFileSync(resolve(OUT, 'workflow-put-response.json'), JSON.stringify(putJson, null, 2))

if (!putRes.ok) {
  console.error('PUT failed', putRes.status, putJson)
  process.exit(1)
}

const av = putJson.activeVersion
const avHasGenerar = av?.nodes?.some((n) => n.name === 'Generar Enlace')
const avConn = av?.connections?.['Filtrar No Enviados']?.main?.[0]?.[0]?.node

console.log('PUT OK', putRes.status)
console.log('activeVersion includes Generar Enlace:', Boolean(avHasGenerar))
console.log('activeVersion Filtrar No Enviados ->', avConn ?? '(sin conexión)')
