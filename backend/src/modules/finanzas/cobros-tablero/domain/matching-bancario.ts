/**
 * Cruce de un movimiento bancario de crédito (cobro real, llega cada 30 min) contra las facturas
 * pendientes de cobro de Vientri (que solo se actualizan una vez por día). Match FUERTE: CUIT exacto
 * de la contraparte + monto exacto. Si el CUIT no está completo, o hay cero o más de una factura que
 * coincide, no hay candidato único: mejor no matchear que inventar a qué factura corresponde un cobro.
 * No se reparte un pago entre varias facturas ni se intenta con nombre aproximado solo.
 */
import { cuitOnceDigitos } from '../../contraparte/domain/normalizar.js'
import type { VientriPendienteDoc } from '../../vientri/domain/tipos.js'

export interface MovimientoCobroParaMatch {
  id: string
  montoCentavos: number
  contraparteCuit: string | null
  customerCuit: string | null
}

export function candidatosDeCobro(
  movimiento: MovimientoCobroParaMatch,
  pendientes: VientriPendienteDoc[],
): VientriPendienteDoc[] {
  const cuitMov = cuitOnceDigitos(movimiento.contraparteCuit) ?? cuitOnceDigitos(movimiento.customerCuit)
  if (!cuitMov) return []
  return pendientes.filter(
    (p) =>
      p.pendienteCentavos > 0 &&
      p.pendienteCentavos === movimiento.montoCentavos &&
      cuitOnceDigitos(p.persona?.cuit) === cuitMov,
  )
}
