import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { saldoDeltaPorMovimiento } from '../domain/cierre.calculo.js'
import type {
  CajaCierreDocument,
  CajaDocument,
  CajaMovimientoDocument,
  CajaMoneda,
  CajaTipo,
  HistorialCustodiaDocument,
} from '../domain/caja.types.js'

export const CAJAS_COLLECTION = 'cajas'
export const MOVIMIENTOS_COLLECTION = 'cajaMovimientos'
export const CIERRES_COLLECTION = 'cajaCierres'
const CUSTODIA_SUB = 'historialCustodia'

export function timestampFromDate(date: Date): Timestamp {
  return Timestamp.fromDate(date)
}

export function parseDateInput(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const d = new Date(value.trim())
  return Number.isNaN(d.getTime()) ? undefined : d
}

export async function listCajasDocs(): Promise<Array<{ id: string; data: CajaDocument }>> {
  const snap = await adminDb().collection(CAJAS_COLLECTION).get()
  return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as CajaDocument }))
}

export async function listCajaResponsableOptions(): Promise<
  Array<{ uid: string; displayName: string | null; email: string; role: string | null }>
> {
  const snap = await adminDb().collection('users').get()
  return snap.docs
    .map((doc) => {
      const data = doc.data()
      return {
        uid: doc.id,
        displayName:
          typeof data.displayName === 'string' && data.displayName.trim()
            ? data.displayName.trim()
            : null,
        email: typeof data.email === 'string' ? data.email : '',
        role: typeof data.role === 'string' ? data.role : null,
        active: data.accountStatus !== 'disabled',
      }
    })
    .filter((user) => user.active && user.email)
    .map(({ active: _active, ...user }) => user)
    .sort((a, b) =>
      (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email, 'es'),
    )
}

export async function getCajaDoc(cajaId: string): Promise<CajaDocument | null> {
  const snap = await adminDb().collection(CAJAS_COLLECTION).doc(cajaId).get()
  if (!snap.exists) return null
  return snap.data() as CajaDocument
}

export async function countPrincipalesByMoneda(moneda: CajaMoneda): Promise<number> {
  const snap = await adminDb()
    .collection(CAJAS_COLLECTION)
    .where('tipo', '==', 'principal')
    .where('moneda', '==', moneda)
    .get()
  return snap.docs.filter((doc) => {
    const estado = (doc.data() as CajaDocument).estado
    return estado !== 'inactiva'
  }).length
}

export async function createCajaDoc(input: {
  id: string
  nombre: string
  tipo: CajaTipo
  moneda: CajaMoneda
  cajaPadreId: string | null
  responsableUid: string
  createdBy: string
}): Promise<void> {
  const ref = adminDb().collection(CAJAS_COLLECTION).doc(input.id)
  const now = FieldValue.serverTimestamp()

  if (input.tipo === 'principal') {
    const n = await countPrincipalesByMoneda(input.moneda)
    if (n > 0) throw new Error(`Ya existe una caja principal en ${input.moneda}`)
  } else {
    if (!input.cajaPadreId) throw new Error('cajaPadreId es obligatorio para cajas chicas')
    const padre = await getCajaDoc(input.cajaPadreId)
    if (!padre) throw new Error('Caja principal padre no encontrada')
    if (padre.tipo !== 'principal') throw new Error('cajaPadreId debe ser una caja principal')
    if (padre.estado === 'inactiva') throw new Error('La caja principal padre está inactiva')
    if (padre.moneda !== input.moneda) {
      throw new Error('La caja chica debe usar la misma moneda que su principal')
    }
  }

  await adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref)
    if (existing.exists) throw new Error('La caja ya existe')

    tx.set(ref, {
      nombre: input.nombre,
      tipo: input.tipo,
      moneda: input.moneda,
      cajaPadreId: input.tipo === 'principal' ? null : input.cajaPadreId,
      responsableUid: input.responsableUid,
      saldoActualCentavos: 0,
      estado: 'activa',
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
    })

    tx.set(ref.collection(CUSTODIA_SUB).doc(), {
      responsableAnteriorUid: null,
      responsableNuevoUid: input.responsableUid,
      fecha: now,
      motivo: input.tipo === 'principal' ? 'Alta caja principal' : 'Alta caja chica',
      registradoPor: input.createdBy,
    })
  })
}

export async function softDeleteCajaDoc(cajaId: string): Promise<void> {
  const ref = adminDb().collection(CAJAS_COLLECTION).doc(cajaId)
  await ref.update({
    estado: 'inactiva',
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function renameCajaDoc(cajaId: string, nombre: string): Promise<void> {
  await adminDb().collection(CAJAS_COLLECTION).doc(cajaId).update({
    nombre,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function cajaHasCierrePendienteAprobacion(cajaId: string): Promise<boolean> {
  const snap = await adminDb()
    .collection(CIERRES_COLLECTION)
    .where('cajaId', '==', cajaId)
    .where('estado', '==', 'cerrada')
    .limit(1)
    .get()
  return !snap.empty
}

export async function listCierresPendientesDocs(): Promise<
  Array<{ id: string; data: CajaCierreDocument }>
> {
  const snap = await adminDb()
    .collection(CIERRES_COLLECTION)
    .where('estado', '==', 'cerrada')
    .get()
  const rows = snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as CajaCierreDocument }))
  rows.sort(
    (a, b) => (b.data.periodoHasta?.toMillis?.() ?? 0) - (a.data.periodoHasta?.toMillis?.() ?? 0),
  )
  return rows
}

export async function reassignCajaResponsable(input: {
  cajaId: string
  responsableNuevoUid: string
  motivo: string | null
  registradoPor: string
}): Promise<void> {
  const ref = adminDb().collection(CAJAS_COLLECTION).doc(input.cajaId)
  const now = FieldValue.serverTimestamp()

  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new Error('Caja no encontrada')
    const data = snap.data() as CajaDocument
    const anterior = data.responsableUid
    if (anterior === input.responsableNuevoUid) {
      throw new Error('El responsable ya es el mismo')
    }

    tx.update(ref, {
      responsableUid: input.responsableNuevoUid,
      updatedAt: now,
    })

    tx.set(ref.collection(CUSTODIA_SUB).doc(), {
      responsableAnteriorUid: anterior,
      responsableNuevoUid: input.responsableNuevoUid,
      fecha: now,
      motivo: input.motivo,
      registradoPor: input.registradoPor,
    })
  })
}

/** El libro no se purga: no hay delete de cajaMovimientos (retención ≥ 2 años). */
export async function listMovimientosForCaja(
  cajaId: string,
): Promise<Array<{ id: string; data: CajaMovimientoDocument }>> {
  const snap = await adminDb()
    .collection(MOVIMIENTOS_COLLECTION)
    .where('cajaId', '==', cajaId)
    .get()
  const rows = snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as CajaMovimientoDocument }))
  rows.sort((a, b) => {
    const ta = a.data.fecha?.toMillis?.() ?? 0
    const tb = b.data.fecha?.toMillis?.() ?? 0
    return tb - ta
  })
  return rows
}

export async function createMovimientoWithSaldo(input: {
  movimientoId: string
  doc: Omit<CajaMovimientoDocument, 'createdAt'>
}): Promise<void> {
  const cajaRef = adminDb().collection(CAJAS_COLLECTION).doc(input.doc.cajaId)
  const movRef = adminDb().collection(MOVIMIENTOS_COLLECTION).doc(input.movimientoId)
  const now = FieldValue.serverTimestamp()
  const delta = saldoDeltaPorMovimiento(input.doc.tipo) * input.doc.montoCentavos

  await adminDb().runTransaction(async (tx) => {
    const cajaSnap = await tx.get(cajaRef)
    if (!cajaSnap.exists) throw new Error('Caja no encontrada')
    const caja = cajaSnap.data() as CajaDocument
    const nuevoSaldo = caja.saldoActualCentavos + delta
    if (nuevoSaldo < 0) {
      throw new Error('El saldo de la caja no puede quedar negativo')
    }

    tx.set(movRef, {
      ...input.doc,
      createdAt: now,
    })

    tx.update(cajaRef, {
      saldoActualCentavos: nuevoSaldo,
      updatedAt: now,
    })
  })
}

export async function ejecutarFondeoAtomico(input: {
  principalId: string
  chicaId: string
  montoCentavos: number
  concepto: string
  registradoPor: string
  fondeoVinculadoId: string
  movimientoEnviadoId: string
  movimientoRecibidoId: string
  fecha: Timestamp
}): Promise<void> {
  const principalRef = adminDb().collection(CAJAS_COLLECTION).doc(input.principalId)
  const chicaRef = adminDb().collection(CAJAS_COLLECTION).doc(input.chicaId)
  const movEnvRef = adminDb().collection(MOVIMIENTOS_COLLECTION).doc(input.movimientoEnviadoId)
  const movRecRef = adminDb().collection(MOVIMIENTOS_COLLECTION).doc(input.movimientoRecibidoId)
  const now = FieldValue.serverTimestamp()

  await adminDb().runTransaction(async (tx) => {
    const [principalSnap, chicaSnap] = await Promise.all([tx.get(principalRef), tx.get(chicaRef)])
    if (!principalSnap.exists || !chicaSnap.exists) throw new Error('Caja no encontrada')
    const principal = principalSnap.data() as CajaDocument
    const chica = chicaSnap.data() as CajaDocument

    if (principal.tipo !== 'principal' || chica.tipo !== 'chica') {
      throw new Error('Fondeo solo de principal hacia chica')
    }
    if (principal.estado === 'inactiva' || chica.estado === 'inactiva') {
      throw new Error('No se puede fondear una caja inactiva')
    }
    if (chica.cajaPadreId !== input.principalId) {
      throw new Error('La caja chica no depende de esa principal')
    }
    if (principal.moneda !== chica.moneda) {
      throw new Error('Principal y chica deben compartir moneda')
    }

    const saldoPrincipal = principal.saldoActualCentavos - input.montoCentavos
    const saldoChica = chica.saldoActualCentavos + input.montoCentavos
    if (saldoPrincipal < 0) throw new Error('Saldo insuficiente en la caja principal')

    const base = {
      concepto: input.concepto,
      montoCentavos: input.montoCentavos,
      fecha: input.fecha,
      comprobanteStoragePath: null,
      categoria: 'fondeo',
      esViatico: false,
      beneficiarioEmpleado: null,
      fondeoVinculadoId: input.fondeoVinculadoId,
      operacionVinculadaId: input.fondeoVinculadoId,
      cotizacionCentavosPorUsd: null,
      registradoPor: input.registradoPor,
      createdAt: now,
    }

    tx.set(movEnvRef, {
      ...base,
      cajaId: input.principalId,
      tipo: 'fondeo_enviado',
    })
    tx.set(movRecRef, {
      ...base,
      cajaId: input.chicaId,
      tipo: 'fondeo_recibido',
    })

    tx.update(principalRef, { saldoActualCentavos: saldoPrincipal, updatedAt: now })
    tx.update(chicaRef, { saldoActualCentavos: saldoChica, updatedAt: now })
  })
}

export async function ejecutarCompraUsdAtomica(input: {
  cajaArsId: string
  cajaUsdId: string
  montoPesosCentavos: number
  montoUsdCentavos: number
  cotizacionCentavosPorUsd: number
  concepto: string
  comprobanteStoragePath: string | null
  registradoPor: string
  operacionVinculadaId: string
  movimientoArsId: string
  movimientoUsdId: string
  fecha: Timestamp
}): Promise<void> {
  if (
    !Number.isSafeInteger(input.montoPesosCentavos) ||
    input.montoPesosCentavos <= 0 ||
    !Number.isSafeInteger(input.montoUsdCentavos) ||
    input.montoUsdCentavos <= 0 ||
    !Number.isSafeInteger(input.cotizacionCentavosPorUsd) ||
    input.cotizacionCentavosPorUsd <= 0
  ) {
    throw new Error('Importes inválidos para la compra de USD')
  }
  const montoPesosEsperado = Math.round(
    (input.cotizacionCentavosPorUsd * input.montoUsdCentavos) / 100,
  )
  if (montoPesosEsperado !== input.montoPesosCentavos) {
    throw new Error('El monto ARS no coincide con la cotización y los USD')
  }

  const cajaArsRef = adminDb().collection(CAJAS_COLLECTION).doc(input.cajaArsId)
  const cajaUsdRef = adminDb().collection(CAJAS_COLLECTION).doc(input.cajaUsdId)
  const movArsRef = adminDb().collection(MOVIMIENTOS_COLLECTION).doc(input.movimientoArsId)
  const movUsdRef = adminDb().collection(MOVIMIENTOS_COLLECTION).doc(input.movimientoUsdId)
  const now = FieldValue.serverTimestamp()

  await adminDb().runTransaction(async (tx) => {
    const [arsSnap, usdSnap] = await Promise.all([tx.get(cajaArsRef), tx.get(cajaUsdRef)])
    if (!arsSnap.exists || !usdSnap.exists) throw new Error('Caja principal no encontrada')
    const cajaArs = arsSnap.data() as CajaDocument
    const cajaUsd = usdSnap.data() as CajaDocument

    if (cajaArs.tipo !== 'principal' || cajaArs.moneda !== 'ARS') {
      throw new Error('La compra de USD debe salir de una caja principal ARS')
    }
    if (cajaUsd.tipo !== 'principal' || cajaUsd.moneda !== 'USD') {
      throw new Error('No se encontró una caja principal USD válida')
    }
    if (cajaArs.estado === 'inactiva' || cajaUsd.estado === 'inactiva') {
      throw new Error('No se puede operar con una caja inactiva')
    }

    const nuevoSaldoArs = cajaArs.saldoActualCentavos - input.montoPesosCentavos
    if (nuevoSaldoArs < 0) throw new Error('Saldo insuficiente en la caja principal ARS')
    const nuevoSaldoUsd = cajaUsd.saldoActualCentavos + input.montoUsdCentavos

    const base = {
      fecha: input.fecha,
      categoria: 'compra_usd',
      esViatico: false,
      beneficiarioEmpleado: null,
      fondeoVinculadoId: null,
      operacionVinculadaId: input.operacionVinculadaId,
      cotizacionCentavosPorUsd: input.cotizacionCentavosPorUsd,
      registradoPor: input.registradoPor,
      createdAt: now,
    }

    tx.set(movArsRef, {
      ...base,
      cajaId: input.cajaArsId,
      tipo: 'egreso',
      concepto: input.concepto,
      montoCentavos: input.montoPesosCentavos,
      comprobanteStoragePath: input.comprobanteStoragePath,
    })
    tx.set(movUsdRef, {
      ...base,
      cajaId: input.cajaUsdId,
      tipo: 'ingreso',
      concepto: `${input.concepto} · ${input.montoUsdCentavos / 100} USD`,
      montoCentavos: input.montoUsdCentavos,
      comprobanteStoragePath: null,
    })

    tx.update(cajaArsRef, { saldoActualCentavos: nuevoSaldoArs, updatedAt: now })
    tx.update(cajaUsdRef, { saldoActualCentavos: nuevoSaldoUsd, updatedAt: now })
  })
}

export async function listCierresForCaja(
  cajaId: string,
): Promise<Array<{ id: string; data: CajaCierreDocument }>> {
  const snap = await adminDb().collection(CIERRES_COLLECTION).where('cajaId', '==', cajaId).get()
  const rows = snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as CajaCierreDocument }))
  rows.sort((a, b) => (b.data.periodoHasta?.toMillis?.() ?? 0) - (a.data.periodoHasta?.toMillis?.() ?? 0))
  return rows
}

export async function getCierreDoc(
  cierreId: string,
): Promise<{ id: string; data: CajaCierreDocument } | null> {
  const snap = await adminDb().collection(CIERRES_COLLECTION).doc(cierreId).get()
  if (!snap.exists) return null
  return { id: snap.id, data: snap.data() as CajaCierreDocument }
}

export async function saveCierreDoc(
  cierreId: string,
  doc: Omit<CajaCierreDocument, 'createdAt'>,
): Promise<void> {
  const ref = adminDb().collection(CIERRES_COLLECTION).doc(cierreId)
  const now = FieldValue.serverTimestamp()
  await ref.set({
    ...doc,
    createdAt: now,
  })
}

export async function updateCierreDoc(
  cierreId: string,
  patch: Partial<CajaCierreDocument>,
): Promise<void> {
  await adminDb().collection(CIERRES_COLLECTION).doc(cierreId).update(patch)
}

export async function userIsResponsableOfAnyCaja(uid: string): Promise<boolean> {
  const snap = await adminDb()
    .collection(CAJAS_COLLECTION)
    .where('responsableUid', '==', uid)
    .limit(1)
    .get()
  return !snap.empty
}

export async function userIsResponsableOfPrincipal(uid: string): Promise<boolean> {
  const snap = await adminDb()
    .collection(CAJAS_COLLECTION)
    .where('responsableUid', '==', uid)
    .where('tipo', '==', 'principal')
    .get()
  return snap.docs.some((doc) => (doc.data() as CajaDocument).estado !== 'inactiva')
}
