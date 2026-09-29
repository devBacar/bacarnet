import type { Moneda, PosicionCierreDocument } from '../../domain/cuenta.types.js'
import { listMovimientosCashflowDelDia } from '../../movimientos/services/movimientos.repository.js'
import { listCategoriaMovimientoDocuments } from '../../movimientos/services/categorias-movimientos.repository.js'
import {
  dateIdInArgentina,
  getPosicionCierreAnterior,
  getPosicionCierreDocument,
} from '../../services/cuentas.repository.js'
import {
  armarCashflow,
  ultimoDiaHabil,
  validarFechaCashflow,
  type CashflowDiario,
} from '../domain/cashflow.js'

export class CashflowError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

function saldoDe(data: PosicionCierreDocument, moneda: Moneda): number {
  return moneda === 'ARS' ? data.totales.arsCentavos : data.totales.usdCentavos
}

export async function getCashflowDiario(input: {
  fecha?: string
  moneda?: string
}): Promise<CashflowDiario> {
  const hoy = dateIdInArgentina(new Date())
  const fecha = input.fecha?.trim() || ultimoDiaHabil(hoy)
  const monedaRaw = (input.moneda?.trim() || 'ARS').toUpperCase()
  if (monedaRaw !== 'ARS' && monedaRaw !== 'USD') {
    throw new CashflowError('moneda debe ser ARS o USD', 400)
  }
  const moneda: Moneda = monedaRaw

  try {
    validarFechaCashflow(fecha, hoy)
  } catch (err) {
    throw new CashflowError(err instanceof Error ? err.message : 'fecha inválida', 400)
  }

  const [anterior, cierre, movimientos, categorias] = await Promise.all([
    getPosicionCierreAnterior(fecha),
    getPosicionCierreDocument(fecha),
    listMovimientosCashflowDelDia(fecha),
    listCategoriaMovimientoDocuments(),
  ])

  return armarCashflow({
    fecha,
    moneda,
    saldoInicial: anterior
      ? { fechaId: anterior.data.fechaId, centavos: saldoDe(anterior.data, moneda) }
      : null,
    saldoCierre: cierre ? { centavos: saldoDe(cierre.data, moneda) } : null,
    movimientos,
    categorias: categorias.map((categoria) => ({
      id: categoria.id,
      nombre: categoria.data.nombre,
      color: categoria.data.color,
    })),
  })
}
