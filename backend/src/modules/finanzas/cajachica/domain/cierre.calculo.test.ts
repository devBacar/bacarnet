import { describe, expect, it } from 'vitest'
import { calcularDiferenciaCierre, calcularSaldoTeoricoCierre } from './cierre.calculo.js'

describe('calcularSaldoTeoricoCierre', () => {
  it('inicial + fondeos + ingresos - egresos', () => {
    expect(
      calcularSaldoTeoricoCierre({
        saldoInicial: 10_000,
        totalFondeosRecibidos: 50_000,
        totalIngresos: 5_000,
        totalEgresos: 30_000,
      }),
    ).toBe(35_000)
  })
})

describe('calcularDiferenciaCierre', () => {
  it('contado menos teórico', () => {
    expect(calcularDiferenciaCierre(100_00, 98_00)).toBe(-2_00)
  })
})
