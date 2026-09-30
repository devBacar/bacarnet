import type { DiaExtracto, FilaSaldo, ResumenExtracto } from './extracto.types.js'

export interface ExtractoConSaldo {
  resumen: ResumenExtracto
  filas: FilaSaldo[]
}

/**
 * Filas en orden de fecha y, dentro del día, por número correlativo.
 * El saldo arranca en el saldo de apertura del primer día y corre movimiento a movimiento.
 * Los totales del resumen son los que informa el banco en cada día, no una suma nuestra.
 */
export function armarFilasExtracto(dias: readonly DiaExtracto[]): ExtractoConSaldo {
  const diasOrdenados = [...dias].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const saldoInicialCentavos = diasOrdenados[0]?.saldoAperturaCentavos ?? 0
  const saldoFinalCentavos = diasOrdenados[diasOrdenados.length - 1]?.saldoCierreCentavos ?? saldoInicialCentavos

  let totalDebitosCentavos = 0
  let totalCreditosCentavos = 0
  const planos: Array<{ fila: DiaExtracto['movimientos'][number]; indice: number }> = []
  let indice = 0
  for (const dia of diasOrdenados) {
    totalDebitosCentavos += dia.debitosCentavos
    totalCreditosCentavos += dia.creditosCentavos
    for (const movimiento of dia.movimientos) {
      planos.push({ fila: movimiento, indice })
      indice += 1
    }
  }

  planos.sort((a, b) => {
    if (a.fila.fechaProceso !== b.fila.fechaProceso) {
      return a.fila.fechaProceso < b.fila.fechaProceso ? -1 : 1
    }
    const correlativoA = a.fila.correlativeNumber
    const correlativoB = b.fila.correlativeNumber
    if (correlativoA == null && correlativoB == null) return a.indice - b.indice
    if (correlativoA == null) return 1
    if (correlativoB == null) return -1
    if (correlativoA !== correlativoB) return correlativoA - correlativoB
    return a.indice - b.indice
  })

  let saldo = saldoInicialCentavos
  const filas: FilaSaldo[] = planos.map(({ fila }) => {
    const debito = fila.tipo === 'debito'
    if (debito) saldo -= fila.montoCentavos
    else saldo += fila.montoCentavos
    return {
      ...fila,
      debitoCentavos: debito ? fila.montoCentavos : 0,
      creditoCentavos: debito ? 0 : fila.montoCentavos,
      saldoCentavos: saldo,
    }
  })

  return {
    resumen: {
      saldoInicialCentavos,
      saldoFinalCentavos,
      totalDebitosCentavos,
      totalCreditosCentavos,
      cantidad: filas.length,
    },
    filas,
  }
}
