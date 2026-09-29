import { describe, expect, it } from 'vitest'
import {
  armarCashflow,
  esFinDeSemana,
  ultimoDiaHabil,
  validarFechaCashflow,
} from './cashflow.js'

const categorias = [
  { id: 'impuestos', nombre: 'Impuestos', color: '#b45309' },
  { id: 'cobros', nombre: 'Cobros de clientes', color: '#0f766e' },
]

describe('armarCashflow', () => {
  it('suma entradas y salidas por categoría y deja afuera la otra moneda', () => {
    const cashflow = armarCashflow({
      fecha: '2026-09-28',
      moneda: 'ARS',
      saldoInicial: { fechaId: '2026-09-25', centavos: 1_000_00 },
      saldoCierre: { centavos: 1_500_00 },
      categorias,
      movimientos: [
        { moneda: 'ARS', tipo: 'credito', montoCentavos: 800_00, categoriaId: 'cobros' },
        { moneda: 'ARS', tipo: 'credito', montoCentavos: 200_00, categoriaId: null },
        { moneda: 'ARS', tipo: 'debito', montoCentavos: 300_00, categoriaId: 'impuestos' },
        { moneda: 'ARS', tipo: 'debito', montoCentavos: 100_00, categoriaId: 'impuestos' },
        { moneda: 'USD', tipo: 'credito', montoCentavos: 50_00, categoriaId: 'cobros' },
      ],
    })

    expect(cashflow.entradasCentavos).toBe(1_000_00)
    expect(cashflow.salidasCentavos).toBe(400_00)
    expect(cashflow.entradas.map((item) => [item.nombre, item.porcentaje])).toEqual([
      ['Cobros de clientes', 80],
      ['Sin categoría', 20],
    ])
    expect(cashflow.salidas).toEqual([
      expect.objectContaining({ nombre: 'Impuestos', centavos: 400_00, porcentaje: 100 }),
    ])
    expect(cashflow.saldoFinal).toEqual({ estado: 'cerrado', centavos: 1_500_00 })
  })

  it('sin cierre del día estima el saldo en vivo a partir del inicial', () => {
    const cashflow = armarCashflow({
      fecha: '2026-09-29',
      moneda: 'ARS',
      saldoInicial: { fechaId: '2026-09-28', centavos: 1_000_00 },
      saldoCierre: null,
      categorias,
      movimientos: [
        { moneda: 'ARS', tipo: 'credito', montoCentavos: 200_00, categoriaId: 'cobros' },
        { moneda: 'ARS', tipo: 'debito', montoCentavos: 50_00, categoriaId: 'impuestos' },
      ],
    })

    expect(cashflow.saldoFinal).toEqual({ estado: 'pendiente', centavos: 1_150_00 })
  })

  it('sin cierre anterior no inventa un saldo final', () => {
    const cashflow = armarCashflow({
      fecha: '2026-09-29',
      moneda: 'USD',
      saldoInicial: null,
      saldoCierre: null,
      categorias,
      movimientos: [],
    })

    expect(cashflow.saldoInicial).toBeNull()
    expect(cashflow.saldoFinal).toEqual({ estado: 'pendiente', centavos: null })
  })
})

describe('fechas del cashflow', () => {
  it('el sábado y el domingo retroceden al viernes', () => {
    expect(esFinDeSemana('2026-09-26')).toBe(true)
    expect(ultimoDiaHabil('2026-09-26')).toBe('2026-09-25')
    expect(ultimoDiaHabil('2026-09-29')).toBe('2026-09-29')
  })

  it('rechaza futuro y más de un mes atrás', () => {
    expect(() => validarFechaCashflow('2026-09-30', '2026-09-29')).toThrow(/futura/)
    expect(() => validarFechaCashflow('2026-08-01', '2026-09-29')).toThrow(/un mes/)
    expect(() => validarFechaCashflow('2026-09-01', '2026-09-29')).not.toThrow()
  })
})
