import { describe, expect, it } from 'vitest'
import type { ChequeEnOperacion, OperacionRenovacion } from './cheque-ocasional.types.js'
import { operacionesDelCheque } from './operaciones-del-cheque.js'

function c(numeroCheque: string, montoCentavos: number): ChequeEnOperacion {
  return { numeroCheque, montoCentavos, fechaVencimiento: null, fechaEmision: null, rol: null, pagado: false }
}

function op(id: string, viejos: ChequeEnOperacion[], nuevos: ChequeEnOperacion[]): OperacionRenovacion {
  const totalViejos = viejos.reduce((s, x) => s + x.montoCentavos, 0)
  const totalNuevos = nuevos.reduce((s, x) => s + x.montoCentavos, 0)
  return {
    id,
    beneficiario: 'MANA',
    beneficiarioNormalizado: 'mana',
    fechaEmision: '2026-10-27',
    banco: null,
    chequesViejos: viejos,
    chequesNuevos: nuevos,
    totalViejosCentavos: totalViejos,
    totalNuevosCentavos: totalNuevos,
    interesCentavos: viejos.length > 0 ? totalNuevos - totalViejos : 0,
    fechaVtoViejos: null,
    fechaVtoNuevos: null,
    diasRenovacion: null,
    tasaImplicita: totalViejos > 0 ? (totalNuevos - totalViejos) / totalViejos : 0,
    tasaMensualEstimada: null,
    vinculada: viejos.length > 0,
    tipoVinculo: 'explicito',
    obsOriginal: '',
  }
}

describe('operacionesDelCheque', () => {
  it('encuentra la operación donde el cheque se renovó y la operación de la que salió', () => {
    const anterior = op('a', [c('V0', 1000)], [c('V1', 1100), c('V2', 500)])
    const siguiente = op('b', [c('V1', 1100), c('V2', 500)], [c('N1', 1000), c('N2', 800)])
    const r = operacionesDelCheque('V2', [anterior, siguiente])
    expect(r.origen?.id).toBe('a')
    expect(r.renovacion?.id).toBe('b')
    // El interés es de la operación entera, no del cheque de mayor monto.
    expect(r.renovacion?.interesCentavos).toBe(200)
  })

  it('no toma como renovación una operación sin cheques viejos', () => {
    const r = operacionesDelCheque('X', [op('a', [], [c('X', 100)])])
    expect(r.origen?.id).toBe('a')
    expect(r.renovacion).toBeNull()
  })
})
