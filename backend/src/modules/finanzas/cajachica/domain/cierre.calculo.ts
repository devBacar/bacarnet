export interface CierreCalculoInput {
  saldoInicial: number
  totalFondeosRecibidos: number
  totalIngresos: number
  totalEgresos: number
}

export function calcularSaldoTeoricoCierre(input: CierreCalculoInput): number {
  return (
    input.saldoInicial + input.totalFondeosRecibidos + input.totalIngresos - input.totalEgresos
  )
}

export function calcularDiferenciaCierre(saldoTeorico: number, efectivoContado: number): number {
  return efectivoContado - saldoTeorico
}

/** Delta de saldo por tipo de movimiento. */
export function saldoDeltaPorMovimiento(tipo: import('./caja.types.js').CajaMovimientoTipo): number {
  if (tipo === 'ingreso' || tipo === 'fondeo_recibido') return 1
  return -1
}
