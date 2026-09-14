/** Quita marcador de prueba del asunto y cuerpo del workflow aviso interno. */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const BASE = 'https://bacarit.app.n8n.cloud/api/v1'
const WORKFLOW_ID = 'D4JOi5Wieofe7HEq'

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
const headers = { 'X-N8N-API-KEY': key, Accept: 'application/json', 'Content-Type': 'application/json' }
const wf = await (await fetch(`${BASE}/workflows/${WORKFLOW_ID}`, { headers: { 'X-N8N-API-KEY': key } })).json()
const send = wf.nodes.find((n) => n.name === 'Enviar Aviso Interno')
send.parameters.subject = '=Sistemas · Aviso interno — {{ $json.body.area }}'
send.parameters.message = `=<p><b>Aviso interno Sistemas</b></p>
<ul>
<li><b>Tipo:</b> {{ $json.body.tipoAviso }}</li>
<li><b>Ticket:</b> {{ $json.body.ticketId }}</li>
<li><b>Área:</b> {{ $json.body.area }}</li>
<li><b>Problemática:</b> {{ $json.body.problematica }}</li>
<li><b>Urgencia:</b> {{ $json.body.urgencia }}</li>
<li><b>Reunión:</b> {{ $json.body.reunionFecha }} {{ $json.body.reunionHora }}{{ $json.body.reunionTipo ? ' (' + $json.body.reunionTipo + ')' : '' }}</li>
</ul>`
await fetch(`${BASE}/workflows/${WORKFLOW_ID}`, {
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
console.log('Asunto/cuerpo de producción aplicados')
