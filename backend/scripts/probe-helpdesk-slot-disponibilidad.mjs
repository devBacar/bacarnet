/**
 * Consulta un slot en disponibilidad-inicial (token nuevo).
 * node backend/scripts/probe-helpdesk-slot-disponibilidad.mjs "14/09/2026" "09:00"
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fechaTarget = process.argv[2] ?? '14/09/2026'
const horaTarget = process.argv[3] ?? '09:00'

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

  const { app } = await import('../lib/server.js')
  const port = 8798
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, '127.0.0.1', (err) => (err ? reject(err) : resolve(s)))
  })

  const { generarTokenSolicitud } = await import('../lib/modules/helpdesk/accessToken.js')
  const token = generarTokenSolicitud({
    email: `slot-check+${Date.now()}@bacarsa.com.ar`,
    nombre: 'Slot Check',
    areaId: 'r7QVKsrSiqDWC8DrXCac',
    areaNombre: 'Sistemas',
  })

  const url = `http://127.0.0.1:${port}/api/helpdesk/disponibilidad-inicial?token=${encodeURIComponent(token)}&semanaOffset=0`
  const res = await fetch(url)
  const body = await res.json()

  const slot = (body.slots ?? []).find((s) => s.fecha === fechaTarget && s.hora === horaTarget)

  console.log('HTTP', res.status)
  console.log('Slot buscado:', fechaTarget, horaTarget)
  console.log('Slot encontrado:', JSON.stringify(slot ?? null, null, 2))

  await new Promise((r) => server.close(r))
  if (!slot) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
