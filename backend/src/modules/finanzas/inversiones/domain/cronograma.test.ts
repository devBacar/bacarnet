import { describe, expect, it } from 'vitest'
import { cuotaFrancesa, fechasDeCuotas, generarCronograma, generarTramo, totalesDe } from './cronograma.js'
import type { CondicionesInversion } from './inversion.types.js'

function cond(extra: Partial<CondicionesInversion>): CondicionesInversion {
  return {
    moneda: 'ARS',
    capitalCentavos: 10_000_000, // $100.000
    fechaAlta: '2026-01-15',
    sistema: 'frances',
    periodicidad: 'mensual',
    cantidadCuotas: 12,
    fechaVencimiento: null,
    tasa: { tipo: 'fija', tnaPct: 12 },
    baseDias: 360,
    medioIngresoPrevisto: 'transferencia',
    mediosDevolucion: ['transferencia_ars'],
    penalidadPrecancelacion: { tipo: 'ninguna' },
    ...extra,
  }
}

describe('fechasDeCuotas', () => {
  it('suma meses respetando fin de mes', () => {
    expect(fechasDeCuotas(cond({ fechaAlta: '2026-01-31', cantidadCuotas: 3 }))).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })
  it('al vencimiento usa la fecha indicada', () => {
    expect(fechasDeCuotas(cond({ sistema: 'al_vencimiento', fechaVencimiento: '2026-03-01' }))).toEqual(['2026-03-01'])
  })
})

describe('generarCronograma', () => {
  it('francés base 360: cuota pareja de libro (100.000 al 12 % en 12 = 8.884,88)', () => {
    const cuotas = generarCronograma(cond({}))
    expect(cuotas).toHaveLength(12)
    expect(cuotas[0]!.interesCentavos).toBe(100_000)
    expect(cuotas[0]!.totalCentavos).toBe(888_488)
    for (const c of cuotas.slice(0, 11)) expect(Math.abs(c.totalCentavos - 888_488)).toBeLessThanOrEqual(1)
    expect(cuotas[11]!.saldoCapitalCentavos).toBe(0)
    expect(totalesDe(cuotas).capitalCentavos).toBe(10_000_000)
  })

  it('alemán: capital igual en cada cuota e interés decreciente', () => {
    const cuotas = generarCronograma(cond({ sistema: 'aleman' }))
    expect(cuotas[0]!.capitalCentavos).toBe(833_333)
    expect(cuotas[0]!.interesCentavos).toBe(100_000)
    expect(cuotas[1]!.interesCentavos).toBe(91_667)
    expect(totalesDe(cuotas).capitalCentavos).toBe(10_000_000)
    expect(cuotas.at(-1)!.saldoCapitalCentavos).toBe(0)
  })

  it('americano: solo intereses y el capital al final', () => {
    const cuotas = generarCronograma(cond({ sistema: 'americano', cantidadCuotas: 3 }))
    expect(cuotas.map((c) => c.capitalCentavos)).toEqual([0, 0, 10_000_000])
    expect(cuotas.map((c) => c.interesCentavos)).toEqual([100_000, 100_000, 100_000])
  })

  it('al vencimiento con base 365 cuenta días reales', () => {
    const [c] = generarCronograma(
      cond({ sistema: 'al_vencimiento', fechaVencimiento: '2026-02-14', baseDias: 365, tasa: { tipo: 'fija', tnaPct: 36.5 } }),
    )
    expect(c!.diasPeriodo).toBe(30)
    expect(c!.interesCentavos).toBe(300_000) // 100.000 × 36,5 % × 30/365
    expect(c!.totalCentavos).toBe(10_300_000)
  })

  it('base de días reales usa 366 en año bisiesto', () => {
    const [c] = generarCronograma(
      cond({ fechaAlta: '2028-01-01', sistema: 'al_vencimiento', fechaVencimiento: '2028-01-31', baseDias: 'reales', tasa: { tipo: 'fija', tnaPct: 36.6 } }),
    )
    expect(c!.interesCentavos).toBe(300_000)
  })

  it('a medida: respeta el capital y calcula el interés que falta', () => {
    const cuotas = generarCronograma(
      cond({
        sistema: 'a_medida',
        cuotasAMedida: [
          { fecha: '2026-02-15', capitalCentavos: 4_000_000 },
          { fecha: '2026-03-15', capitalCentavos: 6_000_000, interesCentavos: 12_345 },
        ],
      }),
    )
    expect(cuotas[0]!.interesCentavos).toBe(100_000)
    expect(cuotas[1]!.interesCentavos).toBe(12_345)
    expect(cuotas[1]!.saldoCapitalCentavos).toBe(0)
  })

  it('a medida: avisa si el capital no suma', () => {
    expect(() =>
      generarCronograma(cond({ sistema: 'a_medida', cuotasAMedida: [{ fecha: '2026-02-15', capitalCentavos: 1 }] })),
    ).toThrow(/suma del capital/)
  })

  it('variable: referencia + spread, y marca como estimadas las cuotas futuras', () => {
    const cuotas = generarCronograma(cond({ sistema: 'americano', cantidadCuotas: 2, tasa: { tipo: 'variable', referencia: 'badlar', spreadPct: 2 } }), {
      tasaReferencia: (fecha) => (fecha < '2026-02-01' ? { tnaPct: 10, estimada: false } : { tnaPct: 10, estimada: true }),
    })
    expect(cuotas[0]!.tasaAplicadaPct).toBe(12)
    expect(cuotas[0]!.estimada).toBe(false)
    expect(cuotas[1]!.estimada).toBe(true)
  })

  it('variable: respeta piso', () => {
    const [c] = generarCronograma(cond({ sistema: 'al_vencimiento', fechaVencimiento: '2026-02-15', tasa: { tipo: 'variable', referencia: 'tamar', spreadPct: 1, pisoPct: 20 } }), {
      tasaReferencia: () => ({ tnaPct: 5, estimada: false }),
    })
    expect(c!.tasaAplicadaPct).toBe(20)
  })

  it('UVA: ajusta capital e interés por el índice', () => {
    const cuotas = generarCronograma(
      cond({ sistema: 'americano', cantidadCuotas: 2, tasa: { tipo: 'ajustable', indice: 'uva', tnaPct: 12 } }),
      { indice: (fecha) => ({ valor: fecha === '2026-02-15' ? 110 : 120, estimada: fecha > '2026-02-15' }) },
      100,
    )
    expect(cuotas[0]!.interesCentavos).toBe(110_000)
    expect(cuotas[0]!.ajusteCentavos).toBe(0)
    expect(cuotas[1]!.ajusteCentavos).toBe(2_000_000)
    expect(cuotas[1]!.totalCentavos).toBe(10_000_000 + 2_000_000 + 120_000)
    expect(cuotas[1]!.estimada).toBe(true)
  })

  it('UVA solo en pesos', () => {
    expect(() => generarCronograma(cond({ moneda: 'USD', tasa: { tipo: 'ajustable', indice: 'uva', tnaPct: 1 } }), {}, 1)).toThrow(/pesos/)
  })

  it('rechaza fechas fuera de orden', () => {
    expect(() =>
      generarTramo({ sistema: 'americano', baseDias: 365, tasa: { tipo: 'fija', tnaPct: 1 }, inicio: '2026-03-01', saldoCentavos: 100, fechas: ['2026-02-01'], numeroInicial: 1 }),
    ).toThrow(/orden/)
  })
})

describe('cuotaFrancesa', () => {
  it('con factores iguales coincide con la fórmula clásica', () => {
    const i = 0.01
    const clasica = (100 * i) / (1 - (1 + i) ** -12)
    expect(cuotaFrancesa(100, Array(12).fill(1 + i))).toBeCloseTo(clasica, 10)
  })
})
