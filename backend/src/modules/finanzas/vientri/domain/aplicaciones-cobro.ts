/**
 * aplicaciones.csv: qué pago/recibo (`id_cmp`) canceló qué factura (`id_cmp_cancelado`), y por cuánto
 * (`importe`). Una factura puede cobrarse en varios pagos parciales en fechas distintas.
 *
 * La fecha REAL de cobro es la `fecha` del comprobante de pago (`id_cmp`), no `fecins` (fecha de carga
 * en el sistema, no de negocio) ni la fecha de la factura cancelada (que es cuándo se facturó, no
 * cuándo se cobró).
 */
import type { FilaCsv } from './csv.js'
import { aBool, aCentavos, aEntero } from './valores.js'

export interface AplicacionCobroDoc {
  clave: string
  vientriId: number
  /** El pago/recibo/OP que canceló (total o parcialmente) la factura. */
  idCmpPago: number
  /** La factura cancelada. */
  idCmpFactura: number
  importeCentavos: number
  /** Fecha del comprobante de pago (`idCmpPago`). null si ese comprobante no está en comprobantes.csv. */
  fechaCobro: string | null
  fecsys: string | null
}

/**
 * `fechaPorComprobante` es la fecha de CADA comprobante (de cualquier tipo: factura, recibo, OP...),
 * indexada por su `vientri_id` — comprobantes.csv trae todos los tipos, no solo facturas.
 */
export function armarAplicacionesCobro(
  filas: FilaCsv[],
  fechaPorComprobante: Map<number, string | null>,
): AplicacionCobroDoc[] {
  const salida: AplicacionCobroDoc[] = []
  for (const f of filas) {
    if (aBool(f.baja)) continue
    const vientriId = aEntero(f.vientri_id)
    const idCmpPago = aEntero(f.id_cmp)
    const idCmpFactura = aEntero(f.id_cmp_cancelado)
    const importeCentavos = aCentavos(f.importe)
    if (vientriId === null || idCmpPago === null || idCmpFactura === null || importeCentavos === null) continue
    salida.push({
      clave: `apl-${vientriId}`,
      vientriId,
      idCmpPago,
      idCmpFactura,
      importeCentavos,
      fechaCobro: fechaPorComprobante.get(idCmpPago) ?? null,
      fecsys: (f.fecsys ?? '').trim() || null,
    })
  }
  return salida
}
