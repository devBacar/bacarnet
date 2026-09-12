/**
 * Paso 0: verificarToken no consume; consumirToken sí.
 *
 *   npm --prefix backend run build
 *   node backend/scripts/test-helpdesk-token-flow.mjs
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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

async function main() {
  loadEnvFile(resolve(SCRIPTS_DIR, '.env'))
  loadEnvFile(resolve(SCRIPTS_DIR, '.env.local'))

  if (!process.env.HELPDESK_TOKEN_SECRET?.trim()) {
    throw new Error('HELPDESK_TOKEN_SECRET requerido')
  }

  const { generarTokenSolicitud, verificarToken, consumirToken } = await import(
    '../lib/modules/helpdesk/accessToken.js'
  )
  const { HelpdeskTokenAlreadyUsedError } = await import('../lib/modules/helpdesk/errors.js')

  const token = generarTokenSolicitud({
    email: 'token-flow-test@bacarsa.com.ar',
    nombre: 'Token Flow Test',
    areaId: 'test-area',
    areaNombre: 'Test',
  })

  const first = await verificarToken(token)
  const second = await verificarToken(token)
  if (first.jti !== second.jti) throw new Error('jti inconsistente')

  console.log('PASS  verificarToken x2 sin consumir')

  await consumirToken(first.jti, { requesterEmail: first.email })
  console.log('PASS  consumirToken')

  try {
    await verificarToken(token)
    throw new Error('verificarToken debió fallar tras consumir')
  } catch (err) {
    if (!(err instanceof HelpdeskTokenAlreadyUsedError)) throw err
    console.log('PASS  verificarToken rechaza jti consumido')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
