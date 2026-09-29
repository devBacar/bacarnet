import type { Moneda, PosicionCierreDocument } from '../../domain/cuenta.types.js'
import { listMovimientosCashflowDelDia } from '../../movimientos/services/movimientos.repository.js'
import { listCategoriaMovimientoDocuments } from '../../movimientos/services/categorias-movimientos.repository.js'
import {
  dateIdInArgentina,
  getPosicionCierreAnterior,
  getPosicionCierreDocument,
  listCuentaDocuments,
} from '../../services/cuentas.repository.js'
import { listSaldosDiariosDeCuentas } from '../../services/saldos-diarios.repository.js'
import {
  armarCashflow,
  sumarDias,
  ultimoDiaHabil,
  validarFechaCashflow,
  type CashflowDiario,
  type Cierre15CuentaCashflow,
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

function cuentasCierre(
  data: PosicionCierreDocument | undefined,
  moneda: Moneda,
): Cierre15CuentaCashflow[] {
  if (!data) return []
  return data.cuentas
    .filter((cuenta) => cuenta.moneda === moneda)
    .map((cuenta) => ({ cuentaId: cuenta.cuentaId, saldoCentavos: cuenta.saldoCentavos }))
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

  const [anterior, cierre, movimientos, categorias, cuentas] = await Promise.all([
    getPosicionCierreAnterior(fecha),
    getPosicionCierreDocument(fecha),
    listMovimientosCashflowDelDia(fecha),
    listCategoriaMovimientoDocuments(),
    listCuentaDocuments(),
  ])
  const cuentasMoneda = cuentas.filter((cuenta) => cuenta.data.moneda === moneda)
  const saldosDiarios = await listSaldosDiariosDeCuentas({
    cuentaIds: cuentasMoneda.map((cuenta) => cuenta.id),
    desde: sumarDias(fecha, -45),
    hasta: fecha,
  })

  return armarCashflow({
    fecha,
    hoy,
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
      grupo: typeof categoria.data.grupo === 'string' && categoria.data.grupo.trim() ? categoria.data.grupo : null,
    })),
    cuentas: cuentasMoneda.map((cuenta) => ({
      cuentaId: cuenta.id,
      bancoNombre: cuenta.data.bancoNombre,
      moneda: cuenta.data.moneda,
    })),
    saldosDiarios,
    cierre15Anterior: anterior
      ? { fechaId: anterior.data.fechaId, cuentas: cuentasCierre(anterior.data, moneda) }
      : null,
    cierre15Dia: cierre ? { cuentas: cuentasCierre(cierre.data, moneda) } : null,
  })
}
