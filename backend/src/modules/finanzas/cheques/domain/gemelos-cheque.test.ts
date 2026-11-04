import { describe, expect, it } from 'vitest'
import { agruparGemelos, sonGemelos } from './gemelos-cheque.js'

const fisico = { id: 'f', numero: '020-923-5000-40074070', montoCentavos: 45_046_300, fechaPago: '2026-11-30' }
const echeq = { id: 'e', numero: '40074070', montoCentavos: 45_046_300, fechaPago: '2026-11-30' }

describe('gemelos de cheque (físico + eCheq)', () => {
  it('reconoce el físico largo y su eCheq', () => {
    expect(sonGemelos(fisico, echeq)).toBe(true)
  })

  it('no son gemelos si cambia el monto, el vencimiento o el número', () => {
    expect(sonGemelos(fisico, { ...echeq, montoCentavos: 1 })).toBe(false)
    expect(sonGemelos(fisico, { ...echeq, fechaPago: '2026-10-30' })).toBe(false)
    expect(sonGemelos(fisico, { ...echeq, numero: '40074068' })).toBe(false)
  })

  it('no usa sufijos de menos de 6 dígitos', () => {
    expect(sonGemelos({ ...fisico, numero: '020-923-5000-04070' }, { ...echeq, numero: '4070' })).toBe(false)
  })

  it('agrupa por par y deja primero al eCheq', () => {
    const otro = { id: 'o', numero: '40074068', montoCentavos: 45_046_300, fechaPago: '2026-10-30' }
    const grupos = agruparGemelos([fisico, otro, echeq])
    expect(grupos.map((g) => g.map((c) => c.id))).toEqual([['e', 'f'], ['o']])
  })
})
