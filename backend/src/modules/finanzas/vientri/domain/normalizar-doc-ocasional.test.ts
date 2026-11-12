import { describe, expect, it } from 'vitest'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import { normalizarDocOcasional } from './normalizar-doc-ocasional.js'

describe('normalizarDocOcasional', () => {
  it('completa con vacíos los campos que faltan en un doc de una importación vieja', () => {
    const viejo = {
      numeroCheque: '020-111-2222-1',
      beneficiario: 'X',
      beneficiarioNormalizado: 'x',
      montoCentavos: 100,
      vientriId: 1,
    } as unknown as ChequeOcasionalDoc

    const d = normalizarDocOcasional(viejo)

    expect(d.rolEnOperacion).toBeNull()
    expect(d.operacionUsd).toBeNull()
    expect(d.renovacionDe).toEqual([])
    expect(d.renovadoPor).toEqual([])
    expect(d.revisar).toEqual([])
    expect(d.baja).toBe(false)
    expect(Object.values(d).some((v) => v === undefined)).toBe(false)
  })

  it('no pisa lo que el doc ya tiene', () => {
    const d = normalizarDocOcasional({
      numeroCheque: 'A',
      rolEnOperacion: 'capital',
      renovacionDe: ['1'],
      baja: true,
    } as unknown as ChequeOcasionalDoc)

    expect(d.rolEnOperacion).toBe('capital')
    expect(d.renovacionDe).toEqual(['1'])
    expect(d.baja).toBe(true)
  })
})

describe('normalizarDocOcasional: interés confirmado con la primera versión', () => {
  it('pasa tasaMensualPorcentaje a tasaPorcentaje por mes', () => {
    const viejo = { fechaRenovacion: '2026-09-22', obsRenovacion: 'R', tasaMensualPorcentaje: 6, meses: 3, baseCentavos: 100, baseDescripcion: 'x' }
    const d = normalizarDocOcasional({ interesDe: viejo } as unknown as ChequeOcasionalDoc)
    expect(d.interesDe).toEqual({ fechaRenovacion: '2026-09-22', obsRenovacion: 'R', tasaPorcentaje: 6, porMes: true, meses: 3, baseCentavos: 100, baseDescripcion: 'x' })
  })
})
