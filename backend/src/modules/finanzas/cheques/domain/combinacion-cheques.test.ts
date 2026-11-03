import { describe, expect, it } from 'vitest'
import { buscarCombinacionDeCheques } from './combinacion-cheques.js'
import type { ChequeParaContraparte } from '../../contraparte/domain/fuente-cheque.js'

function cheque(p: Partial<ChequeParaContraparte> & { id: string; montoCentavos: number }): ChequeParaContraparte {
  return {
    numero: p.id,
    direccion: 'emitido',
    fechaEmision: '2026-10-01',
    fechaPago: '2026-11-02',
    emisor: null,
    cliente: null,
    destinatario: null,
    ...p,
  }
}

describe('buscarCombinacionDeCheques', () => {
  it('encuentra la única combinación que suma exacto el monto', () => {
    const candidatos = [
      cheque({ id: 'a', montoCentavos: 100_00 }),
      cheque({ id: 'b', montoCentavos: 250_00 }),
      cheque({ id: 'c', montoCentavos: 650_00 }),
    ]
    const r = buscarCombinacionDeCheques(1000_00, candidatos)
    expect(r.ambigua).toBe(false)
    expect(r.combinacion?.map((c) => c.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('un solo cheque que ya suma el monto exacto cuenta como combinación válida', () => {
    const candidatos = [cheque({ id: 'a', montoCentavos: 500_00 }), cheque({ id: 'b', montoCentavos: 300_00 })]
    const r = buscarCombinacionDeCheques(500_00, candidatos)
    expect(r.combinacion?.map((c) => c.id)).toEqual(['a'])
    expect(r.ambigua).toBe(false)
  })

  it('caso realmente ambiguo: dos subconjuntos distintos suman el mismo total', () => {
    const candidatos = [
      cheque({ id: 'a', montoCentavos: 300_00 }),
      cheque({ id: 'b', montoCentavos: 300_00 }),
      cheque({ id: 'c', montoCentavos: 200_00 }),
      cheque({ id: 'd', montoCentavos: 400_00 }),
    ]
    // a+c = 500 y b+c = 500 (dos combinaciones distintas con el mismo total)
    const r = buscarCombinacionDeCheques(500_00, candidatos)
    expect(r.ambigua).toBe(true)
    expect(r.combinacion).toBeNull()
  })

  it('si ningún subconjunto suma el monto exacto, no devuelve nada (sin ambigüedad)', () => {
    const candidatos = [cheque({ id: 'a', montoCentavos: 100_00 }), cheque({ id: 'b', montoCentavos: 200_00 })]
    const r = buscarCombinacionDeCheques(999_00, candidatos)
    expect(r.combinacion).toBeNull()
    expect(r.ambigua).toBe(false)
  })

  it('con demasiados candidatos, no busca (evita combinatoria explosiva) y lo dice', () => {
    const candidatos = Array.from({ length: 20 }, (_, i) => cheque({ id: `c${i}`, montoCentavos: 10_00 }))
    const r = buscarCombinacionDeCheques(100_00, candidatos, { maxCheques: 15 })
    expect(r.combinacion).toBeNull()
    expect(r.ambigua).toBe(false)
    expect(r.demasiadosCandidatos).toBe(true)
  })

  it('un monto <= 0 o sin candidatos no devuelve nada', () => {
    expect(buscarCombinacionDeCheques(0, [cheque({ id: 'a', montoCentavos: 100 })]).combinacion).toBeNull()
    expect(buscarCombinacionDeCheques(100_00, []).combinacion).toBeNull()
  })
})
