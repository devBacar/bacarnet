import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { VIENTRI_CHEQUES_OCASIONALES } from '../../vientri/services/importar-cheques-ocasionales.js'
import type { ChequeVinculadoItem } from './cheques.repository.js'

/** Los cheques ocasionales (físicos) se concilian en su propia colección; el prefijo los distingue de `cheques`. */
export const PREFIJO_OCASIONAL = 'oca:'

export function esIdOcasional(id: string): boolean {
  return id.startsWith(PREFIJO_OCASIONAL)
}

export interface OcasionalSinVincular {
  id: string
  numero: string
  montoCentavos: number
  fechaEmision: string
  fechaPago: string
  emisor: string
  cliente: null
  destinatario: string | null
  estado: null
}

function col() {
  return adminDb().collection(VIENTRI_CHEQUES_OCASIONALES)
}

/**
 * Estado de Vientri del ocasional que sí se debita en el banco ("Pago confirmado a proveedor"). Medido contra los
 * movimientos (13/08 al 11/11/2026): el 96 % tiene su débito. Los de estado 7 se cancelan con la renovación y no
 * tienen débito propio; los pendientes todavía no se cobraron. Ninguno de esos se busca en el banco.
 */
export const ESTADO_OCASIONAL_DEBITADO = 10

/**
 * Un ocasional que se puede buscar en el banco, o null. La fecha que se usa para buscar el débito es la de conciliado
 * de Vientri (el día que el banco lo pagó), no el vencimiento: los ocasionales se cobran muchas veces tarde.
 */
export function ocasionalParaVincular(docId: string, d: Record<string, unknown>): OcasionalSinVincular | null {
  if (d.baja === true || d.movimientoBancarioId) return null
  if (d.estadoCodigo !== ESTADO_OCASIONAL_DEBITADO) return null
  if (typeof d.numeroCheque !== 'string' || !d.numeroCheque) return null
  if (typeof d.fechaConciliado !== 'string' || !d.fechaConciliado) return null
  if (typeof d.montoCentavos !== 'number') return null
  return {
    id: `${PREFIJO_OCASIONAL}${docId}`,
    numero: d.numeroCheque,
    montoCentavos: d.montoCentavos,
    fechaEmision: typeof d.fechaEmision === 'string' ? d.fechaEmision : '',
    fechaPago: d.fechaConciliado,
    emisor: '',
    cliente: null,
    destinatario: typeof d.beneficiario === 'string' ? d.beneficiario : null,
    estado: null,
  }
}

export async function listOcasionalesSinVincular(): Promise<OcasionalSinVincular[]> {
  const snap = await col().get()
  const items: OcasionalSinVincular[] = []
  for (const doc of snap.docs) {
    const item = ocasionalParaVincular(doc.id, doc.data())
    if (item) items.push(item)
  }
  return items
}

export async function listOcasionalesVinculados(): Promise<ChequeVinculadoItem[]> {
  const snap = await col().get()
  const items: ChequeVinculadoItem[] = []
  for (const doc of snap.docs) {
    const d = doc.data()
    if (d.baja === true || !d.movimientoBancarioId || typeof d.movimientoFecha !== 'string') continue
    if (typeof d.numeroCheque !== 'string' || typeof d.fechaVencimiento !== 'string') continue
    items.push({
      id: `${PREFIJO_OCASIONAL}${doc.id}`,
      numero: d.numeroCheque,
      montoCentavos: typeof d.montoCentavos === 'number' ? d.montoCentavos : 0,
      fechaPago: d.fechaVencimiento,
      movimientoBancarioId: String(d.movimientoBancarioId),
      movimientoCuentaId: String(d.movimientoCuentaId ?? ''),
      movimientoFecha: d.movimientoFecha,
    })
  }
  return items
}

export async function vincularOcasionalConMovimiento(input: {
  id: string
  movimientoBancarioId: string
  movimientoCuentaId: string
  movimientoFecha: string
}): Promise<void> {
  await col()
    .doc(input.id.slice(PREFIJO_OCASIONAL.length))
    .update({
      movimientoBancarioId: input.movimientoBancarioId,
      movimientoCuentaId: input.movimientoCuentaId,
      movimientoFecha: input.movimientoFecha,
      vinculadoAt: FieldValue.serverTimestamp(),
    })
}
