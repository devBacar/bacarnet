/**
 * Verifica si aiplatform.googleapis.com está habilitada en bacar-web.
 */
import { google } from 'googleapis'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const PROJECT = 'bacar-web'
const SERVICE = 'aiplatform.googleapis.com'

function loadKeyPath() {
  const candidates = [
    process.env.DRIVE_SERVICE_ACCOUNT_KEY_PATH,
    process.env.ADMIN_SDK_KEY_PATH,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  ].filter(Boolean)
  for (const raw of candidates) {
    const absolute = resolve(String(raw))
    if (existsSync(absolute)) return absolute
  }
  return null
}

async function getAccessToken() {
  const keyPath = loadKeyPath()
  if (keyPath) {
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    })
    const client = await auth.getClient()
    const { token } = await client.getAccessToken()
    if (token) return token
  }

  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })
  const client = await auth.getClient()
  const { token } = await client.getAccessToken()
  if (!token) throw new Error('No se pudo obtener access token')
  return token
}

async function main() {
  const token = await getAccessToken()
  const url = `https://serviceusage.googleapis.com/v1/projects/${PROJECT}/services/${SERVICE}`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  const body = await res.json().catch(() => ({}))

  if (res.status === 404) {
    console.log('VERTEX_API_ENABLED: false')
    console.log('DETAIL: servicio no encontrado o nunca habilitado')
    return
  }

  if (!res.ok) {
    console.log('VERTEX_API_ENABLED: unknown')
    console.log('HTTP', res.status)
    console.log(JSON.stringify(body, null, 2))
    process.exitCode = 1
    return
  }

  const state = body.state ?? 'UNKNOWN'
  const enabled = state === 'ENABLED'
  console.log(`VERTEX_API_ENABLED: ${enabled}`)
  console.log(`STATE: ${state}`)
  if (body.config?.title) console.log(`TITLE: ${body.config.title}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
