import { describe, expect, it } from 'vitest'
import {
  addIsoDays,
  diasInclusivos,
  partirPeriodoEnTramos,
  validarPeriodoExtracto,
} from './periodo.js'

const HOY = '2026-09-30'

describe('tramos de 60 días', () => {
  it('un solo día es un tramo', () => {
    expect(partirPeriodoEnTramos('2026-01-01', '2026-01-01')).toEqual([
      { desde: '2026-01-01', hasta: '2026-01-01' },
    ])
  })

  it('60 días inclusive entran en una sola consulta', () => {
    expect(diasInclusivos('2026-01-01', '2026-03-01')).toBe(60)
    expect(partirPeriodoEnTramos('2026-01-01', '2026-03-01')).toEqual([
      { desde: '2026-01-01', hasta: '2026-03-01' },
    ])
  })

  it('el día 61 abre un segundo tramo', () => {
    expect(diasInclusivos('2026-01-01', '2026-03-02')).toBe(61)
    expect(partirPeriodoEnTramos('2026-01-01', '2026-03-02')).toEqual([
      { desde: '2026-01-01', hasta: '2026-03-01' },
      { desde: '2026-03-02', hasta: '2026-03-02' },
    ])
  })

  it('120 días quedan en dos tramos de 60', () => {
    expect(diasInclusivos('2026-01-01', '2026-04-30')).toBe(120)
    expect(partirPeriodoEnTramos('2026-01-01', '2026-04-30')).toEqual([
      { desde: '2026-01-01', hasta: '2026-03-01' },
      { desde: '2026-03-02', hasta: '2026-04-30' },
    ])
  })
})

describe('validar período', () => {
  it('acepta el mes en curso y rechaza el futuro, el exceso y lo muy viejo', () => {
    expect(() => validarPeriodoExtracto('2026-09-01', '2026-09-30', HOY)).not.toThrow()
    expect(() => validarPeriodoExtracto(addIsoDays(HOY, -179), HOY, HOY)).not.toThrow()
    expect(() => validarPeriodoExtracto(addIsoDays(HOY, -180), addIsoDays(HOY, -180), HOY)).not.toThrow()

    expect(() => validarPeriodoExtracto('2026-09-30', '2026-09-01', HOY)).toThrow(/anterior/)
    expect(() => validarPeriodoExtracto('2026-09-30', '2026-10-01', HOY)).toThrow(/hoy/)
    expect(() => validarPeriodoExtracto('2026-02-31', '2026-03-01', HOY)).toThrow(/desde/)
    expect(() => validarPeriodoExtracto('2026-01-01', '2026-09-30', HOY)).toThrow(/180/)
    expect(() => validarPeriodoExtracto('2020-01-01', '2020-01-02', HOY)).toThrow(/180/)
  })
})
