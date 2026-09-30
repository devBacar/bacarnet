import type { BancoNombre } from '../../domain/cuenta.types.js'
import {
  amountToSignedCentavos,
  mapInterbankingMovement,
  type InterbankingMovementRow,
} from '../../movimientos/domain/movimiento-bancario.map.js'
import { ExtractoBancoError } from './extracto.errors.js'
import type { DiaExtracto, MovimientoExtracto } from './extracto.types.js'
import { fechaDma, fechaIsoValida } from './periodo.js'

export interface CuentaParaNormalizar {
  cuentaId: string
  bancoNombre: BancoNombre
  bancoNumero: string
  numeroCuenta: string
}

function esRegistro(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function numero(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function primeraFecha(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const day = value.trim().slice(0, 10)
    if (fechaIsoValida(day)) return day
  }
  return null
}

function centavosFirmados(value: unknown, que: string, fecha: string): number {
  if (value == null || value === '') {
    throw new ExtractoBancoError(`El extracto del ${fechaDma(fecha)} no trae ${que}.`)
  }
  const amount = numero(value)
  if (amount == null) {
    throw new ExtractoBancoError(`El extracto del ${fechaDma(fecha)} trae un ${que} que no es un importe.`)
  }
  return amountToSignedCentavos(amount)
}

function normalizarMovimiento(raw: unknown, fechaDia: string, cuenta: CuentaParaNormalizar): MovimientoExtracto {
  if (!esRegistro(raw)) {
    throw new ExtractoBancoError(`Hay un movimiento del ${fechaDma(fechaDia)} que vino incompleto.`)
  }
  const fecha = primeraFecha(raw.process_date, raw.movement_date, raw.value_date, fechaDia)
  if (!fecha) {
    throw new ExtractoBancoError(`Hay un movimiento del ${fechaDma(fechaDia)} sin fecha.`)
  }
  const amount = numero(raw.amount)
  if (amount == null) {
    throw new ExtractoBancoError(`Hay un movimiento del ${fechaDma(fecha)} sin importe.`)
  }
  const row: InterbankingMovementRow = {
    operation_code_ib: raw.operation_code_ib,
    operation_code_bank: raw.operation_code_bank,
    code_description_ib: raw.code_description_ib,
    code_description_bank: raw.code_description_bank,
    customer_cuit: raw.customer_cuit,
    depositor_description: raw.depositor_description,
    amount,
    voucher_number: raw.voucher_number,
    process_date: fecha,
    debit_credit_type: raw.debit_credit_type,
    correlative_number: raw.correlative_number,
  }
  try {
    const mapped = mapInterbankingMovement({ row, ...cuenta })
    return {
      fechaProceso: mapped.fechaProceso,
      tipo: mapped.tipo,
      montoCentavos: mapped.montoCentavos,
      descripcion: mapped.descripcion,
      codeDescriptionIb: mapped.codeDescriptionIb,
      customerCuit: mapped.customerCuit,
      operationCodeBank: mapped.operationCodeBank,
      operationCodeIb: mapped.operationCodeIb,
      voucherNumber: mapped.voucherNumber,
      correlativeNumber: mapped.correlativeNumber,
      depositorDescription: mapped.depositorDescription,
    }
  } catch {
    throw new ExtractoBancoError(`Hay un movimiento del ${fechaDma(fecha)} que no se pudo leer.`)
  }
}

/** Un día del JSON del banco → saldos en centavos y movimientos con la misma forma que BacarNet. */
export function normalizarStatement(raw: unknown, cuenta: CuentaParaNormalizar): DiaExtracto {
  if (!esRegistro(raw)) {
    throw new ExtractoBancoError('El banco mandó un día del extracto que no se puede leer.')
  }
  const fecha = primeraFecha(raw.operation_date)
  if (!fecha) {
    throw new ExtractoBancoError('El banco mandó un día del extracto sin fecha.')
  }
  const detalle = raw.movement_detail
  if (detalle != null && !Array.isArray(detalle)) {
    throw new ExtractoBancoError(`El extracto del ${fechaDma(fecha)} no trae los movimientos.`)
  }
  const movimientos = Array.isArray(detalle) ? detalle : []
  const anunciados = numero(raw.total_movements)
  if (anunciados != null && movimientos.length < anunciados) {
    throw new ExtractoBancoError(`El extracto del ${fechaDma(fecha)} vino incompleto.`)
  }
  return {
    fecha,
    saldoAperturaCentavos: centavosFirmados(raw.opening_balance, 'el saldo inicial', fecha),
    saldoCierreCentavos: centavosFirmados(raw.ending_balance, 'el saldo final', fecha),
    debitosCentavos: Math.abs(centavosFirmados(raw.debits_total_amount, 'el total de débitos', fecha)),
    creditosCentavos: Math.abs(centavosFirmados(raw.credits_total_amount, 'el total de créditos', fecha)),
    movimientos: movimientos.map((movimiento) => normalizarMovimiento(movimiento, fecha, cuenta)),
  }
}

export function normalizarStatements(statements: unknown, cuenta: CuentaParaNormalizar): DiaExtracto[] {
  if (!Array.isArray(statements)) {
    throw new ExtractoBancoError('El banco no mandó la lista de días del extracto.')
  }
  return statements.map((statement) => normalizarStatement(statement, cuenta))
}

/**
 * Si el mismo día llega partido en dos páginas, cada pedazo trae el saldo de apertura del día pero
 * sus propios totales y un saldo final calculado solo con sus movimientos (verificado con Julio,
 * 02/09/2026). Se suman débitos, créditos y movimientos, y el cierre se recalcula:
 * apertura + créditos − débitos. Los tramos de fecha no se pisan entre sí.
 */
export function unirDias(dias: readonly DiaExtracto[]): DiaExtracto[] {
  const porFecha = new Map<string, DiaExtracto>()
  for (const dia of dias) {
    const previo = porFecha.get(dia.fecha)
    if (!previo) {
      porFecha.set(dia.fecha, { ...dia, movimientos: [...dia.movimientos] })
      continue
    }
    previo.movimientos.push(...dia.movimientos)
    previo.debitosCentavos += dia.debitosCentavos
    previo.creditosCentavos += dia.creditosCentavos
    previo.saldoCierreCentavos =
      previo.saldoAperturaCentavos + previo.creditosCentavos - previo.debitosCentavos
  }
  return encadenarSaldos([...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)))
}

/**
 * Cada día arranca con el cierre del anterior. El banco a veces informa un `opening_balance` que no
 * coincide con el cierre del día previo (Córdoba 23/09 y 28/09/2026: saltos de ~100 M), aunque los
 * movimientos y totales del día están bien; encadenando, los cierres dan igual al saldo oficial de
 * GET /accounts/balances. Solo el primer día usa la apertura que manda el banco.
 */
export function encadenarSaldos(dias: DiaExtracto[]): DiaExtracto[] {
  for (let i = 1; i < dias.length; i += 1) {
    const dia = dias[i]!
    dia.saldoAperturaCentavos = dias[i - 1]!.saldoCierreCentavos
    dia.saldoCierreCentavos = dia.saldoAperturaCentavos + dia.creditosCentavos - dia.debitosCentavos
  }
  return dias
}
