/**
 * Borra ticket de prueba helpdesk + subcolecciones y evento de Calendar asociado.
 *
 *   npm --prefix backend run build
 *   node backend/scripts/cleanup-helpdesk-test-ticket.mjs
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const TICKET_ID = 'd7h0AGpUkgzeQhjQDvDv'
const ORGANIZER = 'admin@bacarsa.com.ar'
const EVENT_ID = 'uhea1l8gg6r0tu7o8jppj02t6g'

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
  const serviceAccount = JSON.parse(readFileSync(resolve(credPath), 'utf8'))
  initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id })
}

async function deleteSubcollection(db, ticketId, sub) {
  const snap = await db
    .collection('helpdeskTickets')
    .doc(ticketId)
    .collection(sub)
    .get()
  for (const doc of snap.docs) {
    await doc.ref.delete()
    console.log(`  deleted ${sub}/${doc.id}`)
  }
}

async function main() {
  initAdmin()
  const db = getFirestore()

  const { deleteCalendarEvent } = await import('../lib/modules/helpdesk/calendar.js')

  console.log('Eliminando evento Calendar…')
  try {
    await deleteCalendarEvent(ORGANIZER, EVENT_ID)
    console.log('  Calendar event deleted')
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? err.code : null
    if (code === 404 || code === 410) {
      console.log('  Calendar event ya no existía')
    } else {
      throw err
    }
  }

  console.log('Eliminando subcolecciones…')
  await deleteSubcollection(db, TICKET_ID, 'reuniones')
  await deleteSubcollection(db, TICKET_ID, 'notas')

  console.log('Eliminando ticket…')
  await db.collection('helpdeskTickets').doc(TICKET_ID).delete()
  console.log('  ticket deleted')

  const check = await db.collection('helpdeskTickets').doc(TICKET_ID).get()
  console.log('Ticket existe:', check.exists)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
