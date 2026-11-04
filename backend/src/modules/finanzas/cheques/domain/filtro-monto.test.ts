import { describe, expect, it } from 'vitest'
import { dentroDelRangoMonto, leerRangoMonto, pesosACentavos } from './filtro-monto.js'

describe('filtro por monto (pesos → centavos)', () => {
  it('convierte pesos a centavos y deja vacío como null', () => {
    expect(pesosACentavos('450463')).toBe(45_046_300)
    expect(pesosACentavos('1500000.5')).toBe(150_000_050)
    expect(pesosACentavos('')).toBeNull()
    expect(pesosACentavos(undefined)).toBeNull()
  })

  it('rechaza montos inválidos o negativos', () => {
    expect(() => pesosACentavos('abc')).toThrow()
    expect(() => pesosACentavos('-5')).toThrow()
  })

  it('rechaza un "desde" mayor que el "hasta"', () => {
    expect(() => leerRangoMonto('200', '100')).toThrow()
    expect(leerRangoMonto('100', '200')).toEqual({ montoMinCentavos: 10_000, montoMaxCentavos: 20_000 })
  })

  it('incluye los extremos y excluye lo que queda afuera', () => {
    const rango = { montoMinCentavos: 10_000, montoMaxCentavos: 20_000 }
    expect(dentroDelRangoMonto(10_000, rango)).toBe(true)
    expect(dentroDelRangoMonto(20_000, rango)).toBe(true)
    expect(dentroDelRangoMonto(9_999, rango)).toBe(false)
    expect(dentroDelRangoMonto(20_001, rango)).toBe(false)
    expect(dentroDelRangoMonto(5, {})).toBe(true)
    expect(dentroDelRangoMonto(undefined, { montoMinCentavos: 1 })).toBe(false)
  })
})
