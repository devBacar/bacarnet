/**
 * Flujo público: disponibilidad (token reutilizable) → solicitud (consume token).
 *
 *   npm --prefix backend run build
 *   node backend/scripts/test-helpdesk-solicitud.mjs
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

  let server
  let base = process.env.FUNCTIONS_API_BASE?.trim() || ''

  if (!base) {
    const { app } = await import('../lib/server.js')
    const port = Number(process.env.HELPDESK_TEST_PORT ?? 8799)
    await new Promise((resolve, reject) => {
      server = app.listen(port, '127.0.0.1', (err) => (err ? reject(err) : resolve()))
    })
    base = `http://127.0.0.1:${port}`
    console.log(`Express local en ${base}`)
  }

  const apiBase = base.replace(/\/+$/, '')
  const { generarTokenSolicitud } = await import('../lib/modules/helpdesk/accessToken.js')

  const token = generarTokenSolicitud({
    uid: null,
    email: `prueba.helpdesk+${Date.now()}@bacarsa.com.ar`,
    nombre: 'Usuario Prueba Helpdesk',
    areaId: 'r7QVKsrSiqDWC8DrXCac',
    areaNombre: 'Sistemas',
  })

  const dispUrl = `${apiBase}/api/helpdesk/disponibilidad-inicial?token=${encodeURIComponent(token)}&semanaOffset=0`
  const dispRes = await fetch(dispUrl)
  const dispBody = await dispRes.json().catch(() => ({}))
  console.log(`GET disponibilidad-inicial → ${dispRes.status}`)
  if (dispRes.status !== 200) {
    console.log(JSON.stringify(dispBody, null, 2))
    process.exit(1)
  }

  const slot = (dispBody.slots ?? []).find((s) => s.libre === true)
  if (!slot) {
    console.error('No hay slots libres para probar solicitud')
    process.exit(1)
  }
  console.log(`Slot elegido: ${slot.fecha} ${slot.hora}`)

  const dispAgain = await fetch(dispUrl)
  if (dispAgain.status !== 200) {
    console.error('El token debía seguir válido antes del POST')
    process.exit(1)
  }
  console.log('PASS  token reutilizable en disponibilidad')

  const solicitudUrl = `${apiBase}/api/helpdesk/solicitudes`
  const res = await fetch(solicitudUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      problematica: 'Prueba automática mesa de ayuda con Calendar.',
      urgencia: 'media',
      fecha: slot.fecha,
      hora: slot.hora,
    }),
  })

  const body = await res.json().catch(() => ({}))
  console.log(`\nPOST solicitudes → ${res.status}`)
  console.log(JSON.stringify(body, null, 2))

  if (res.status !== 201) {
    process.exit(1)
  }

  const replay = await fetch(solicitudUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      problematica: 'Reintento',
      urgencia: 'baja',
      fecha: slot.fecha,
      hora: slot.hora,
    }),
  })
  console.log(`\nReintento POST (esperado 401): ${replay.status}`)
  if (replay.status !== 401) process.exit(1)

  if (server) {
    await new Promise((resolve) => server.close(resolve))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
