import { adminDb } from '../../../../lib/firebase/admin.js'
import { VIENTRI_APLICACIONES, VIENTRI_COMPROBANTES, VIENTRI_PENDIENTES } from '../../vientri/services/vientri.repository.js'
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

const LOTE_GETALL = 300

/**
 * Pagos/cobros reales dentro del rango [desde, hasta]: lee `vientriAplicaciones` (una fila por cada
 * pago parcial o total que canceló una factura, con la fecha REAL del pago en `fechaCobro`, no la
 * fecha de la factura) y resuelve cada factura cancelada contra `vientriComprobantes` para el nombre
 * del cliente, el texto del comprobante y la moneda. Una factura con varios pagos parciales en fechas
 * distintas aparece como varias filas, una por cada pago.
 */
export async function cargarAplicacionesCobradas(input: {
  desde: string
  hasta: string
  moneda: string
}): Promise<FacturaCobrada[]> {
  const snapApl = await adminDb()
    .collection(VIENTRI_APLICACIONES)
    .where('fechaCobro', '>=', input.desde)
    .where('fechaCobro', '<=', input.hasta)
    .get()
  if (snapApl.empty) return []

  const aplicaciones = snapApl.docs.map((d) => d.data())
  const idsFactura = [...new Set(aplicaciones.map((a) => Number(a.idCmpFactura)))]
  const refs = idsFactura.map((id) => adminDb().collection(VIENTRI_COMPROBANTES).doc(`cmp-${id}`))
  const comprobantesPorId = new Map<number, FirebaseFirestore.DocumentData>()
  for (let i = 0; i < refs.length; i += LOTE_GETALL) {
    const snaps = await adminDb().getAll(...refs.slice(i, i + LOTE_GETALL))
    for (const snap of snaps) {
      if (snap.exists) comprobantesPorId.set(Number(snap.data()!.id), snap.data()!)
    }
  }

  const idDivisa = idDivisaDe(input.moneda)
  const cobradas: FacturaCobrada[] = []
  for (const a of aplicaciones) {
    // La factura no está en vientriComprobantes: o no es del lado "a cobrar" (es un pago a proveedor que
    // por error cruzó acá) o todavía no se importó esa colección. Se descarta, no se inventa el dato.
    const factura = comprobantesPorId.get(Number(a.idCmpFactura))
    if (!factura) continue
    const idDivisaReal = typeof factura.idDivisa === 'number' ? factura.idDivisa : 1
    if (idDivisaReal !== idDivisa) continue
    cobradas.push({
      clave: typeof a.clave === 'string' ? a.clave : `apl-${a.vientriId}`,
      comprobante: typeof factura.comprobante === 'string' ? factura.comprobante : String(a.idCmpFactura),
      persona: factura.persona
        ? { vientriId: Number(factura.persona.vientriId), nombre: String(factura.persona.nombre ?? 'Sin nombre') }
        : null,
      fechaCobro: typeof a.fechaCobro === 'string' ? a.fechaCobro : null,
      importeCobradoCentavos: Number(a.importeCentavos) || 0,
    })
  }
  return cobradas
}
