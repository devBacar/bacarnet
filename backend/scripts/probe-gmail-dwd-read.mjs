/**
 * Prueba aislada: DWD + gmail.readonly impersonando un usuario de Workspace.
 *
 *   node backend/scripts/probe-gmail-dwd-read.mjs
 *   node backend/scripts/probe-gmail-dwd-read.mjs implementaciones.it@bacarsa.com.ar
 */

import { google } from 'googleapis'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const SUBJECT = (
  process.argv[2] ?? process.env.DWD_PROBE_SUBJECT ?? 'implementaciones.it@bacarsa.com.ar'
)
  .trim()
  .toLowerCase()
const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const TIMEZONE = 'America/Argentina/Buenos_Aires'

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

function todayInTimeZone() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

async function main() {
  const keyPath = loadKeyPath()
  if (!keyPath) {
    throw new Error(
      'No se encontró JSON de SA. Definí DRIVE_SERVICE_ACCOUNT_KEY_PATH en backend/.env.local',
    )
  }

  const key = JSON.parse(readFileSync(keyPath, 'utf8'))
  console.log('=== Probe Gmail Readonly DWD ===')
  console.log('Service account:', key.client_email)
  console.log('Subject (impersonate):', SUBJECT)
  console.log('Scope:', GMAIL_READONLY_SCOPE)

  const auth = new google.auth.JWT({
    keyFile: keyPath,
    scopes: [GMAIL_READONLY_SCOPE],
    subject: SUBJECT,
  })

  await auth.authorize()
  console.log('Auth OK — token obtenido')

  const gmail = google.gmail({ version: 'v1', auth })
  const today = todayInTimeZone()
  const [year, month, day] = today.split('-')
  const query = `in:inbox after:${year}/${month}/${day}`

  console.log('Query:', query)

  const list = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 10,
  })

  const ids = (list.data.messages ?? []).map((item) => item.id).filter(Boolean)
  console.log('\nGMAIL_LIST_OK')
  console.log('messageCount:', ids.length)

  for (const id of ids.slice(0, 5)) {
    const message = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date'],
    })
    const headers = message.data.payload?.headers ?? []
    const get = (name) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value
    console.log('---')
    console.log('id:', id)
    console.log('from:', get('From'))
    console.log('subject:', get('Subject'))
    console.log('date:', get('Date'))
    console.log('snippet:', message.data.snippet?.slice(0, 120))
  }
}

main().catch((err) => {
  console.error('\nGMAIL_READONLY_ERROR')
  if (err instanceof Error) {
    console.error('message:', err.message)
    const gaxios = err
    if (gaxios.response?.data) {
      console.error('api:', JSON.stringify(gaxios.response.data, null, 2))
    }
  } else {
    console.error(err)
  }
  process.exit(1)
})
