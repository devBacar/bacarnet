import { describe, expect, it } from 'vitest'
import {
  cuentaInversor,
  estadoCalendario,
  type InversionParaCuenta,
} from './cuentaInversor.js'

function cuota(
  parcial: Partial<InversionParaCuenta['cronograma'][number]> & {
    numero: number
    fechaVencimiento: string
    estado: InversionParaCuenta['cronograma'][number]['estado']
  },
): InversionParaCuenta['cronograma'][number] {
  return {
    aPagarCentavos: parcial.aPagarCentavos ?? 100_000,
    monedaPago: parcial.monedaPago ?? 'ARS',
    interesCentavos: parcial.interesCentavos ?? 50_000,
    retencionCentavos: parcial.retencionCentavos ?? 0,
    restanteCentavos: parcial.restanteCentavos ?? parcial.aPagarCentavos ?? 100_000,
    ...parcial,
  }
}

function inv(parcial: Partial<InversionParaCuenta> & Pick<InversionParaCuenta, 'id' | 'numero' | 'moneda'>): InversionParaCuenta {
  return {
    estado: 'vigente',
    capitalCentavos: 1_000_000,
    fechaFinal: '2027-01-15',
    cronograma: [],
    ...parcial,
  }
}

describe('estadoCalendario', () => {
  it('mapea pagada, pendiente y vencida; ignora anulada/renovada', () => {
    expect(estadoCalendario('pagada')).toBe('pagada')
    expect(estadoCalendario('pendiente')).toBe('pendiente')
    expect(estadoCalendario('parcial')).toBe('pendiente')
    expect(estadoCalendario('atrasada')).toBe('vencida')
    expect(estadoCalendario('anulada')).toBeNull()
    expect(estadoCalendario('renovada')).toBeNull()
  })
})

describe('cuentaInversor', () => {
  it('separa pesos y dólares y oculta la moneda sin datos', () => {
    const cuenta = cuentaInversor(
      [
        inv({
          id: 'a',
          numero: 'INV-A',
          moneda: 'ARS',
          capitalCentavos: 500_000,
          cronograma: [
            cuota({
              numero: 1,
              fechaVencimiento: '2026-11-10',
              estado: 'pendiente',
              interesCentavos: 10_000,
              aPagarCentavos: 90_000,
              restanteCentavos: 90_000,
            }),
          ],
        }),
        inv({
          id: 'b',
          numero: 'INV-B',
          moneda: 'USD',
          capitalCentavos: 200_000,
          cronograma: [
            cuota({
              numero: 1,
              fechaVencimiento: '2026-12-01',
              estado: 'pendiente',
              monedaPago: 'USD',
              interesCentavos: 5_000,
              aPagarCentavos: 45_000,
              restanteCentavos: 45_000,
            }),
          ],
        }),
      ],
      '2026-10-23',
    )

    expect(cuenta.kpisPorMoneda.map((k) => k.moneda)).toEqual(['ARS', 'USD'])
    expect(cuenta.kpisPorMoneda[0]).toMatchObject({
      moneda: 'ARS',
      capitalVigenteCentavos: 500_000,
      interesesAPagarCentavos: 10_000,
      inversionesVigentes: 1,
    })
    expect(cuenta.kpisPorMoneda[1]).toMatchObject({
      moneda: 'USD',
      capitalVigenteCentavos: 200_000,
      interesesAPagarCentavos: 5_000,
      inversionesVigentes: 1,
    })
  })

  it('excluye no vigentes (para aprobar, anuladas, cerradas)', () => {
    const cuenta = cuentaInversor(
      [
        inv({
          id: 'v',
          numero: 'VIG',
          moneda: 'ARS',
          capitalCentavos: 100_000,
          cronograma: [
            cuota({ numero: 1, fechaVencimiento: '2026-11-01', estado: 'pendiente', interesCentavos: 1_000 }),
          ],
        }),
        inv({
          id: 'p',
          numero: 'PEN',
          moneda: 'ARS',
          estado: 'pendiente_aprobacion',
          capitalCentavos: 999_000,
          cronograma: [
            cuota({ numero: 1, fechaVencimiento: '2026-11-01', estado: 'pendiente', interesCentavos: 50_000 }),
          ],
        }),
        inv({
          id: 'x',
          numero: 'ANU',
          moneda: 'ARS',
          estado: 'anulada',
          capitalCentavos: 888_000,
          cronograma: [
            cuota({ numero: 1, fechaVencimiento: '2026-11-01', estado: 'pendiente', interesCentavos: 40_000 }),
          ],
        }),
        inv({
          id: 'c',
          numero: 'CER',
          moneda: 'ARS',
          estado: 'cancelada',
          capitalCentavos: 777_000,
          cronograma: [
            cuota({ numero: 1, fechaVencimiento: '2026-10-01', estado: 'pagada', interesCentavos: 30_000 }),
          ],
        }),
      ],
      '2026-10-23',
    )

    expect(cuenta.kpisPorMoneda).toHaveLength(1)
    expect(cuenta.kpisPorMoneda[0].capitalVigenteCentavos).toBe(100_000)
    expect(cuenta.kpisPorMoneda[0].interesesAPagarCentavos).toBe(1_000)
    expect(cuenta.kpisPorMoneda[0].interesesPagadosCentavos).toBe(0)
    expect(cuenta.inversionesVigentes.map((i) => i.id)).toEqual(['v'])
    expect(cuenta.calendario.flatMap((m) => m.cuotas)).toHaveLength(1)
  })

  it('clasifica cuotas pagada / pendiente / vencida y agrupa por mes', () => {
    const cuenta = cuentaInversor(
      [
        inv({
          id: 'a',
          numero: 'INV-1',
          moneda: 'ARS',
          cronograma: [
            cuota({
              numero: 1,
              fechaVencimiento: '2026-09-15',
              estado: 'pagada',
              interesCentavos: 20_000,
              aPagarCentavos: 80_000,
              restanteCentavos: 0,
              retencionCentavos: 5_000,
            }),
            cuota({
              numero: 2,
              fechaVencimiento: '2026-10-15',
              estado: 'atrasada',
              interesCentavos: 20_000,
              aPagarCentavos: 80_000,
              restanteCentavos: 80_000,
            }),
            cuota({
              numero: 3,
              fechaVencimiento: '2026-11-15',
              estado: 'pendiente',
              interesCentavos: 20_000,
              aPagarCentavos: 80_000,
              restanteCentavos: 80_000,
            }),
            cuota({
              numero: 4,
              fechaVencimiento: '2026-11-20',
              estado: 'anulada',
              interesCentavos: 99_000,
              aPagarCentavos: 99_000,
            }),
          ],
        }),
      ],
      '2026-10-23',
    )

    expect(cuenta.kpisPorMoneda[0].interesesPagadosCentavos).toBe(20_000)
    expect(cuenta.kpisPorMoneda[0].interesesAPagarCentavos).toBe(40_000)
    expect(cuenta.kpisPorMoneda[0].retencionesAnioCentavos).toBe(5_000)

    const flat = cuenta.calendario.flatMap((m) =>
      m.cuotas.map((c) => ({ mes: m.mes, estado: c.estado, fecha: c.fecha })),
    )
    expect(flat).toEqual([
      { mes: '2026-09', estado: 'pagada', fecha: '2026-09-15' },
      { mes: '2026-10', estado: 'vencida', fecha: '2026-10-15' },
      { mes: '2026-11', estado: 'pendiente', fecha: '2026-11-15' },
    ])
    expect(cuenta.calendario.find((m) => m.mes === '2026-11')?.etiqueta).toMatch(/noviembre 2026/i)
  })

  it('calcula el próximo vencimiento (fecha + monto neto restante)', () => {
    const cuenta = cuentaInversor(
      [
        inv({
          id: 'a',
          numero: 'INV-1',
          moneda: 'ARS',
          cronograma: [
            cuota({
              numero: 1,
              fechaVencimiento: '2026-10-01',
              estado: 'pagada',
              aPagarCentavos: 50_000,
              restanteCentavos: 0,
            }),
            cuota({
              numero: 2,
              fechaVencimiento: '2026-11-05',
              estado: 'pendiente',
              aPagarCentavos: 100_000,
              restanteCentavos: 100_000,
              monedaPago: 'ARS',
            }),
            cuota({
              numero: 3,
              fechaVencimiento: '2026-12-05',
              estado: 'pendiente',
              aPagarCentavos: 100_000,
              restanteCentavos: 100_000,
            }),
          ],
        }),
        inv({
          id: 'b',
          numero: 'INV-2',
          moneda: 'ARS',
          capitalCentavos: 500_000,
          cronograma: [
            cuota({
              numero: 1,
              fechaVencimiento: '2026-11-01',
              estado: 'atrasada',
              aPagarCentavos: 70_000,
              restanteCentavos: 70_000,
              monedaPago: 'ARS',
            }),
          ],
        }),
      ],
      '2026-10-23',
    )

    expect(cuenta.kpisPorMoneda[0].proximoVencimiento).toEqual({
      fecha: '2026-11-01',
      montoCentavos: 70_000,
      monedaPago: 'ARS',
    })
  })

  it('no mezcla retenciones de otro año', () => {
    const cuenta = cuentaInversor(
      [
        inv({
          id: 'a',
          numero: 'INV-1',
          moneda: 'ARS',
          cronograma: [
            cuota({
              numero: 1,
              fechaVencimiento: '2025-12-15',
              estado: 'pagada',
              retencionCentavos: 9_000,
              restanteCentavos: 0,
            }),
            cuota({
              numero: 2,
              fechaVencimiento: '2026-01-15',
              estado: 'pagada',
              retencionCentavos: 3_000,
              restanteCentavos: 0,
            }),
          ],
        }),
      ],
      '2026-10-23',
      2026,
    )

    expect(cuenta.kpisPorMoneda[0].retencionesAnioCentavos).toBe(3_000)
  })

  it('si no hay vigentes, KPIs y calendario vacíos', () => {
    const cuenta = cuentaInversor(
      [
        inv({
          id: 'x',
          numero: 'X',
          moneda: 'USD',
          estado: 'borrador',
          cronograma: [cuota({ numero: 1, fechaVencimiento: '2026-11-01', estado: 'pendiente' })],
        }),
      ],
      '2026-10-23',
    )
    expect(cuenta.kpisPorMoneda).toEqual([])
    expect(cuenta.calendario).toEqual([])
    expect(cuenta.inversionesVigentes).toEqual([])
  })
})
