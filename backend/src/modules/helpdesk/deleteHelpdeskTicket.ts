import { adminDb } from '../../lib/firebase/admin.js'
import { deleteCalendarEvent } from './calendar.js'
import {
  HELPDESK_ANALISIS_SUBCOLLECTION,
  HELPDESK_BITACORA_SUBCOLLECTION,
  HELPDESK_NOTAS_SUBCOLLECTION,
  HELPDESK_REUNIONES_SUBCOLLECTION,
  HELPDESK_TICKETS_COLLECTION,
  type HelpdeskReunion,
} from './types.js'

async function deleteTicketSubcollection(ticketId: string, subcollection: string): Promise<void> {
  const snap = await adminDb()
    .collection(HELPDESK_TICKETS_COLLECTION)
    .doc(ticketId)
    .collection(subcollection)
    .get()
  await Promise.all(snap.docs.map((doc) => doc.ref.delete()))
}

export async function deleteHelpdeskTicketCompletely(ticketId: string): Promise<boolean> {
  const ticketRef = adminDb().collection(HELPDESK_TICKETS_COLLECTION).doc(ticketId)
  const ticketSnap = await ticketRef.get()
  if (!ticketSnap.exists) return false

  const reunionsSnap = await ticketRef.collection(HELPDESK_REUNIONES_SUBCOLLECTION).get()
  for (const reunionDoc of reunionsSnap.docs) {
    const reunion = reunionDoc.data() as HelpdeskReunion
    const eventId =
      typeof reunion.calendarEventId === 'string' ? reunion.calendarEventId.trim() : ''
    const organizer =
      typeof reunion.calendarOrganizerEmail === 'string'
        ? reunion.calendarOrganizerEmail.trim()
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

  for (const sub of [
    HELPDESK_REUNIONES_SUBCOLLECTION,
    HELPDESK_NOTAS_SUBCOLLECTION,
    HELPDESK_ANALISIS_SUBCOLLECTION,
    HELPDESK_BITACORA_SUBCOLLECTION,
  ]) {
    await deleteTicketSubcollection(ticketId, sub)
  }

  await ticketRef.delete()
  const check = await ticketRef.get()
  return !check.exists
}
