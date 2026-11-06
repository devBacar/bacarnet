/**
 * Cobros confirmados por el banco (crédito real, cada 30 min) antes de que Vientri traiga su propia
 * `aplicaciones.csv` (una vez por día). Guarda el vínculo movimiento↔factura; el tablero de Cobros
 * los combina con los reales de Vientri, descartando el provisorio si Vientri ya confirmó esa misma
 * factura (ver `cargarCobrosDelPeriodo` en cobros-tablero.repository.ts).
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { movimientosBancariosCollection } from '../../movimientos/services/movimientos.repository.js'
import type { MovimientoBancarioDocument } from '../../movimientos/domain/movimiento-bancario.types.js'
import type { VientriPendienteDoc } from '../../vientri/domain/tipos.js'

export const COBROS_BANCARIOS_COLLECTION = 'cobrosBancariosReconciliados'

export interface CobroBancarioDoc {
  movimientoBancarioId: string
  cuentaId: string
  fechaCobro: string
  idCmpFactura: number
  comprobante: string
  personaVientriId: number | null
  personaNombre: string
  montoCentavos: number
  moneda: 'ARS'
}

function col() {
  return adminDb().collection(COBROS_BANCARIOS_COLLECTION)
}

/** Créditos del banco todavía sin explicar por transferencia, cheque, ni un cobro ya reconciliado. */
export async function listCreditosSinReservar(
  desde: string,
): Promise<{ id: string; data: MovimientoBancarioDocument }[]> {
  const snap = await movimientosBancariosCollection()
    .where('tipo', '==', 'credito')
    .where('fechaProceso', '>=', desde)
    .get()
  const salida: { id: string; data: MovimientoBancarioDocument }[] = []
  for (const doc of snap.docs) {
    const data = doc.data() as MovimientoBancarioDocument
    if (data.reservadoPorTransferenciaId) continue
    if (data.reservadoPorChequeId) continue
    if (data.reservadoPorCobroId) continue
    salida.push({ id: doc.id, data })
  }
  return salida
}

/**
 * Vincula un movimiento con la factura que cubrió. El doc de este vínculo usa el id del movimiento
 * como id propio: no puede haber dos vínculos del mismo movimiento, y una transacción evita que dos
 * corridas concurrentes lo vinculen dos veces.
 */
export async function vincularCobroConMovimiento(input: {
  movimientoId: string
  pendiente: VientriPendienteDoc
}): Promise<boolean> {
  const movRef = movimientosBancariosCollection().doc(input.movimientoId)
  const vinculoRef = col().doc(input.movimientoId)
  return adminDb().runTransaction(async (tx) => {
    const mov = await tx.get(movRef)
    if (!mov.exists) return false
    const data = mov.data() as MovimientoBancarioDocument
    if (data.reservadoPorCobroId) return false
    tx.set(vinculoRef, {
      movimientoBancarioId: input.movimientoId,
      cuentaId: data.cuentaId,
      fechaCobro: data.fechaProceso,
      idCmpFactura: input.pendiente.vientriId,
      comprobante: input.pendiente.comprobante,
      personaVientriId: input.pendiente.persona?.vientriId ?? null,
      personaNombre: input.pendiente.persona?.nombre ?? 'Sin nombre',
      montoCentavos: input.pendiente.pendienteCentavos,
      moneda: 'ARS',
      creadoEn: FieldValue.serverTimestamp(),
    })
    tx.update(movRef, { reservadoPorCobroId: input.movimientoId })
    return true
  })
}

export async function listCobrosBancariosEnRango(desde: string, hasta: string): Promise<CobroBancarioDoc[]> {
  const snap = await col().where('fechaCobro', '>=', desde).where('fechaCobro', '<=', hasta).get()
  return snap.docs.map((d) => d.data() as CobroBancarioDoc)
}

/**
 * Créditos de HOY que todavía no se pudieron clasificar como nada (ni cheque, ni transferencia, ni
 * factura de Vientri) — por falta de CUIT en la contraparte, por no coincidir el monto exacto con
 * ninguna pendiente, o por no ser un cobro de factura (puede ser un depósito en efectivo, un
 * intercompany, etc.). No es un error: es la plata que entró hoy y todavía no se sabe de dónde es.
 * Sirve para que el tablero avise "esto puede estar incompleto" en vez de mostrar un número en falso
 * como si fuera definitivo.
 */
export async function resumenCreditosSinClasificarHoy(hoy: string): Promise<{ cantidad: number; montoCentavos: number }> {
  const sinReservar = await listCreditosSinReservar(hoy)
  let montoCentavos = 0
  for (const { data } of sinReservar) montoCentavos += data.montoCentavos
  return { cantidad: sinReservar.length, montoCentavos }
}
