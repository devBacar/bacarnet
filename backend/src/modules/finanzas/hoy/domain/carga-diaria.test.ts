import { describe, expect, it } from 'vitest'
import { armarCargaDiaria, nivelDeCarga } from './carga-diaria.js'
import type { CompromisoParaPlanilla } from './compromisos-mes.js'

function comp(parcial: Partial<CompromisoParaPlanilla>): CompromisoParaPlanilla {
  return {
    id: parcial.id ?? 'c1',
    concepto: 'x',
    proveedorONombre: 'Prov',
    montoCentavos: 100_00,
    fechaVencimiento: '2026-11-04',
    fechaPago: null,
    estado: 'pendiente',
    medioPago: 'cheque',
    grupo: 'Proveedores',
    moneda: 'ARS',
    deudaTotalCentavos: null,
    cuotaNumero: null,
    cuotaTotal: null,
    observacion: null,
    pagos: [],
    ...parcial,
  }
}

const sinFeriados = new Set<string>()

describe('nivelDeCarga', () => {
  it('compara contra el promedio con cortes en 60 % y 140 %', () => {
    expect(nivelDeCarga(0, 1000)).toBe('sin_pagos')
    expect(nivelDeCarga(600, 1000)).toBe('liviano')
    expect(nivelDeCarga(601, 1000)).toBe('medio')
    expect(nivelDeCarga(1400, 1000)).toBe('medio')
    expect(nivelDeCarga(1401, 1000)).toBe('pesado')
  })
  it('si no hay promedio, cualquier pago es pesado', () => {
    expect(nivelDeCarga(5, 0)).toBe('pesado')
  })
})

describe('armarCargaDiaria', () => {
  const base = { desde: '2026-11-02', dias: 7, hoy: '2026-11-02', tipoCambio: null, feriados: sinFeriados }

  it('suma por día, saca el promedio de los días hábiles del mes y clasifica', () => {
    // Noviembre 2026: 21 días hábiles (con 23 de nov sin feriado cargado acá). Se cargan 3 días.
    const compromisos = [
      comp({ id: 'a', fechaVencimiento: '2026-11-03', montoCentavos: 1_000_000_00 }),
      comp({ id: 'b', fechaVencimiento: '2026-11-04', montoCentavos: 10_00 }),
      comp({ id: 'c', fechaVencimiento: '2026-11-05', montoCentavos: 100_000_00 }),
    ]
    const carga = armarCargaDiaria({ ...base, compromisos })
    const mes = carga.meses[0]
    expect(mes.mes).toBe('2026-11')
    expect(mes.diasHabiles).toBe(21)
    expect(mes.totalCentavos).toBe(1_100_010_00)
    const dia = (f: string) => carga.dias.find((d) => d.fecha === f)!
    expect(dia('2026-11-03').nivel).toBe('pesado')
    expect(dia('2026-11-04').nivel).toBe('liviano')
    expect(dia('2026-11-02').nivel).toBe('sin_pagos')
    expect(carga.diasMasLivianos[0]).toBe('2026-11-02')
  })

  it('corre el vencimiento del finde al hábil anterior', () => {
    const carga = armarCargaDiaria({
      ...base,
      compromisos: [comp({ fechaVencimiento: '2026-11-07', montoCentavos: 500_00 })],
    })
    expect(carga.dias.find((d) => d.fecha === '2026-11-06')!.totalCentavos).toBe(500_00)
    expect(carga.dias.find((d) => d.fecha === '2026-11-07')!.nivel).toBe('sin_pagos')
    expect(carga.dias.find((d) => d.fecha === '2026-11-07')!.tipo).toBe('finde')
  })

  it('un compromiso pagado cuenta en el total del día pero no en lo pendiente', () => {
    const carga = armarCargaDiaria({
      ...base,
      compromisos: [
        comp({
          fechaVencimiento: '2026-11-04',
          montoCentavos: 200_00,
          pagos: [{ fecha: '2026-11-04', montoCentavos: 200_00 } as never],
        }),
      ],
    })
    const dia = carga.dias.find((d) => d.fecha === '2026-11-04')!
    expect(dia.totalCentavos).toBe(200_00)
    expect(dia.pendienteCentavos).toBe(0)
  })

  it('pasa los dólares a pesos con el tipo de cambio', () => {
    const carga = armarCargaDiaria({
      ...base,
      tipoCambio: 1000,
      compromisos: [comp({ fechaVencimiento: '2026-11-04', moneda: 'USD', montoCentavos: 10_00 })],
    })
    expect(carga.dias.find((d) => d.fecha === '2026-11-04')!.totalCentavos).toBe(10_000_00)
  })

  it('lo vencido antes del tramo y sin pagar va al arrastre, no a un día', () => {
    const carga = armarCargaDiaria({
      ...base,
      compromisos: [comp({ fechaVencimiento: '2026-09-15', montoCentavos: 300_00 })],
    })
    expect(carga.arrastreCentavos).toBe(300_00)
    expect(carga.dias.every((d) => d.totalCentavos === 0)).toBe(true)
  })

  it('un tramo que cruza de mes usa el promedio de cada mes', () => {
    const carga = armarCargaDiaria({ ...base, desde: '2026-11-27', dias: 7, hoy: '2026-11-27', compromisos: [] })
    expect(carga.meses.map((m) => m.mes)).toEqual(['2026-11', '2026-12'])
  })
})
