/**
 * POST /api/helpdesk/campana/generar-enlace
 *
 * Local (Express):
 *   npm --prefix backend run build
 *   node backend/scripts/test-helpdesk-campana-generar-enlace.mjs
 *
 * Producción (post-deploy):
 *   node backend/scripts/test-helpdesk-campana-generar-enlace.mjs --prod
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROD_DEFAULT = 'https://southamerica-east1-bacar-web.cloudfunctions.net/api'
/** Nombre exacto del header HTTP entrante (n8n → Bacarnet). NO usar HELPDESK_N8N_API_KEY como nombre de header. */
const N8N_INBOUND_API_HEADER = 'X-Api-Key'

function loadEnvFile(path) {
  if (!existsSync(path)) return
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

async function main() {
  loadEnvFile(resolve(SCRIPTS_DIR, '.env'))
  loadEnvFile(resolve(SCRIPTS_DIR, '.env.local'))

  const useProd = process.argv.includes('--prod')
  let server
  let base

  if (useProd) {
    base = (process.env.FUNCTIONS_API_BASE?.trim() || PROD_DEFAULT).replace(/\/+$/, '')
    console.log(`Target: PRODUCCIÓN ${base}`)
  } else {
    const { app } = await import('../lib/server.js')
    const port = Number(process.env.HELPDESK_TEST_PORT ?? 8799)
    server = await new Promise((resolvePromise, reject) => {
      const s = app.listen(port, '127.0.0.1', (err) => (err ? reject(err) : resolvePromise(s)))
    })
    base = `http://127.0.0.1:${port}`
    console.log(`Target: local ${base}`)
  }

  const apiKey = process.env.HELPDESK_N8N_API_KEY?.trim()
  if (!apiKey) throw new Error('HELPDESK_N8N_API_KEY requerida en backend/.env.local')

  const url = `${base}/api/helpdesk/campana/generar-enlace`
  const body = {
    email: process.env.HELPDESK_TEST_CAMPAIGN_EMAIL?.trim() || 'sistemas.ti@bacarsa.com.ar',
    nombre: process.env.HELPDESK_TEST_CAMPAIGN_NOMBRE?.trim() || 'Prueba Campaña n8n',
    areaNombre: process.env.HELPDESK_TEST_CAMPAIGN_AREA?.trim() || 'Sistemas',
  }

  const noKey = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  console.log(`Sin ${N8N_INBOUND_API_HEADER} → ${noKey.status} (esperado 401)`)

  const authHeaders = new Headers()
  authHeaders.set('Content-Type', 'application/json')
  authHeaders.set('Accept', 'application/json')
  authHeaders.set(N8N_INBOUND_API_HEADER, apiKey)
  console.log(`Enviando header HTTP: "${N8N_INBOUND_API_HEADER}" (valor desde env HELPDESK_N8N_API_KEY)`)

  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  console.log(`POST ${url}`)
  console.log(`Status: ${res.status}`)
  console.log(JSON.stringify(json, null, 2))

  const linkOk =
    res.status === 200 &&
    typeof json.link === 'string' &&
    json.link.startsWith('https://bacarnet.web.app/support?t=')

  if (!linkOk) {
    if (useProd && res.status === 404) {
      console.error('\n404 en prod: desplegá functions:api con este código antes de --prod')
    }
    process.exit(1)
  }

  console.log('\n✅ PASS: link con ?t= recibido')
  if (server) await new Promise((r) => server.close(r))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
