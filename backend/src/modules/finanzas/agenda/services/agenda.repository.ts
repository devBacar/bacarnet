import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { buildAgendaHistorialEntry } from '../domain/agenda.historial.js'
import type { PrioridadUrgencia } from '../domain/agenda.prioridad.js'
import { GRUPO_COMPROMISO_DEFAULT } from '../domain/grupos-compromiso.js'
import {
  decidirPagoCompromiso,
  listarPagos,
  type DecisionPago,
} from '../domain/pago-compromiso.js'
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
  | 'grupo'
  | 'moneda'
  | 'deudaTotalCentavos'
  | 'cuotaNumero'
  | 'cuotaTotal'
  | 'observacion'
  | 'pagos'
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
    grupo: GRUPO_COMPROMISO_DEFAULT,
    moneda: 'ARS',
    deudaTotalCentavos: null,
    cuotaNumero: null,
    cuotaTotal: null,
    observacion: null,
    pagos: [],
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

function timestampDiaArgentina(ymd: string): Timestamp {
  return Timestamp.fromDate(new Date(`${ymd}T12:00:00-03:00`))
}

/**
 * Anota el pago adentro de la transacción, con el documento recién leído.
 * Así dos pagos seguidos no se pisan el array.
 */
export async function commitPagoCompromiso(input: {
  compromisoId: string
  usuario: string
  nota: string | null
  pago: {
    fecha: string
    montoSolicitado: number | null
    medio: MedioPago
    referenciaId: string | null
    registradoPor: string
  }
  cuentaId: string | null
  chequeId: string | null
  aplicarCuenta: boolean
}): Promise<DecisionPago> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.pago.fecha)) throw new Error('Elegí el día')
  const ref = adminDb().collection(COMPROMISOS_COLLECTION).doc(input.compromisoId)
  const now = FieldValue.serverTimestamp()
  const registradoAt = Timestamp.now()

  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new Error('Compromiso no encontrado')
    const data = snap.data() as CompromisoPagoDocument
    const decision = decidirPagoCompromiso(
      {
        estado: data.estado,
        montoCentavos: data.montoCentavos,
        pagos: listarPagos(data.pagos),
      },
      { ...input.pago, registradoAt },
    )
    if (decision.tipo === 'ya_pagado') return decision

    const historial = buildAgendaHistorialEntry({
      estadoAnterior: data.estado,
      estadoNuevo: decision.estado,
      usuario: input.usuario,
      nota: input.nota,
    })
    tx.set(ref.collection(HISTORIAL_SUB).doc(), { ...historial, fecha: now })
    tx.update(ref, {
      medioPago: input.pago.medio,
      pagos: decision.pagos,
      estado: decision.estado,
      ...(input.aplicarCuenta ? { cuentaId: input.cuentaId } : {}),
      ...(input.chequeId ? { chequeId: input.chequeId } : {}),
      ...(decision.completo
        ? { fechaPago: timestampDiaArgentina(input.pago.fecha), pagadoPor: input.pago.registradoPor }
        : {}),
      updatedAt: now,
    })
    return decision
  })
}

export async function listCobrosEsperadosSelect(): Promise<Array<{ id: string; clienteONombre: string }>> {
  const rows = await listAllCobros()
  return rows
    .filter(({ data }) => data.estado === 'esperado')
    .slice(0, 100)
    .map(({ id, data }) => ({ id, clienteONombre: data.clienteONombre }))
}
