import { describe, it, expect } from 'vitest'
import { calcularDetalle, calcularOperacion, validarOperacionInput } from './operacion-dolares.js'
import type { OperacionDolaresInput } from './operacion-dolares.types.js'

describe('calcularDetalle', () => {
  // Datos reales del Excel sist.xlsx — operación MANA 09-set-2026
  const FECHA_OP = '2026-09-09'
  const TASA_MENSUAL = 0.065
  const IMPUESTO = 0.025

  it('cheque a 55 días, $5.500.000', () => {
    const d = calcularDetalle(FECHA_OP, TASA_MENSUAL, IMPUESTO, {
      numeroCheque: '39316524',
      fechaCobro: '2026-11-03',
      importeCentavos: 550000000, // $5.500.000
    })
    expect(d.dias).toBe(55)
    // tasaDiaria = 0.065/30 ≈ 0.002166...
    // tasaEquiv = 0.002166... × 55 × 550000000 ≈ 65541667
    expect(d.tasaEquivalenteCentavos).toBeCloseTo(65541667, -2)
    // descuento = 0.025 × 550000000 = 13750000
    expect(d.descuentoCentavos).toBe(13750000)
    // liquidar = 550000000 - 65541667 - 13750000 ≈ 470708333
    expect(d.importeLiquidarCentavos).toBeCloseTo(470708333, -2)
  })

  it('cheque a 75 días, $5.749.391', () => {
    const d = calcularDetalle(FECHA_OP, TASA_MENSUAL, IMPUESTO, {
      numeroCheque: '39316536',
      fechaCobro: '2026-11-23',
      importeCentavos: 574939100, // $5.749.391
    })
    expect(d.dias).toBe(75)
    expect(d.descuentoCentavos).toBe(Math.round(0.025 * 574939100))
  })

  it('cheque a 91 días, $5.800.000', () => {
    const d = calcularDetalle(FECHA_OP, TASA_MENSUAL, IMPUESTO, {
      numeroCheque: '39316547',
      fechaCobro: '2026-12-09',
      importeCentavos: 580000000,
    })
    expect(d.dias).toBe(91)
  })
})

describe('calcularOperacion', () => {
  it('operación completa con datos del Excel sist.xlsx', () => {
    const input: OperacionDolaresInput = {
      fecha: '2026-09-09',
      inversor: 'MANA',
      cotizacion: 1555,
      tasaMensual: 0.065,
      impuestoPorcentaje: 0.025,
      montoUsd: 70000,
      cashCentavos: 0,
      notas: '',
      cheques: [
        { numeroCheque: '39316524', fechaCobro: '2026-11-03', importeCentavos: 550000000 },
        { numeroCheque: '39316525', fechaCobro: '2026-11-05', importeCentavos: 550000000 },
        { numeroCheque: '39316526', fechaCobro: '2026-11-05', importeCentavos: 550000000 },
        { numeroCheque: '39316528', fechaCobro: '2026-11-10', importeCentavos: 555106500 },
        { numeroCheque: '39316529', fechaCobro: '2026-11-10', importeCentavos: 605000000 },
        { numeroCheque: '39316530', fechaCobro: '2026-11-15', importeCentavos: 555106500 },
        { numeroCheque: '39316531', fechaCobro: '2026-11-15', importeCentavos: 555106700 },
        { numeroCheque: '39316532', fechaCobro: '2026-11-20', importeCentavos: 605000000 },
        { numeroCheque: '39316533', fechaCobro: '2026-11-22', importeCentavos: 596800000 },
        { numeroCheque: '39316534', fechaCobro: '2026-11-23', importeCentavos: 596800000 },
        { numeroCheque: '39316535', fechaCobro: '2026-11-23', importeCentavos: 574939100 },
        { numeroCheque: '39316536', fechaCobro: '2026-11-23', importeCentavos: 585000000 },
        { numeroCheque: '39316537', fechaCobro: '2026-11-24', importeCentavos: 585000000 },
        { numeroCheque: '39316538', fechaCobro: '2026-11-24', importeCentavos: 585000000 },
        { numeroCheque: '39316539', fechaCobro: '2026-11-25', importeCentavos: 585000000 },
        { numeroCheque: '39316540', fechaCobro: '2026-11-27', importeCentavos: 580000000 },
        { numeroCheque: '39316541', fechaCobro: '2026-11-28', importeCentavos: 580000000 },
        { numeroCheque: '39316542', fechaCobro: '2026-12-01', importeCentavos: 580000000 },
        { numeroCheque: '39316543', fechaCobro: '2026-12-03', importeCentavos: 580000000 },
        { numeroCheque: '39316544', fechaCobro: '2026-12-05', importeCentavos: 580000000 },
        { numeroCheque: '39316545', fechaCobro: '2026-12-06', importeCentavos: 580000000 },
        { numeroCheque: '39316546', fechaCobro: '2026-12-07', importeCentavos: 580000000 },
        { numeroCheque: '39316547', fechaCobro: '2026-12-09', importeCentavos: 580000000 },
      ],
    }

    const op = calcularOperacion(input)

    expect(op.inversor).toBe('MANA')
    expect(op.cotizacion).toBe(1555)
    expect(op.detalles).toHaveLength(23)

    // Suma de los importes de los 23 cheques del input
    const sumaEsperada = input.cheques.reduce((s, c) => s + c.importeCentavos, 0)
    expect(op.totalChequesCentavos).toBe(sumaEsperada)

    // Total a liquidar < total cheques (hay descuento + interés)
    expect(op.totalLiquidarCentavos).toBeLessThan(op.totalChequesCentavos)
    expect(op.totalLiquidarCentavos).toBeGreaterThan(0)

    // Costo financiero > 0
    expect(op.totalInteresCentavos).toBeGreaterThan(0)
    expect(op.costoFinancieroPorcentaje).toBeGreaterThan(0)

    // Cada detalle tiene días positivos
    for (const d of op.detalles) {
      expect(d.dias).toBeGreaterThan(0)
      expect(d.importeLiquidarCentavos).toBeGreaterThan(0)
      expect(d.importeLiquidarCentavos).toBeLessThan(d.importeCentavos)
    }
  })
})

describe('validarOperacionInput', () => {
  const inputValido: OperacionDolaresInput = {
    fecha: '2026-09-09',
    inversor: 'MANA',
    cotizacion: 1555,
    tasaMensual: 0.065,
    impuestoPorcentaje: 0.025,
    montoUsd: 70000,
    cashCentavos: 0,
    notas: '',
    cheques: [
      { numeroCheque: '39316524', fechaCobro: '2026-11-03', importeCentavos: 550000000 },
    ],
  }

  it('input válido no da errores', () => {
    expect(validarOperacionInput(inputValido)).toEqual([])
  })

  it('sin fecha', () => {
    const errores = validarOperacionInput({ ...inputValido, fecha: '' })
    expect(errores.some((e) => e.campo === 'fecha')).toBe(true)
  })

  it('sin inversor', () => {
    const errores = validarOperacionInput({ ...inputValido, inversor: '' })
    expect(errores.some((e) => e.campo === 'inversor')).toBe(true)
  })

  it('tasa fuera de rango', () => {
    const errores = validarOperacionInput({ ...inputValido, tasaMensual: 6.5 })
    expect(errores.some((e) => e.campo === 'tasaMensual')).toBe(true)
  })

  it('sin cheques', () => {
    const errores = validarOperacionInput({ ...inputValido, cheques: [] })
    expect(errores.some((e) => e.campo === 'cheques')).toBe(true)
  })
})
