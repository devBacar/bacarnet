import {
  FieldValue,
  Timestamp,
  type Query,
  type Transaction,
} from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import { logInfo } from '../../lib/log.js'
import { HelpdeskTokenAlreadyUsedError } from './errors.js'
import {
  HELPDESK_EMAIL_LOG_COLLECTION,
  HELPDESK_REUNIONES_SUBCOLLECTION,
  HELPDESK_TEAM_COLLECTION,
  HELPDESK_TICKETS_COLLECTION,
  HELPDESK_USED_TOKENS_COLLECTION,
  type HelpdeskEmailLog,
  type HelpdeskEmailLogTipo,
  type HelpdeskMinutaDiagnostico,
  type HelpdeskReunion,
  type HelpdeskTicket,
  type HelpdeskTeamMember,
  type HelpdeskTeamMemberRecord,
  type HelpdeskUrgencia,
  HELPDESK_NOTAS_SUBCOLLECTION,
} from './types.js'

export async function getHelpdeskTeamMemberById(
  teamId: string,
): Promise<(HelpdeskTeamMemberRecord & { id: string }) | null> {
  const snap = await adminDb().collection(HELPDESK_TEAM_COLLECTION).doc(teamId).get()
  if (!snap.exists) return null
  return { id: snap.id, ...(snap.data() as HelpdeskTeamMemberRecord) }
}

export async function listActiveHelpdeskTeamMembers(): Promise<
  (HelpdeskTeamMemberRecord & { id: string })[]
> {
  const snap = await adminDb().collection(HELPDESK_TEAM_COLLECTION).where('activo', '==', true).get()
  const members = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as HelpdeskTeamMemberRecord) }))
  members.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return members
}

export async function isActiveHelpdeskTeamMemberByEmail(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false
  const members = await listActiveHelpdeskTeamMembers()
  return members.some((m) => m.email.trim().toLowerCase() === normalized)
}

export async function listHelpdeskEmailLogForTicket(
  ticketId: string,
): Promise<(HelpdeskEmailLog & { id: string })[]> {
  const snap = await adminDb()
    .collection(HELPDESK_EMAIL_LOG_COLLECTION)
    .where('ticketId', '==', ticketId)
    .get()
  const rows = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as HelpdeskEmailLog) }))
  rows.sort((a, b) => {
    const aMs = a.fecha?.toMillis?.() ?? 0
    const bMs = b.fecha?.toMillis?.() ?? 0
    return bMs - aMs
  })
  return rows
}

export async function listPrimeraReunionTeamMembers(): Promise<
  (HelpdeskTeamMemberRecord & { id: string })[]
> {
  const members = await listActiveHelpdeskTeamMembers()
  return members.filter((m) => m.primeraReunion === true)
}

export function pickResponsablePrincipalTeamMember(
  members: (HelpdeskTeamMemberRecord & { id: string })[],
): (HelpdeskTeamMemberRecord & { id: string }) | null {
  for (const member of members) {
    if (member.responsablePrincipal === true) {
      return member
    }
  }
  return null
}

/** Miembro activo de primera reunión marcado explícitamente como responsable principal. */
export async function findResponsablePrincipalPrimeraReunionTeamMemberId(): Promise<string | null> {
  const responsable = pickResponsablePrincipalTeamMember(await listPrimeraReunionTeamMembers())
  if (!responsable) {
    logInfo(
      'helpdesk: no se encontró responsablePrincipal con primeraReunion; asignadoATeamId quedará null',
    )
    return null
  }
  return responsable.id
}

export async function isHelpdeskTokenJtiUsed(jti: string): Promise<boolean> {
  const snap = await adminDb().collection(HELPDESK_USED_TOKENS_COLLECTION).doc(jti).get()
  return snap.exists
}

export async function markHelpdeskTokenJtiInTransaction(
  tx: Transaction,
  jti: string,
  meta?: { requesterEmail?: string },
): Promise<void> {
  const ref = adminDb().collection(HELPDESK_USED_TOKENS_COLLECTION).doc(jti)
  const snap = await tx.get(ref)
  if (snap.exists) {
    throw new HelpdeskTokenAlreadyUsedError()
  }
  tx.set(ref, {
    usedAt: FieldValue.serverTimestamp(),
    ...(meta?.requesterEmail ? { requesterEmail: meta.requesterEmail.trim().toLowerCase() } : {}),
  })
}

export async function runConsumirTokenTransaction(
  jti: string,
  meta?: { requesterEmail?: string },
): Promise<void> {
  await adminDb().runTransaction(async (tx) => {
    await markHelpdeskTokenJtiInTransaction(tx, jti, meta)
  })
}

export async function upsertHelpdeskTeamMemberByEmail(
  member: HelpdeskTeamMember,
): Promise<string> {
  const normalizedEmail = member.email.trim().toLowerCase()
  const existing = await adminDb()
    .collection(HELPDESK_TEAM_COLLECTION)
    .where('email', '==', normalizedEmail)
    .limit(1)
    .get()

  const payload = {
    uid: member.uid ?? null,
    nombre: member.nombre.trim(),
    email: normalizedEmail,
    rol: member.rol.trim(),
    activo: member.activo,
    primeraReunion: member.primeraReunion,
    responsablePrincipal: member.responsablePrincipal,
    updatedAt: FieldValue.serverTimestamp(),
  }

  if (!existing.empty) {
    const ref = existing.docs[0].ref
    await ref.set(payload, { merge: true })
    return ref.id
  }

  const ref = adminDb().collection(HELPDESK_TEAM_COLLECTION).doc()
  await ref.set({
    ...payload,
    createdAt: FieldValue.serverTimestamp(),
  })
  return ref.id
}

export async function createHelpdeskTicketWithInitialReunion(input: {
  jti: string
  token: string
  ticket: Omit<HelpdeskTicket, 'createdAt'>
  reunion: Omit<HelpdeskReunion, 'createdAt'>
}): Promise<{ ticketId: string; reunionId: string }> {
  return adminDb().runTransaction(async (tx) => {
    await markHelpdeskTokenJtiInTransaction(tx, input.jti, {
      requesterEmail: input.ticket.requesterEmail,
    })

    const ticketRef = adminDb().collection(HELPDESK_TICKETS_COLLECTION).doc()
    tx.set(ticketRef, {
      ...input.ticket,
      createdAt: FieldValue.serverTimestamp(),
    })

    const reunionRef = ticketRef.collection(HELPDESK_REUNIONES_SUBCOLLECTION).doc()
    tx.set(reunionRef, {
      ...input.reunion,
      createdAt: FieldValue.serverTimestamp(),
    })

    return { ticketId: ticketRef.id, reunionId: reunionRef.id }
  })
}

export async function createHelpdeskTicketReunion(input: {
  ticketId: string
  reunion: Omit<HelpdeskReunion, 'createdAt'>
}): Promise<string> {
  const ref = adminDb()
    .collection(HELPDESK_TICKETS_COLLECTION)
    .doc(input.ticketId)
    .collection(HELPDESK_REUNIONES_SUBCOLLECTION)
    .doc()
  await ref.set({
    ...input.reunion,
    createdAt: FieldValue.serverTimestamp(),
  })
  return ref.id
}

export async function getHelpdeskReunionById(
  ticketId: string,
  reunionId: string,
): Promise<(HelpdeskReunion & { id: string }) | null> {
  const snap = await adminDb()
    .collection(HELPDESK_TICKETS_COLLECTION)
    .doc(ticketId)
    .collection(HELPDESK_REUNIONES_SUBCOLLECTION)
    .doc(reunionId)
    .get()
  if (!snap.exists) return null
  return { id: snap.id, ...(snap.data() as HelpdeskReunion) }
}

export async function updateHelpdeskReunion(
  ticketId: string,
  reunionId: string,
  patch: Partial<HelpdeskReunion> | Record<string, unknown>,
): Promise<void> {
  await adminDb()
    .collection(HELPDESK_TICKETS_COLLECTION)
    .doc(ticketId)
    .collection(HELPDESK_REUNIONES_SUBCOLLECTION)
    .doc(reunionId)
    .update(patch)
}

export async function updateHelpdeskReunionMinuta(input: {
  ticketId: string
  reunionId: string
  autorNombre: string
  texto?: string
  minutaDiagnostico?: HelpdeskMinutaDiagnostico | null
}): Promise<void> {
  const patch: Record<string, unknown> = {}

  if (input.texto !== undefined) {
    patch.minuta = input.texto.trim()
      ? {
          texto: input.texto.trim(),
          autorNombre: input.autorNombre,
          updatedAt: FieldValue.serverTimestamp(),
        }
      : null
  }

  if (input.minutaDiagnostico !== undefined) {
    patch.minutaDiagnostico = input.minutaDiagnostico
      ? {
          ...input.minutaDiagnostico,
          autorNombre: input.autorNombre,
          updatedAt: FieldValue.serverTimestamp(),
        }
      : null
  }

  await adminDb()
    .collection(HELPDESK_TICKETS_COLLECTION)
    .doc(input.ticketId)
    .collection(HELPDESK_REUNIONES_SUBCOLLECTION)
    .doc(input.reunionId)
    .update(patch)
}

export async function createHelpdeskTicket(
  input: Omit<HelpdeskTicket, 'createdAt'>,
): Promise<string> {
  const ref = adminDb().collection(HELPDESK_TICKETS_COLLECTION).doc()
  await ref.set({
    ...input,
    createdAt: FieldValue.serverTimestamp(),
  })
  return ref.id
}

export async function getHelpdeskTicketById(
  ticketId: string,
): Promise<(HelpdeskTicket & { id: string }) | null> {
  const snap = await adminDb().collection(HELPDESK_TICKETS_COLLECTION).doc(ticketId).get()
  if (!snap.exists) return null
  return { id: snap.id, ...(snap.data() as HelpdeskTicket) }
}

export async function updateHelpdeskTicket(
  ticketId: string,
  patch: Partial<Pick<HelpdeskTicket, 'estadoIdx' | 'asignadoATeamId'>>,
): Promise<void> {
  await adminDb()
    .collection(HELPDESK_TICKETS_COLLECTION)
    .doc(ticketId)
    .update({
      ...patch,
      seguimientoUpdatedAt: FieldValue.serverTimestamp(),
    })
}

export async function updateHelpdeskTicketFields(
  ticketId: string,
  patch: Partial<HelpdeskTicket>,
): Promise<void> {
  await adminDb().collection(HELPDESK_TICKETS_COLLECTION).doc(ticketId).update(patch)
}

export async function updateHelpdeskTicketCancelacion(
  ticketId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await adminDb()
    .collection(HELPDESK_TICKETS_COLLECTION)
    .doc(ticketId)
    .update({
      ...patch,
      seguimientoUpdatedAt: FieldValue.serverTimestamp(),
    })
}

export async function listHelpdeskReunionesForTicket(
  ticketId: string,
): Promise<(HelpdeskReunion & { id: string })[]> {
  const snap = await adminDb()
    .collection(HELPDESK_TICKETS_COLLECTION)
    .doc(ticketId)
    .collection(HELPDESK_REUNIONES_SUBCOLLECTION)
    .get()
  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as HelpdeskReunion) }))
}

export async function listHelpdeskTickets(input?: {
  estadoIdx?: number
  urgencia?: HelpdeskUrgencia
}): Promise<(HelpdeskTicket & { id: string })[]> {
  let query: Query = adminDb().collection(HELPDESK_TICKETS_COLLECTION)
  if (input?.estadoIdx !== undefined) {
    query = query.where('estadoIdx', '==', input.estadoIdx)
  }
  if (input?.urgencia !== undefined) {
    query = query.where('urgencia', '==', input.urgencia)
  }
  const snap = await query.get()
  const tickets = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as HelpdeskTicket) }))
  tickets.sort((a, b) => {
    const aMs = a.createdAt?.toMillis?.() ?? 0
    const bMs = b.createdAt?.toMillis?.() ?? 0
    return bMs - aMs
  })
  return tickets
}

export async function listHelpdeskTicketsForRequester(input: {
  uid: string
  email: string
}): Promise<(HelpdeskTicket & { id: string })[]> {
  const normalizedEmail = input.email.trim().toLowerCase()
  const byUidSnap = await adminDb()
    .collection(HELPDESK_TICKETS_COLLECTION)
    .where('requesterUid', '==', input.uid)
    .get()
  const byEmailSnap = await adminDb()
    .collection(HELPDESK_TICKETS_COLLECTION)
    .where('requesterEmail', '==', normalizedEmail)
    .get()
  const byColabUidSnap = input.uid
    ? await adminDb()
        .collection(HELPDESK_TICKETS_COLLECTION)
        .where('colaboradorUids', 'array-contains', input.uid)
        .get()
    : null
  const byColabEmailSnap = await adminDb()
    .collection(HELPDESK_TICKETS_COLLECTION)
    .where('colaboradorEmails', 'array-contains', normalizedEmail)
    .get()

  const merged = new Map<string, HelpdeskTicket & { id: string }>()
  for (const doc of byUidSnap.docs) {
    merged.set(doc.id, { id: doc.id, ...(doc.data() as HelpdeskTicket) })
  }
  for (const doc of byEmailSnap.docs) {
    const ticket = doc.data() as HelpdeskTicket
    if (ticket.requesterUid == null || ticket.requesterUid === input.uid) {
      merged.set(doc.id, { id: doc.id, ...ticket })
    }
  }
  if (byColabUidSnap) {
    for (const doc of byColabUidSnap.docs) {
      merged.set(doc.id, { id: doc.id, ...(doc.data() as HelpdeskTicket) })
    }
  }
  for (const doc of byColabEmailSnap.docs) {
    merged.set(doc.id, { id: doc.id, ...(doc.data() as HelpdeskTicket) })
  }

  const tickets = [...merged.values()]
  tickets.sort((a, b) => {
    const aMs = a.createdAt?.toMillis?.() ?? 0
    const bMs = b.createdAt?.toMillis?.() ?? 0
    return bMs - aMs
  })
  return tickets
}

export async function listHelpdeskNotasForTicket(
  ticketId: string,
): Promise<(import('./types.js').HelpdeskNota & { id: string })[]> {
  const snap = await adminDb()
    .collection(HELPDESK_TICKETS_COLLECTION)
    .doc(ticketId)
    .collection(HELPDESK_NOTAS_SUBCOLLECTION)
    .orderBy('createdAt', 'desc')
    .get()
  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as import('./types.js').HelpdeskNota) }))
}

export async function createHelpdeskTicketNota(input: {
  ticketId: string
  autorNombre: string
  texto: string
}): Promise<string> {
  const ref = adminDb()
    .collection(HELPDESK_TICKETS_COLLECTION)
    .doc(input.ticketId)
    .collection(HELPDESK_NOTAS_SUBCOLLECTION)
    .doc()
  await ref.set({
    autorNombre: input.autorNombre.trim(),
    texto: input.texto.trim(),
    createdAt: FieldValue.serverTimestamp(),
  })
  return ref.id
}

export async function appendHelpdeskEmailLog(input: {
  tipo: HelpdeskEmailLogTipo
  destinatarios: string[]
  area?: string | null
  areaId?: string | null
  ticketId?: string | null
  respondido?: boolean | null
  fechaRespuesta?: Timestamp | null
  fecha?: Timestamp
  source?: HelpdeskEmailLog['source']
}): Promise<string> {
  const ref = adminDb().collection(HELPDESK_EMAIL_LOG_COLLECTION).doc()
  const doc: HelpdeskEmailLog = {
    fecha: input.fecha ?? Timestamp.now(),
    tipo: input.tipo,
    destinatarios: input.destinatarios.map((e) => e.trim().toLowerCase()),
    area: input.area ?? null,
    areaId: input.areaId ?? null,
    ticketId: input.ticketId ?? null,
    respondido: input.respondido ?? null,
    fechaRespuesta: input.fechaRespuesta ?? null,
    source: input.source ?? null,
  }
  await ref.set(doc)
  return ref.id
}

export function isValidHelpdeskUrgencia(value: unknown): value is HelpdeskUrgencia {
  return value === 'baja' || value === 'media' || value === 'alta'
}
