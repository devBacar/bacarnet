/**
 * Lee reunión inicial de un ticket helpdesk (Admin SDK).
 * node backend/scripts/probe-helpdesk-ticket-reunion.mjs <ticketId>
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ticketId = process.argv[2]?.trim()

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

function initAdmin() {
  if (getApps().length > 0) return
  loadEnvFile(resolve(SCRIPTS_DIR, '.env'))
  loadEnvFile(resolve(SCRIPTS_DIR, '.env.local'))
  const credPath = process.env.ADMIN_SDK_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!credPath || !existsSync(resolve(credPath))) {
    throw new Error('ADMIN_SDK_KEY_PATH requerido')
  }
  const serviceAccount = JSON.parse(readFileSync(resolve(credPath), 'utf8'))
  initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id })
}

async function main() {
  if (!ticketId) throw new Error('Uso: node probe-helpdesk-ticket-reunion.mjs <ticketId>')
  initAdmin()
  const db = getFirestore()

  const ticketSnap = await db.collection('helpdeskTickets').doc(ticketId).get()
  if (!ticketSnap.exists) {
    console.log('Ticket no encontrado')
    process.exit(1)
  }

  const reunions = await db
    .collection('helpdeskTickets')
    .doc(ticketId)
    .collection('reuniones')
    .get()

  console.log('Ticket:', ticketId)
  console.log('Reuniones:', reunions.size)

  for (const doc of reunions.docs) {
    const d = doc.data()
    console.log('\n--- reunion', doc.id, '---')
    console.log(JSON.stringify(
      {
        tipo: d.tipo,
        fecha: d.fecha,
        hora: d.hora,
        estado: d.estado,
        calendarEventId: d.calendarEventId ?? null,
        calendarHtmlLink: d.calendarHtmlLink ?? null,
        calendarOrganizerEmail: d.calendarOrganizerEmail ?? null,
        calendarError: d.calendarError ?? null,
        calendarErrorMessage: d.calendarErrorMessage ?? null,
      },
      null,
      2,
    ))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
