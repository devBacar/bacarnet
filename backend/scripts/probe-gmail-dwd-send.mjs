/**
 * Prueba aislada: DWD + gmail.send impersonando un usuario de Workspace.
 *
 *   node backend/scripts/probe-gmail-dwd-send.mjs
 *   node backend/scripts/probe-gmail-dwd-send.mjs sistemas.ti@bacarsa.com.ar
 */

import { google } from 'googleapis'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const SUBJECT = (
  process.env.DWD_PROBE_SUBJECT ?? 'implementaciones.it@bacarsa.com.ar'
).trim().toLowerCase()
const TO = (process.argv[2] ?? 'sistemas.ti@bacarsa.com.ar').trim().toLowerCase()
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'

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

function buildRawEmail({ from, to, subject, body }) {
  const lines = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ]
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url')
}

async function main() {
  const keyPath = loadKeyPath()
  if (!keyPath) {
    throw new Error(
      'No se encontró JSON de SA. Definí DRIVE_SERVICE_ACCOUNT_KEY_PATH en backend/.env.local',
    )
  }

  const key = JSON.parse(readFileSync(keyPath, 'utf8'))
  console.log('=== Probe Gmail DWD ===')
  console.log('Service account:', key.client_email)
  console.log('Subject (impersonate):', SUBJECT)
  console.log('To:', TO)
  console.log('Scope:', GMAIL_SEND_SCOPE)

  const auth = new google.auth.JWT({
    keyFile: keyPath,
    scopes: [GMAIL_SEND_SCOPE],
    subject: SUBJECT,
  })

  await auth.authorize()
  console.log('Auth OK — token obtenido')

  const gmail = google.gmail({ version: 'v1', auth })
  const stamp = new Date().toISOString()
  const raw = buildRawEmail({
    from: SUBJECT,
    to: TO,
    subject: 'PRUEBA — Correo DWD de testing, borrar',
    body: [
      'Prueba aislada de Domain-Wide Delegation + gmail.send.',
      '',
      `Impersonando: ${SUBJECT}`,
      `Enviado: ${stamp}`,
      'Script: backend/scripts/probe-gmail-dwd-send.mjs',
    ].join('\n'),
  })

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  })

  console.log('\nGMAIL_SEND_OK')
  console.log('messageId:', res.data.id)
  console.log('threadId:', res.data.threadId)
  console.log('labelIds:', (res.data.labelIds ?? []).join(', ') || '(ninguno)')
}

main().catch((err) => {
  console.error('\nGMAIL_SEND_ERROR')
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
