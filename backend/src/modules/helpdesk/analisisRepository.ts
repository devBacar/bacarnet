import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import {
  HELPDESK_ANALISIS_SUBCOLLECTION,
  HELPDESK_TICKETS_COLLECTION,
  type HelpdeskAnalisis,
  type HelpdeskAnalisisEstado,
  type HelpdeskTicket,
} from './types.js'

function analisisCol(ticketId: string) {
  return adminDb()
    .collection(HELPDESK_TICKETS_COLLECTION)
    .doc(ticketId)
    .collection(HELPDESK_ANALISIS_SUBCOLLECTION)
}

export async function getHelpdeskAnalisisById(
  ticketId: string,
  analisisId: string,
): Promise<(HelpdeskAnalisis & { id: string }) | null> {
  const snap = await analisisCol(ticketId).doc(analisisId).get()
  if (!snap.exists) return null
  return { id: snap.id, ...(snap.data() as HelpdeskAnalisis) }
}

export async function listHelpdeskAnalisisForTicket(
  ticketId: string,
): Promise<(HelpdeskAnalisis & { id: string })[]> {
  const snap = await analisisCol(ticketId).orderBy('subidoFecha', 'desc').get()
  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as HelpdeskAnalisis) }))
}

export async function hasHelpdeskAnalisisPendiente(ticketId: string): Promise<boolean> {
  const snap = await analisisCol(ticketId).where('estado', '==', 'pendiente').limit(1).get()
  return !snap.empty
}

export async function createHelpdeskAnalisis(input: {
  ticketId: string
  data: Omit<HelpdeskAnalisis, 'subidoFecha' | 'estado'>
}): Promise<string> {
  const ref = analisisCol(input.ticketId).doc()
  await ref.set({
    ...input.data,
    aprobadoresEmails: input.data.aprobadoresEmails.map((e) => e.trim().toLowerCase()),
    subidoFecha: FieldValue.serverTimestamp(),
    estado: 'pendiente' satisfies HelpdeskAnalisisEstado,
  })
  return ref.id
}

export async function updateHelpdeskAnalisisDecision(input: {
  ticketId: string
  analisisId: string
  estado: 'aprobado' | 'rechazado'
  decididoPorEmail: string
  comentarioDecision: string | null
}): Promise<void> {
  await analisisCol(input.ticketId)
    .doc(input.analisisId)
    .update({
      estado: input.estado,
      decididoPorEmail: input.decididoPorEmail.trim().toLowerCase(),
      decididoFecha: FieldValue.serverTimestamp(),
      comentarioDecision: input.comentarioDecision,
    })
}

export type HelpdeskAnalisisPendienteRow = HelpdeskAnalisis & {
  id: string
  ticketId: string
  ticket: HelpdeskTicket & { id: string }
}

export async function listHelpdeskAnalisisPendientesForApprover(
  approverEmail: string,
): Promise<HelpdeskAnalisisPendienteRow[]> {
  const normalized = approverEmail.trim().toLowerCase()
  const snap = await adminDb()
    .collectionGroup(HELPDESK_ANALISIS_SUBCOLLECTION)
    .where('estado', '==', 'pendiente')
    .where('aprobadoresEmails', 'array-contains', normalized)
    .get()

  const rows: HelpdeskAnalisisPendienteRow[] = []
  for (const doc of snap.docs) {
    const ticketRef = doc.ref.parent.parent
    if (!ticketRef) continue
    const ticketSnap = await ticketRef.get()
    if (!ticketSnap.exists) continue
    const ticket = { id: ticketSnap.id, ...(ticketSnap.data() as HelpdeskTicket) }
    rows.push({
      id: doc.id,
      ticketId: ticketRef.id,
      ...(doc.data() as HelpdeskAnalisis),
      ticket,
    })
  }

  rows.sort((a, b) => {
    const aMs = a.subidoFecha?.toMillis?.() ?? 0
    const bMs = b.subidoFecha?.toMillis?.() ?? 0
    return bMs - aMs
  })
  return rows
}
