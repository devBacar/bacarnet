/**
 * Prueba GET /api/helpdesk/campana/enlaces (Express local o FUNCTIONS_API_BASE).
 *
 *   npm --prefix backend run build
 *   node backend/scripts/test-helpdesk-campana-enlaces.mjs
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

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

function loadEnv() {
  loadEnvFile(resolve(SCRIPTS_DIR, '.env'))
  loadEnvFile(resolve(SCRIPTS_DIR, '.env.local'))
  loadEnvFile(resolve(ROOT, '.env.local'))
}

async function main() {
  loadEnv()

  if (!process.env.HELPDESK_TOKEN_SECRET?.trim()) {
    throw new Error('Definí HELPDESK_TOKEN_SECRET en backend/.env.local')
  }
  if (!process.env.HELPDESK_N8N_API_KEY?.trim()) {
    throw new Error('Definí HELPDESK_N8N_API_KEY en backend/.env.local')
  }

  let server
  let base = process.env.FUNCTIONS_API_BASE?.trim() || ''

  if (!base) {
    const { app } = await import('../lib/server.js')
    const port = Number(process.env.HELPDESK_TEST_PORT ?? 8799)
    await new Promise((resolvePromise, reject) => {
      server = app.listen(port, '127.0.0.1', (err) => (err ? reject(err) : resolvePromise()))
    })
    base = `http://127.0.0.1:${port}`
    console.log(`Express local en ${base}`)
  }

  const url = `${base.replace(/\/+$/, '')}/api/helpdesk/campana/enlaces`
  const apiKey = process.env.HELPDESK_N8N_API_KEY.trim()

  const unauthorized = await fetch(url)
  console.log(`\nSin X-Api-Key → status ${unauthorized.status} (esperado 401)`)
  if (unauthorized.status !== 401) process.exit(1)

  const res = await fetch(url, { headers: { 'X-Api-Key': apiKey } })
  const body = await res.json().catch(() => ({}))
  console.log(`\nGET ${url}`)
  console.log(`Status: ${res.status}`)
  console.log(`Enlaces: ${Array.isArray(body.enlaces) ? body.enlaces.length : 0}`)
  console.log(`Áreas sin jefe: ${Array.isArray(body.areasSinJefe) ? body.areasSinJefe.length : 0}`)

  if (Array.isArray(body.enlaces) && body.enlaces.length > 0) {
    const sample = body.enlaces[0]
    console.log('\nEjemplo de enlace:')
    console.log(JSON.stringify(sample, null, 2))
    if (!sample.link?.startsWith('https://bacarnet.web.app/support?t=')) {
      console.error('El link no usa PUBLIC_APP_URL/support')
      process.exit(1)
    }
  }

  if (Array.isArray(body.areasSinJefe) && body.areasSinJefe.length > 0) {
    console.log('\n=== areasSinJefe (gerencia) ===')
    for (const row of body.areasSinJefe) {
      console.log(`- ${row.areaNombre} (${row.areaId})`)
    }
  }

  if (res.status !== 200) {
    console.log(JSON.stringify(body, null, 2))
    process.exit(1)
  }

  if (!Array.isArray(body.enlaces) || body.enlaces.length === 0) {
    console.error('Se esperaba al menos un enlace con API key válida')
    process.exit(1)
  }

  const wrongKey = await fetch(url, { headers: { 'X-Api-Key': `${apiKey}x` } })
  console.log(`\nX-Api-Key incorrecta → status ${wrongKey.status} (esperado 401)`)
  if (wrongKey.status !== 401) process.exit(1)

  function maskLink(link) {
    if (typeof link !== 'string') return link
    const idx = link.indexOf('t=')
    if (idx === -1) return link
    const prefix = link.slice(0, idx + 2)
    const token = decodeURIComponent(link.slice(idx + 2))
    return `${prefix}${token.slice(0, 20)}…[${token.length} chars]`
  }

  const masked = {
    enlaces: (body.enlaces ?? []).map((row) => ({
      ...row,
      link: maskLink(row.link),
    })),
    areasSinJefe: body.areasSinJefe ?? [],
  }
  console.log('\n=== Respuesta (tokens enmascarados) ===')
  console.log(JSON.stringify(masked, null, 2))

  if (server) {
    await new Promise((resolveClose) => server.close(resolveClose))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
