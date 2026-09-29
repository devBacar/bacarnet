import { FieldValue, type Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { bancoNombreDesdeCbu } from '../domain/banco-por-cbu.js'
import type { DestinatarioTipo } from '../domain/destinatarios.rules.js'
import { siguienteUsoDestinatario } from '../domain/destinatarios.rules.js'

export const DESTINATARIOS_COLLECTION = 'finanzasDestinatarios'

export interface DestinatarioDocument {
  nombre: string
  cbu: string
  cuit: string | null
  alias: string | null
  bancoNombre: string | null
  tipo: DestinatarioTipo
  usos: number
  ultimoUsoAt: Timestamp
  createdAt: Timestamp
  createdBy: string
}

export class DestinatarioDuplicadoError extends Error {
  constructor() {
    super('Ese CBU ya está en la agenda')
    this.name = 'DestinatarioDuplicadoError'
  }
}

function destinatariosCollection() {
  return adminDb().collection(DESTINATARIOS_COLLECTION)
}

export async function listDestinatarioDocuments(): Promise<
  Array<{ id: string; data: DestinatarioDocument }>
> {
  const snap = await destinatariosCollection().get()
  return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as DestinatarioDocument }))
}

export async function getDestinatarioDocument(
  id: string,
): Promise<{ id: string; data: DestinatarioDocument } | null> {
  const snap = await destinatariosCollection().doc(id).get()
  if (!snap.exists) return null
  return { id: snap.id, data: snap.data() as DestinatarioDocument }
}

export async function createDestinatarioDocument(input: {
  cbu: string
  nombre: string
  cuit: string | null
  alias: string | null
  bancoNombre: string | null
  tipo: DestinatarioTipo
  actorUid: string
}): Promise<void> {
  const ref = destinatariosCollection().doc(input.cbu)
  const now = FieldValue.serverTimestamp()
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (snap.exists) throw new DestinatarioDuplicadoError()
    tx.set(ref, {
      nombre: input.nombre,
      cbu: input.cbu,
      cuit: input.cuit,
      alias: input.alias,
      bancoNombre: input.bancoNombre,
      tipo: input.tipo,
      usos: 0,
      ultimoUsoAt: now,
      createdAt: now,
      createdBy: input.actorUid,
    })
  })
}

export async function updateDestinatarioDocument(
  id: string,
  patch: Partial<Pick<DestinatarioDocument, 'nombre' | 'alias' | 'cuit' | 'tipo'>>,
): Promise<void> {
  const ref = destinatariosCollection().doc(id)
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new Error('Destinatario no encontrado')
    tx.update(ref, patch)
  })
}

export async function deleteDestinatarioDocument(id: string): Promise<void> {
  const ref = destinatariosCollection().doc(id)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Destinatario no encontrado')
  await ref.delete()
}

export async function registrarUsoDestinatarioDocument(input: {
  nombre: string
  cbu: string
  cuit: string | null
  tipo: DestinatarioTipo
  actorUid: string
}): Promise<'alta' | 'suma'> {
  const ref = destinatariosCollection().doc(input.cbu)
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const now = FieldValue.serverTimestamp()
    const existing = snap.exists ? { usos: Number(snap.get('usos')) || 0 } : null
    const siguiente = siguienteUsoDestinatario(existing)
    if (siguiente.esAlta) {
      tx.set(ref, {
        nombre: input.nombre,
        cbu: input.cbu,
        cuit: input.cuit,
        alias: null,
        bancoNombre: bancoNombreDesdeCbu(input.cbu),
        tipo: input.tipo,
        usos: siguiente.usos,
        ultimoUsoAt: now,
        createdAt: now,
        createdBy: input.actorUid,
      })
      return 'alta' as const
    }
    tx.update(ref, {
      usos: siguiente.usos,
      ultimoUsoAt: now,
    })
    return 'suma' as const
  })
}
