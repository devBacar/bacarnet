import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import { HELPDESK_TICKETS_COLLECTION } from './types.js'
import {
  HELPDESK_VISTO_POR_SUBCOLLECTION,
  type HelpdeskVistoPorDoc,
  type HelpdeskVistoSeccion,
} from './vistoPorTypes.js'

function vistoPorRef(ticketId: string, uid: string) {
  return adminDb()
    .collection(HELPDESK_TICKETS_COLLECTION)
    .doc(ticketId)
    .collection(HELPDESK_VISTO_POR_SUBCOLLECTION)
    .doc(uid)
}

export async function getHelpdeskVistoPor(
  ticketId: string,
  uid: string,
): Promise<HelpdeskVistoPorDoc | null> {
  const snap = await vistoPorRef(ticketId, uid).get()
  if (!snap.exists) return null
  return snap.data() as HelpdeskVistoPorDoc
}

export async function markHelpdeskVistoSeccion(
  ticketId: string,
  uid: string,
  seccion: HelpdeskVistoSeccion,
  at: Timestamp = Timestamp.now(),
): Promise<void> {
  await vistoPorRef(ticketId, uid).set(
    {
      [seccion]: at,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

export async function markHelpdeskVistoSeccionNowForUser(
  ticketId: string,
  uid: string | null | undefined,
  seccion: HelpdeskVistoSeccion,
): Promise<void> {
  const trimmed = uid?.trim()
  if (!trimmed) return
  await markHelpdeskVistoSeccion(ticketId, trimmed, seccion)
}
