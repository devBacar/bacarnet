/**
 * Compara nodes/connections (editor) vs activeVersion.
 *
 *   node scripts/n8n-admin/audit-workflow-sync.mjs <workflowId> [workflowId2...]
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output')
const BASE = 'https://bacarit.app.n8n.cloud/api/v1'

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

function nodeNames(nodes) {
  return new Set((nodes ?? []).map((n) => n.name))
}

function connSignature(connections) {
  if (!connections) return ''
  const lines = []
  for (const from of Object.keys(connections).sort()) {
    const mains = connections[from]?.main ?? []
    for (let i = 0; i < mains.length; i++) {
      for (const edge of mains[i] ?? []) {
        lines.push(`${from} -> ${edge.node}`)
      }
    }
  }
  return lines.sort().join('\n')
}

function summarizeNode(node) {
  const cred = node.credentials ? JSON.stringify(node.credentials) : ''
  const url = node.parameters?.url ?? node.parameters?.path ?? ''
  const auth = node.parameters?.authentication ?? ''
  return { name: node.name, type: node.type, cred, url: String(url).slice(0, 120), auth }
}

function findGmail(nodes) {
  return (nodes ?? [])
    .filter((n) => n.type?.includes('gmail'))
    .map((n) => ({
      name: n.name,
      credentialName: n.credentials?.gmailOAuth2?.name ?? n.credentials?.gmail?.name ?? null,
      credentialId: n.credentials?.gmailOAuth2?.id ?? null,
    }))
}

function findApiKeyValidation(nodes) {
  const hits = []
  for (const n of nodes ?? []) {
    const p = JSON.stringify(n.parameters ?? {})
    if (
      /x-api-key/i.test(p) ||
      /api.?key/i.test(n.name) ||
      n.type?.includes('if') && /401|api key|invalid/i.test(p)
    ) {
      hits.push(n.name)
    }
    if (n.type?.includes('webhook')) hits.push(`${n.name} (webhook)`)
  }
  return [...new Set(hits)]
}

async function fetchWf(id, key) {
  const res = await fetch(`${BASE}/workflows/${id}`, {
    headers: { 'X-N8N-API-KEY': key, Accept: 'application/json' },
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`${id} GET ${res.status}`)
  return json
}

async function putWf(id, key, wf) {
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
  const res = await fetch(`${BASE}/workflows/${id}`, {
    method: 'PUT',
    headers: {
      'X-N8N-API-KEY': key,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, json }
}

loadEnv()
const key = process.env.N8N_MGMT_API_KEY?.trim()
const ids =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : ['dyMMnr83naXid6re', 'EpIjkFZdxRp7FoWh']

mkdirSync(OUT, { recursive: true })
const report = []

for (const id of ids) {
  const wf = await fetchWf(id, key)
  writeFileSync(resolve(OUT, `workflow-${id}.json`), JSON.stringify(wf, null, 2))

  const editorNames = nodeNames(wf.nodes)
  const activeNames = nodeNames(wf.activeVersion?.nodes)
  const onlyEditor = [...editorNames].filter((n) => !activeNames.has(n))
  const onlyActive = [...activeNames].filter((n) => !editorNames.has(n))

  const editorConn = connSignature(wf.connections)
  const activeConn = connSignature(wf.activeVersion?.connections)
  const connMatch = editorConn === activeConn

  const editorGmail = findGmail(wf.nodes)
  const activeGmail = findGmail(wf.activeVersion?.nodes)

  const row = {
    id,
    name: wf.name,
    synced:
      onlyEditor.length === 0 &&
      onlyActive.length === 0 &&
      connMatch &&
      JSON.stringify(editorGmail) === JSON.stringify(activeGmail),
    onlyEditor,
    onlyActive,
    connMatch,
    editorGmail,
    activeGmail,
    apiNodesEditor: findApiKeyValidation(wf.nodes),
    apiNodesActive: findApiKeyValidation(wf.activeVersion?.nodes),
  }

  if (!row.synced) {
    console.log(`\n=== DESYNC: ${wf.name} (${id}) ===`)
    if (onlyEditor.length) console.log('  Solo en editor:', onlyEditor.join(', '))
    if (onlyActive.length) console.log('  Solo en activeVersion:', onlyActive.join(', '))
    if (!connMatch) {
      console.log('  Conexiones distintas (editor vs active)')
      console.log('  EDITOR:', editorConn.slice(0, 500))
      console.log('  ACTIVE:', activeConn.slice(0, 500))
    }
    if (JSON.stringify(editorGmail) !== JSON.stringify(activeGmail)) {
      console.log('  Gmail editor:', editorGmail)
      console.log('  Gmail active:', activeGmail)
    }
    const put = await putWf(id, key, wf)
    row.put = { ok: put.ok, status: put.status }
    if (put.ok) {
      const wf2 = await fetchWf(id, key)
      const afterConn = connSignature(wf2.activeVersion?.connections)
      const afterNames = nodeNames(wf2.activeVersion?.nodes)
      row.afterPut = {
        activeHasAllEditorNodes: [...editorNames].every((n) => afterNames.has(n)),
        connMatchAfter: afterConn === editorConn,
        activeGmail: findGmail(wf2.activeVersion?.nodes),
      }
      console.log('  PUT aplicado:', put.status, row.afterPut)
    } else {
      console.log('  PUT falló:', put.status, put.json)
    }
  } else {
    console.log(`\n=== OK SYNC: ${wf.name} (${id}) ===`)
    console.log('  Gmail:', editorGmail)
  }

  report.push(row)
}

writeFileSync(resolve(OUT, 'audit-sync-report.json'), JSON.stringify(report, null, 2))
console.log('\nReport:', resolve(OUT, 'audit-sync-report.json'))
