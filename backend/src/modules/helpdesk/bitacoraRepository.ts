import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import {
  HELPDESK_BITACORA_SUBCOLLECTION,
  HELPDESK_TICKETS_COLLECTION,
  type HelpdeskBitacoraEntrada,
} from './types.js'

function bitacoraCol(ticketId: string) {
  return adminDb()
    .collection(HELPDESK_TICKETS_COLLECTION)
    .doc(ticketId)
    .collection(HELPDESK_BITACORA_SUBCOLLECTION)
}

export async function listHelpdeskBitacoraForTicket(
  ticketId: string,
): Promise<(HelpdeskBitacoraEntrada & { id: string })[]> {
  const snap = await bitacoraCol(ticketId).orderBy('createdAt', 'asc').get()
  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as HelpdeskBitacoraEntrada) }))
}

export async function createHelpdeskBitacoraEntrada(input: {
  ticketId: string
  entrada: Omit<HelpdeskBitacoraEntrada, 'createdAt'>
}): Promise<string> {
  const ref = bitacoraCol(input.ticketId).doc()
  await ref.set({
    ...input.entrada,
    autorEmail: input.entrada.autorEmail.trim().toLowerCase(),
    createdAt: FieldValue.serverTimestamp(),
  })
  return ref.id
}
