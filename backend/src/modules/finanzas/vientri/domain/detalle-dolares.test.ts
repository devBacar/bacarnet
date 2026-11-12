import { describe, expect, it } from 'vitest'
import { analizarARevisar } from './analisis-revisar.js'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import { armarDetalleDolares, buscarTasaRedonda, tasaMensual } from './detalle-dolares.js'
import { agruparOperacionesRenovacion } from './operacion-renovacion.js'

let siguienteId = 1
function doc(overrides: Partial<ChequeOcasionalDoc>): ChequeOcasionalDoc {
  const id = siguienteId++
  return {
    numeroCheque: `020-923-5000-${39500000 + id}`,
    beneficiario: 'LIO',
    beneficiarioNormalizado: 'lio',
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: 0,
    fechaVencimiento: null,
    fechaEmision: null,
    estadoCodigo: null,
    estado: '',
    pagado: false,
    esProveedorFinanciero: true,
    tipoProveedor: 'financiero',
    esRenovacion: false,
    renovacionDe: [],
    renovadoPor: [],
    operacionUsd: null,
    tasaExplicita: null,
    rolEnOperacion: null,
    obsOriginal: '',
    revisar: [],
    fechaConciliado: null,
    proveedorFinancieroId: null,
    vientriId: id,
    vientriChqId: null,
    baja: false,
    ...overrides,
  }
}

const iguales = (n: number, base: Partial<ChequeOcasionalDoc>): ChequeOcasionalDoc[] => Array.from({ length: n }, () => doc(base))
const ctx = (todos: ChequeOcasionalDoc[]) => ({ todos, catalogo: new Map() })

// LIO 05/08/2026: US$ 10.000 a 1.545 = $15.450.000, 6 cheques a 33 días por $16.979.550 = 9 % mensual × 33/30.
const lio = iguales(6, { montoCentavos: 282992500, fechaEmision: '2026-08-05', fechaVencimiento: '2026-09-07', obsOriginal: 'u$ 10.000  TC1545', revisar: ['x'] })
// BRA 09/03/2026: US$ 30.000 a 1.440 = $43.200.000, 8 cheques al día siguiente por $44.832.960 (3,78 % más).
const bra = iguales(8, {
  beneficiario: 'BRA',
  beneficiarioNormalizado: 'bra',
  montoCentavos: 560412000,
  fechaEmision: '2026-03-09',
  fechaVencimiento: '2026-03-10',
  obsOriginal: '30000 TC1440',
  revisar: ['Sin datos'],
})

describe('tasaMensual y buscarTasaRedonda', () => {
  it('interés simple por los días de cada cheque', () => {
    const cheques = [{ montoCentavos: 1_095_500_00, dias: 45 }]
    expect(tasaMensual(cheques, 1_000_000_00)).toBeCloseTo(6.3667, 3)
    expect(buscarTasaRedonda(cheques, 1_000_000_00)).toBeNull()
  })

  it('reconoce el descuento: el capital es el cheque menos la tasa', () => {
    // US$ 20.000 a 1.440 = $28.800.000; los cheques suman $32.000.000 a 30 días: 28,8 = 32 × (1 − 10 %).
    const r = buscarTasaRedonda([{ montoCentavos: 3_200_000_000, dias: 30 }], 2_880_000_000)
    expect(r).toMatchObject({ modo: 'descuento', tasaMensualPorcentaje: 10, diferenciaCentavos: 0, ajuste: 'al_peso' })
  })

  it('con cheques redondeados a miles solo acepta tasas enteras', () => {
    // 11 % mensual a 70 días daría $1.256.666,67; el cheque salió por $1.257.000.
    const r = buscarTasaRedonda([{ montoCentavos: 1_257_000_00, dias: 70 }], 1_000_000_00)
    expect(r).toMatchObject({ modo: 'interes', tasaMensualPorcentaje: 11, ajuste: 'a_miles' })
  })

  it('sin plazo no hay tasa', () => {
    expect(tasaMensual([{ montoCentavos: 100, dias: 0 }], 90)).toBeNull()
    expect(buscarTasaRedonda([{ montoCentavos: 100, dias: 0 }], 90)).toBeNull()
  })
})

describe('armarDetalleDolares', () => {
  it('LIO: da justo 9 % mensual por 33 días', () => {
    const d = armarDetalleDolares(lio, ctx(lio))!
    expect(d).toMatchObject({
      montoUsd: 10000,
      cotizacion: 1545,
      capitalCentavos: 1_545_000_000,
      totalChequesCentavos: 1_697_955_000,
      diferenciaCentavos: 152_955_000,
      lectura: 'tasa_redonda',
      tasaRedonda: { modo: 'interes', tasaMensualPorcentaje: 9, diferenciaCentavos: 0, ajuste: 'al_peso' },
    })
    expect(d.vencimientos).toEqual([{ fecha: '2026-09-07', dias: 33, cantidadCheques: 6, montoCentavos: 1_697_955_000 }])
    expect(d.plazoPromedioDias).toBe(33)
    expect(d.mensualPorcentaje).toBeCloseTo(9, 6)
    expect(d.recargoPorcentaje).toBeCloseTo(9.9, 6)
  })

  it('BRA: vencen al día siguiente, no es interés por plazo; cada cheque cubre US$ 3.750', () => {
    const d = armarDetalleDolares(bra, ctx(bra))!
    expect(d.lectura).toBe('sin_plazo')
    expect(d.plazoPromedioDias).toBe(1)
    expect(d.recargoPorcentaje).toBeCloseTo(3.78, 6)
    expect(d.cotizacionEfectiva).toBeCloseTo(1494.432, 6)
    expect(d.chequesIguales).toEqual({ usdPorCheque: 3750, capitalPorChequeCentavos: 540_000_000, montoCentavos: 560_412_000 })
    expect(d.tasaRedonda).toBeNull()
  })

  it('da justo cuando los cheques suman dólares × cotización (hasta $1 por cheque)', () => {
    const g = [
      doc({ montoCentavos: 765_000_000, fechaEmision: '2026-07-07', fechaVencimiento: '2026-07-20', obsOriginal: 'U$10.000 TC1530' }),
      doc({ montoCentavos: 764_999_999, fechaEmision: '2026-07-07', fechaVencimiento: '2026-08-05', obsOriginal: 'U$10.000 TC1530' }),
    ]
    const d = armarDetalleDolares(g, ctx(g))!
    expect(d.lectura).toBe('justo')
    expect(d.redondeoCheques).toBe(2)
  })

  it('faltan cheques: muestra las otras partes (mismos dólares y cotización) sin sumarlas a la cuenta', () => {
    const suelto = [doc({ montoCentavos: 247_505_200, fechaEmision: '2026-02-02', fechaVencimiento: '2026-02-03', obsOriginal: 'U$65000 TC1470' })]
    const resto = iguales(4, { montoCentavos: 2_500_000_000, fechaEmision: '2026-02-03', fechaVencimiento: '2026-04-03', obsOriginal: 'U$65000 TC1470' })
    const d = armarDetalleDolares(suelto, ctx([...suelto, ...resto]))!
    expect(d.lectura).toBe('faltan_cheques')
    expect(d.totalChequesCentavos).toBe(247_505_200)
    expect(d.partes).toEqual([{ fechaEmision: '2026-02-03', obs: 'U$65000 TC1470', cantidadCheques: 4, montoCentavos: 10_000_000_000 }])
  })

  it('compara con las otras operaciones del proveedor y, si son pocas, con las de otros proveedores de esos días', () => {
    const otra = iguales(2, { montoCentavos: 850_000_000, fechaEmision: '2026-07-01', fechaVencimiento: '2026-07-31', obsOriginal: 'u$10.000 TC1530' })
    const ajena = iguales(2, {
      beneficiario: 'MANA',
      beneficiarioNormalizado: 'mana',
      montoCentavos: 1_650_000_000,
      fechaEmision: '2026-08-01',
      fechaVencimiento: '2026-08-31',
      obsOriginal: 'usd 20.000 TC1500',
    })
    const todos = [...lio, ...otra, ...ajena]
    const d = armarDetalleDolares(lio, ctx(todos))!
    expect(d.comparables.map((c) => [c.proveedor, c.mismoProveedor, c.fechaEmision])).toEqual([
      ['MANA', false, '2026-08-01'],
      ['LIO', true, '2026-07-01'],
    ])
    expect(d.rangoProveedor!.min).toBeCloseTo(d.comparables[1]!.mensualPorcentaje, 6)
  })
})

describe('analizarARevisar con dólares', () => {
  const analizar = (docs: ChequeOcasionalDoc[]) => analizarARevisar(docs, new Map(), agruparOperacionesRenovacion(docs))

  it('LIO: fuerte, con la tasa en el título y el paso a paso', () => {
    const h = analizar(lio)[0]!.hipotesis.find((x) => x.tipo === 'dolares')!
    expect(h.fuerza).toBe('fuerte')
    expect(h.titulo).toBe('Operación en dólares: US$ 10.000 a 1.545, con 9% mensual de interés')
    expect(h.detalleDolares?.lectura).toBe('tasa_redonda')
    expect(h.avisos).toEqual([])
  })

  it('BRA: dudosa, con el aviso de que vencen enseguida', () => {
    const h = analizar(bra)[0]!.hipotesis.find((x) => x.tipo === 'dolares')!
    expect(h.fuerza).toBe('debil')
    expect(h.avisos[0]).toContain('vencen enseguida')
    expect(h.confirmar?.tipo).toBe('usd')
  })
})
