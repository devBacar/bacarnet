/**
 * Limpieza completa de un ticket helpdesk (reuniones, notas, Calendar).
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function loadHelpdeskCleanupEnv() {
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
  loadEnvFile(resolve(SCRIPTS_DIR, '.env'))
  loadEnvFile(resolve(SCRIPTS_DIR, '.env.local'))
}

export function initHelpdeskCleanupAdmin() {
  if (getApps().length > 0) return
  loadHelpdeskCleanupEnv()
  const credPath = process.env.ADMIN_SDK_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!credPath || !existsSync(resolve(credPath))) {
    throw new Error('ADMIN_SDK_KEY_PATH requerido')
  }
  const serviceAccount = JSON.parse(readFileSync(resolve(credPath), 'utf8'))
  initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id })
}

export async function deleteHelpdeskTicketFull(ticketId) {
  if (!ticketId) return false
  initHelpdeskCleanupAdmin()
  const db = getFirestore()
  const { deleteCalendarEvent } = await import('../lib/modules/helpdesk/calendar.js')

  const reunionsSnap = await db
    .collection('helpdeskTickets')
    .doc(ticketId)
    .collection('reuniones')
    .get()

  for (const reunionDoc of reunionsSnap.docs) {
    const eventId =
      typeof reunionDoc.get('calendarEventId') === 'string' ? reunionDoc.get('calendarEventId') : ''
    const organizer =
      typeof reunionDoc.get('calendarOrganizerEmail') === 'string'
        ? reunionDoc.get('calendarOrganizerEmail')
        : ''
    if (eventId && organizer) {
      try {
        await deleteCalendarEvent(organizer, eventId)
      } catch (err) {
        const code = err && typeof err === 'object' && 'code' in err ? err.code : null
        if (code !== 404 && code !== 410) throw err
      }
    }
  }

  for (const sub of ['reuniones', 'notas']) {
    const snap = await db.collection('helpdeskTickets').doc(ticketId).collection(sub).get()
    for (const doc of snap.docs) {
      await doc.ref.delete()
    }
  }

  await db.collection('helpdeskTickets').doc(ticketId).delete().catch(() => {})
  const check = await db.collection('helpdeskTickets').doc(ticketId).get()
  return !check.exists
}

export function isE2EHelpdeskTicket(data) {
  const area =
    typeof data.areaNombre === 'string' && data.areaNombre.toUpperCase().includes('E2E')
  const name =
    typeof data.requesterNombre === 'string' &&
    data.requesterNombre.toUpperCase().includes('E2E')
  return area || name
}

export async function listE2EHelpdeskTickets() {
  initHelpdeskCleanupAdmin()
  const db = getFirestore()
  const snap = await db.collection('helpdeskTickets').get()
  const rows = []
  for (const doc of snap.docs) {
    const data = doc.data()
    if (!isE2EHelpdeskTicket(data)) continue
    const createdAt = doc.get('createdAt')
    rows.push({
      id: doc.id,
      areaNombre: data.areaNombre ?? '',
      requesterNombre: data.requesterNombre ?? '',
      createdAt: createdAt?.toDate?.()?.toISOString?.() ?? String(createdAt ?? '—'),
    })
  }
  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return rows
}
