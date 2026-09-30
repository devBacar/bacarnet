import { describe, expect, it } from 'vitest'
import type { DiaExtracto, MovimientoExtracto } from './extracto.types.js'
import { armarFilasExtracto } from './saldo-corrido.js'

function movimiento(partial: Partial<MovimientoExtracto> & Pick<MovimientoExtracto, 'fechaProceso' | 'tipo' | 'montoCentavos' | 'correlativeNumber'>): MovimientoExtracto {
  return {
    descripcion: 'MOV',
    codeDescriptionIb: null,
    customerCuit: null,
    operationCodeBank: '1',
    operationCodeIb: '2',
    voucherNumber: 10,
    depositorDescription: null,
    ...partial,
  }
}

describe('saldo corrido', () => {
  it('ordena por fecha y correlativo, y arranca en el saldo de apertura', () => {
    const dias: DiaExtracto[] = [
      {
        fecha: '2026-09-02',
        saldoAperturaCentavos: 99_000,
        saldoCierreCentavos: 103_500,
        debitosCentavos: 0,
        creditosCentavos: 5_000,
        movimientos: [
          movimiento({
            fechaProceso: '2026-09-02',
            tipo: 'credito',
            montoCentavos: 5_000,
            correlativeNumber: 1,
            descripcion: 'COBRO',
          }),
        ],
      },
      {
        fecha: '2026-09-01',
        saldoAperturaCentavos: 100_000,
        saldoCierreCentavos: 99_000,
        debitosCentavos: 2_500,
        creditosCentavos: 1_000,
        movimientos: [
          movimiento({
            fechaProceso: '2026-09-01',
            tipo: 'debito',
            montoCentavos: 2_000,
            correlativeNumber: 5,
            descripcion: 'PAGO',
          }),
          movimiento({
            fechaProceso: '2026-09-01',
            tipo: 'credito',
            montoCentavos: 1_000,
            correlativeNumber: 2,
            descripcion: 'DEPOSITO',
          }),
          movimiento({
            fechaProceso: '2026-09-01',
            tipo: 'debito',
            montoCentavos: 500,
            correlativeNumber: null,
            descripcion: 'SIN CORRELATIVO',
          }),
        ],
      },
    ]

    const { resumen, filas } = armarFilasExtracto(dias)

    expect(resumen.saldoInicialCentavos).toBe(100_000)
    expect(resumen.saldoFinalCentavos).toBe(103_500)
    expect(resumen.totalDebitosCentavos).toBe(2_500)
    expect(resumen.totalCreditosCentavos).toBe(6_000)
    expect(filas.map((fila) => [fila.descripcion, fila.saldoCentavos])).toEqual([
      ['DEPOSITO', 101_000],
      ['PAGO', 99_000],
      ['SIN CORRELATIVO', 98_500],
      ['COBRO', 103_500],
    ])
    expect(filas[1]?.debitoCentavos).toBe(2_000)
    expect(filas[1]?.creditoCentavos).toBe(0)
    expect(filas[0]?.creditoCentavos).toBe(1_000)
  })
})
