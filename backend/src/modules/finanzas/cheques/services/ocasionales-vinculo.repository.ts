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

export async function listOcasionalesSinVincular(): Promise<OcasionalSinVincular[]> {
  const snap = await col().get()
  const items: OcasionalSinVincular[] = []
  for (const doc of snap.docs) {
    const d = doc.data()
    if (d.baja === true || d.movimientoBancarioId) continue
    if (typeof d.numeroCheque !== 'string' || !d.numeroCheque) continue
    if (typeof d.fechaVencimiento !== 'string' || !d.fechaVencimiento) continue
    if (typeof d.montoCentavos !== 'number') continue
    items.push({
      id: `${PREFIJO_OCASIONAL}${doc.id}`,
      numero: d.numeroCheque,
      montoCentavos: d.montoCentavos,
      fechaEmision: typeof d.fechaEmision === 'string' ? d.fechaEmision : '',
      fechaPago: d.fechaVencimiento,
      emisor: '',
      cliente: null,
      destinatario: typeof d.beneficiario === 'string' ? d.beneficiario : null,
      estado: null,
    })
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
