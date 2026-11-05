import { adminDb } from '../../../../lib/firebase/admin.js'
import { VIENTRI_COMPROBANTES, VIENTRI_PENDIENTES } from '../../vientri/services/vientri.repository.js'
import type { VientriPendienteDoc } from '../../vientri/domain/tipos.js'
import type { FacturaCobrada } from '../domain/tipos.js'

/**
 * ID de divisa en Vientri (tabla DIVISA), igual mapeo confirmado que usa el tablero de Ventas
 * (finanzas/ventas-tablero/services/ventas-tablero.repository.ts): 1 = Pesos, 4 = Dólares.
 */
const ID_DIVISA_POR_MONEDA: Record<'ARS' | 'USD', number> = { ARS: 1, USD: 4 }

function idDivisaDe(moneda: string): number {
  return ID_DIVISA_POR_MONEDA[moneda === 'USD' ? 'USD' : 'ARS']
}

/** Todos los pendientes "a cobrar" (deuda y saldos a favor), filtrados por moneda en memoria. */
export async function cargarPendientesCobrar(moneda: string): Promise<VientriPendienteDoc[]> {
  const snap = await adminDb().collection(VIENTRI_PENDIENTES).where('lado', '==', 'cobrar').get()
  const monedaNorm = moneda === 'USD' ? 'USD' : 'ARS'
  return snap.docs
    .map((d) => d.data() as VientriPendienteDoc)
    .filter((p) => (p.moneda === 'USD' ? 'USD' : 'ARS') === monedaNorm)
}

/** IDs (vientriId) de comprobantes "a cobrar" que hoy siguen con saldo pendiente, de cualquier moneda. */
async function cargarIdsConPendiente(): Promise<Set<number>> {
  const snap = await adminDb().collection(VIENTRI_PENDIENTES).where('lado', '==', 'cobrar').select('vientriId').get()
  return new Set(snap.docs.map((d) => Number(d.data().vientriId)))
}

/**
 * Facturas emitidas (comprobantes "a cobrar") ya cobradas por completo dentro del rango [desde, hasta]:
 * comprobantes del período cuyo id no aparece en los pendientes (ya no tienen saldo abierto).
 */
export async function cargarComprobantesCobrados(input: {
  desde: string
  hasta: string
  moneda: string
}): Promise<FacturaCobrada[]> {
  const idDivisa = idDivisaDe(input.moneda)
  const [snapCmp, idsConPendiente] = await Promise.all([
    adminDb()
      .collection(VIENTRI_COMPROBANTES)
      .where('fecha', '>=', input.desde)
      .where('fecha', '<=', input.hasta)
      .get(),
    cargarIdsConPendiente(),
  ])
  const cobradas: FacturaCobrada[] = []
  for (const d of snapCmp.docs) {
    const data = d.data()
    const id = Number(data.id)
    if (idsConPendiente.has(id)) continue
    const idDivisaReal = typeof data.idDivisa === 'number' ? data.idDivisa : 1
    if (idDivisaReal !== idDivisa) continue
    cobradas.push({
      clave: `cmp-${id}`,
      comprobante: typeof data.comprobante === 'string' ? data.comprobante : String(id),
      persona: data.persona
        ? { vientriId: Number(data.persona.vientriId), nombre: String(data.persona.nombre ?? 'Sin nombre') }
        : null,
      fecha: typeof data.fecha === 'string' ? data.fecha : null,
      totalCentavos: Number(data.totalCentavos) || 0,
    })
  }
  return cobradas
}
