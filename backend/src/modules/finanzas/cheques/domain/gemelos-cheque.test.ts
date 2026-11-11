import { describe, expect, it } from 'vitest'
import { agruparGemelos, mismoChequeParaConciliar, sonGemelos } from './gemelos-cheque.js'

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

describe('mismo cheque para conciliar (ocasional + copia en cheques)', () => {
  const ocasional = { id: 'oca:oca-25604', numero: '020-923-5010-39585222', montoCentavos: 2_700_000_00, fechaPago: '2026-09-14' }
  const copia = { id: 'emitido_020-923-5010-39585222', numero: '020-923-5010-39585222', montoCentavos: 2_700_000_00, fechaPago: '2026-09-10' }

  it('un ocasional (buscado por su fecha de conciliado) y su copia son el mismo cheque aunque las fechas no coincidan', () => {
    expect(sonGemelos(ocasional, copia)).toBe(false)
    expect(mismoChequeParaConciliar(ocasional, copia)).toBe(true)
    expect(mismoChequeParaConciliar(copia, ocasional)).toBe(true)
  })

  it('con el ocasional igual exige mismo importe y número', () => {
    expect(mismoChequeParaConciliar(ocasional, { ...copia, montoCentavos: 1 })).toBe(false)
    expect(mismoChequeParaConciliar(ocasional, { ...copia, numero: '020-923-5010-39585223' })).toBe(false)
  })

  it('entre cheques de `cheques` sigue pidiendo la misma fecha de pago', () => {
    expect(mismoChequeParaConciliar(fisico, { ...echeq, fechaPago: '2026-10-30' })).toBe(false)
    expect(mismoChequeParaConciliar(fisico, echeq)).toBe(true)
  })

  it('agrupa el ocasional con su copia y el eCheq', () => {
    const echeqCopia = { ...copia, id: 'emitido_39585222', numero: '39585222' }
    const grupos = agruparGemelos([ocasional, copia, echeqCopia], mismoChequeParaConciliar)
    expect(grupos).toHaveLength(1)
    expect(grupos[0]![0]!.id).toBe('emitido_39585222')
  })
})
