import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { buildAgendaHistorialEntry } from '../domain/agenda.historial.js'
import type { PrioridadUrgencia } from '../domain/agenda.prioridad.js'
import type {
  CobroEsperadoDocument,
  CompromisoPagoDocument,
  HistorialEstadoDocument,
  MedioPago,
} from '../domain/agenda.types.js'

export const COMPROMISOS_COLLECTION = 'compromisosPago'
export const COBROS_COLLECTION = 'cobrosEsperados'
const HISTORIAL_SUB = 'historialEstados'

export function parseDateInput(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const d = new Date(value.trim())
  return Number.isNaN(d.getTime()) ? undefined : d
}

export function timestampFromDate(date: Date): Timestamp {
  return Timestamp.fromDate(date)
}

function defaultCompromisoFields(): Pick<
  CompromisoPagoDocument,
  | 'cuentaId'
  | 'fechaPago'
  | 'pagadoPor'
  | 'prioridad'
  | 'urgenciaManual'
  | 'esViatico'
  | 'beneficiarioEmpleado'
  | 'transferenciaConfeccionadaId'
> {
  return {
    cuentaId: null,
    fechaPago: null,
    pagadoPor: null,
    prioridad: 0,
    urgenciaManual: null,
    esViatico: false,
    beneficiarioEmpleado: null,
    transferenciaConfeccionadaId: null,
  }
}

function defaultCobroFields(): Pick<
  CobroEsperadoDocument,
  'cuentaId' | 'fechaConfirmado' | 'confirmadoPor' | 'prioridad' | 'urgenciaManual'
> {
  return { cuentaId: null, fechaConfirmado: null, confirmadoPor: null, prioridad: 0, urgenciaManual: null }
}

export async function appendCompromisoHistorial(input: {
  compromisoId: string
  historial: ReturnType<typeof buildAgendaHistorialEntry>
  patch: Partial<CompromisoPagoDocument>
}): Promise<void> {
  const ref = adminDb().collection(COMPROMISOS_COLLECTION).doc(input.compromisoId)
  const now = FieldValue.serverTimestamp()

  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new Error('Compromiso no encontrado')

    const historialRef = ref.collection(HISTORIAL_SUB).doc()
    tx.set(historialRef, {
      ...input.historial,
      fecha: now,
    })

    tx.update(ref, {
      ...input.patch,
      updatedAt: now,
    })
  })
}

export async function appendCobroHistorial(input: {
  cobroId: string
  historial: ReturnType<typeof buildAgendaHistorialEntry>
  patch: Partial<CobroEsperadoDocument>
}): Promise<void> {
  const ref = adminDb().collection(COBROS_COLLECTION).doc(input.cobroId)
  const now = FieldValue.serverTimestamp()

  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new Error('Cobro no encontrado')

    const historialRef = ref.collection(HISTORIAL_SUB).doc()
    tx.set(historialRef, {
      ...input.historial,
      fecha: now,
    })

    tx.update(ref, {
      ...input.patch,
      updatedAt: now,
    })
  })
}

export async function createCompromisoWithHistorial(input: {
  id: string
  doc: Omit<CompromisoPagoDocument, 'createdAt' | 'updatedAt' | 'cuentaId' | 'fechaPago' | 'pagadoPor'>
  usuario: string
  nota: string | null
}): Promise<void> {
  const ref = adminDb().collection(COMPROMISOS_COLLECTION).doc(input.id)
  const now = FieldValue.serverTimestamp()
  const historial = buildAgendaHistorialEntry({
    estadoAnterior: null,
    estadoNuevo: input.doc.estado,
    usuario: input.usuario,
    nota: input.nota ?? 'Alta de compromiso de pago',
  })

  await adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref)
    if (existing.exists) throw new Error('Compromiso ya existe')

    tx.set(ref, {
      ...defaultCompromisoFields(),
      ...input.doc,
      createdAt: now,
      updatedAt: now,
    })

    tx.set(ref.collection(HISTORIAL_SUB).doc(), {
      ...historial,
      fecha: now,
    })
  })
}

export async function createCobroWithHistorial(input: {
  id: string
  doc: Omit<
    CobroEsperadoDocument,
    'createdAt' | 'updatedAt' | 'cuentaId' | 'fechaConfirmado' | 'confirmadoPor'
  >
  usuario: string
  nota: string | null
}): Promise<void> {
  const ref = adminDb().collection(COBROS_COLLECTION).doc(input.id)
  const now = FieldValue.serverTimestamp()
  const historial = buildAgendaHistorialEntry({
    estadoAnterior: null,
    estadoNuevo: input.doc.estado,
    usuario: input.usuario,
    nota: input.nota ?? 'Alta de cobro esperado',
  })

  await adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref)
    if (existing.exists) throw new Error('Cobro ya existe')

    tx.set(ref, {
      ...defaultCobroFields(),
      ...input.doc,
      createdAt: now,
      updatedAt: now,
    })

    tx.set(ref.collection(HISTORIAL_SUB).doc(), {
      ...historial,
      fecha: now,
    })
  })
}

export async function getCompromisoDocument(id: string): Promise<CompromisoPagoDocument | null> {
  const snap = await adminDb().collection(COMPROMISOS_COLLECTION).doc(id).get()
  if (!snap.exists) return null
  return snap.data() as CompromisoPagoDocument
}

export async function getCobroDocument(id: string): Promise<CobroEsperadoDocument | null> {
  const snap = await adminDb().collection(COBROS_COLLECTION).doc(id).get()
  if (!snap.exists) return null
  return snap.data() as CobroEsperadoDocument
}

export async function listAllCompromisos(): Promise<Array<{ id: string; data: CompromisoPagoDocument }>> {
  const snap = await adminDb().collection(COMPROMISOS_COLLECTION).get()
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as CompromisoPagoDocument }))
}

export async function listAllCobros(): Promise<Array<{ id: string; data: CobroEsperadoDocument }>> {
  const snap = await adminDb().collection(COBROS_COLLECTION).get()
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as CobroEsperadoDocument }))
}

export async function listCompromisoHistorial(compromisoId: string) {
  const snap = await adminDb()
    .collection(COMPROMISOS_COLLECTION)
    .doc(compromisoId)
    .collection(HISTORIAL_SUB)
    .orderBy('fecha', 'desc')
    .get()
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as HistorialEstadoDocument }))
}

export async function listCobroHistorial(cobroId: string) {
  const snap = await adminDb()
    .collection(COBROS_COLLECTION)
    .doc(cobroId)
    .collection(HISTORIAL_SUB)
    .orderBy('fecha', 'desc')
    .get()
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as HistorialEstadoDocument }))
}

export async function updateCompromisoUrgencia(
  compromisoId: string,
  urgenciaManual: PrioridadUrgencia | null,
): Promise<void> {
  await adminDb().collection(COMPROMISOS_COLLECTION).doc(compromisoId).update({
    urgenciaManual,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function updateCobroUrgencia(
  cobroId: string,
  urgenciaManual: PrioridadUrgencia | null,
): Promise<void> {
  await adminDb().collection(COBROS_COLLECTION).doc(cobroId).update({
    urgenciaManual,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function linkChequeToCompromiso(input: {
  compromisoId: string
  chequeId: string
}): Promise<void> {
  const ref = adminDb().collection(COMPROMISOS_COLLECTION).doc(input.compromisoId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Compromiso de pago no encontrado')
  await ref.update({
    chequeId: input.chequeId,
    medioPago: 'cheque' satisfies MedioPago,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function linkChequeToCobro(input: {
  cobroId: string
  chequeId: string
}): Promise<void> {
  const ref = adminDb().collection(COBROS_COLLECTION).doc(input.cobroId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Cobro esperado no encontrado')
  await ref.update({
    chequeId: input.chequeId,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function getCompromisoResumen(compromisoId: string) {
  const snap = await adminDb().collection(COMPROMISOS_COLLECTION).doc(compromisoId).get()
  if (!snap.exists) return null
  const d = snap.data() as CompromisoPagoDocument
  return { id: snap.id, concepto: d.concepto, proveedorONombre: d.proveedorONombre }
}

export async function getCobroResumen(cobroId: string) {
  const snap = await adminDb().collection(COBROS_COLLECTION).doc(cobroId).get()
  if (!snap.exists) return null
  const d = snap.data() as CobroEsperadoDocument
  return { id: snap.id, clienteONombre: d.clienteONombre }
}

/** Compat Fase 2 — selects en alta de cheque. */
export async function listCompromisosPendientes(): Promise<
  Array<{ id: string; concepto: string; proveedorONombre: string }>
> {
  const rows = await listAllCompromisos()
  return rows
    .filter(({ data }) => data.estado === 'pendiente' || data.estado === 'vencido')
    // confeccionada_pendiente_autorizacion no se ofrece para nuevos cheques
    .slice(0, 100)
    .map(({ id, data }) => ({
      id,
      concepto: data.concepto,
      proveedorONombre: data.proveedorONombre,
    }))
}

export async function listCobrosEsperadosSelect(): Promise<Array<{ id: string; clienteONombre: string }>> {
  const rows = await listAllCobros()
  return rows
    .filter(({ data }) => data.estado === 'esperado')
    .slice(0, 100)
    .map(({ id, data }) => ({ id, clienteONombre: data.clienteONombre }))
}
