/**
 * Prueba aislada: DWD + calendar.events impersonando un usuario de Workspace.
 *
 *   node backend/scripts/probe-calendar-dwd-create.mjs
 */

import { google } from 'googleapis'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadTestEnv } from './get-test-token.mjs'
import { TEST_EVENT_TITLE, deleteCalendarEvent } from './test-calendar-utils.mjs'

loadTestEnv()

const SUBJECT = (
  process.env.DWD_PROBE_SUBJECT ?? 'implementaciones.it@bacarsa.com.ar'
).trim().toLowerCase()
const TIMEZONE = 'America/Argentina/Buenos_Aires'
const CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

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

function formatLocalIso(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

async function main() {
  const keyPath = loadKeyPath()
  if (!keyPath) {
    throw new Error(
      'No se encontró JSON de SA. Definí DRIVE_SERVICE_ACCOUNT_KEY_PATH en backend/.env.local',
    )
  }

  const key = JSON.parse(readFileSync(keyPath, 'utf8'))
  console.log('=== Probe Calendar DWD ===')
  console.log('Service account:', key.client_email)
  console.log('Subject (impersonate):', SUBJECT)
  console.log('Scope:', CALENDAR_EVENTS_SCOPE)

  const auth = new google.auth.JWT({
    keyFile: keyPath,
    scopes: [CALENDAR_EVENTS_SCOPE],
    subject: SUBJECT,
  })

  await auth.authorize()
  console.log('Auth OK — token obtenido')

  const calendar = google.calendar({ version: 'v3', auth })
  const stamp = new Date().toISOString()

  const start = new Date()
  start.setDate(start.getDate() + 1)
  start.setHours(10, 0, 0, 0)
  const end = new Date(start)
  end.setMinutes(end.getMinutes() + 30)

  const requestBody = {
    summary: TEST_EVENT_TITLE,
    description: [
      'Prueba aislada de Domain-Wide Delegation + calendar.events.',
      '',
      `Impersonando: ${SUBJECT}`,
      `Creado: ${stamp}`,
      'Script: backend/scripts/probe-calendar-dwd-create.mjs',
    ].join('\n'),
    start: {
      dateTime: formatLocalIso(start),
      timeZone: TIMEZONE,
    },
    end: {
      dateTime: formatLocalIso(end),
      timeZone: TIMEZONE,
    },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 10 }],
    },
  }

  let eventId = null
  try {
    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody,
    })
    eventId = res.data.id ?? null

    console.log('\nCALENDAR_CREATE_OK')
    console.log('eventId:', res.data.id)
    console.log('htmlLink:', res.data.htmlLink)
    console.log('summary:', res.data.summary)
    console.log('start:', res.data.start?.dateTime, res.data.start?.timeZone)
    console.log('end:', res.data.end?.dateTime, res.data.end?.timeZone)
    console.log('status:', res.data.status)
  } finally {
    if (eventId) {
      await deleteCalendarEvent(calendar, eventId)
      console.log('\nSelf-cleanup: evento eliminado', eventId)
    }
  }
}

main().catch((err) => {
  console.error('\nCALENDAR_CREATE_ERROR')
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
