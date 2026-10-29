import { describe, expect, it } from 'vitest'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import { agruparOperaciones } from './operacion-ocasional.js'

function cheque(overrides: Partial<ChequeOcasionalDoc> = {}): ChequeOcasionalDoc {
  return {
    numeroCheque: '44001234',
    beneficiario: 'MANA',
    beneficiarioNormalizado: 'mana',
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: 500000000,
    fechaVencimiento: '2027-01-15',
    fechaEmision: '2026-10-16',
    estadoCodigo: 0,
    estado: 'En cartera',
    pagado: false,
    esProveedorFinanciero: true,
    tipoProveedor: 'financiero',
    esRenovacion: false,
    renovacionDe: [],
    renovadoPor: [],
    operacionUsd: null,
    tasaExplicita: null,
    rolEnOperacion: null,
    obsOriginal: 'Renovacion',
    revisar: [],
    vientriId: 1,
    vientriChqId: null,
    baja: false,
    ...overrides,
  }
}

describe('agruparOperaciones', () => {
  it('agrupa cheques con misma fecha+beneficiario+obs', () => {
    const docs = [
      cheque({ numeroCheque: '40074158', rolEnOperacion: 'capital', montoCentavos: 315630500 }),
      cheque({ numeroCheque: '40074159', rolEnOperacion: 'capital', montoCentavos: 315630500 }),
      cheque({ numeroCheque: '40074160', rolEnOperacion: 'capital', montoCentavos: 310804100 }),
    ]
    const ops = agruparOperaciones(docs)
    expect(ops).toHaveLength(1)
    expect(ops[0].chequesCapital).toHaveLength(3)
    expect(ops[0].totalCapitalCentavos).toBe(942065100)
    expect(ops[0].rolDominante).toBe('capital')
  })

  it('no agrupa cheques con distinta fecha de emisión', () => {
    const docs = [
      cheque({ numeroCheque: '1', fechaEmision: '2026-10-16' }),
      cheque({ numeroCheque: '2', fechaEmision: '2026-10-17' }),
    ]
    const ops = agruparOperaciones(docs)
    expect(ops).toHaveLength(0)
  })

  it('no agrupa cheques de distinto beneficiario', () => {
    const docs = [
      cheque({ numeroCheque: '1', beneficiarioNormalizado: 'mana' }),
      cheque({ numeroCheque: '2', beneficiarioNormalizado: 'olmos' }),
    ]
    const ops = agruparOperaciones(docs)
    expect(ops).toHaveLength(0)
  })

  it('ignora cheques dados de baja', () => {
    const docs = [
      cheque({ numeroCheque: '1' }),
      cheque({ numeroCheque: '2', baja: true }),
    ]
    const ops = agruparOperaciones(docs)
    expect(ops).toHaveLength(0)
  })

  it('detecta rolDominante mixto cuando hay capital e interés separados', () => {
    const docs = [
      cheque({ numeroCheque: '1', rolEnOperacion: 'capital', obsOriginal: 'op' }),
      cheque({ numeroCheque: '2', rolEnOperacion: 'interes', obsOriginal: 'op' }),
    ]
    const ops = agruparOperaciones(docs)
    expect(ops).toHaveLength(1)
    expect(ops[0].rolDominante).toBe('mixto')
  })

  it('propaga operacionUsd desde cualquier cheque del grupo', () => {
    const usd = { montoUsd: 70000, cotizacion: 1555 }
    const docs = [
      cheque({ numeroCheque: '1', operacionUsd: usd }),
      cheque({ numeroCheque: '2' }),
    ]
    const ops = agruparOperaciones(docs)
    expect(ops).toHaveLength(1)
    expect(ops[0].operacionUsd).toEqual(usd)
  })

  it('ordena por fecha descendente', () => {
    const docs = [
      cheque({ numeroCheque: '1', fechaEmision: '2026-09-01', obsOriginal: 'a' }),
      cheque({ numeroCheque: '2', fechaEmision: '2026-09-01', obsOriginal: 'a' }),
      cheque({ numeroCheque: '3', fechaEmision: '2026-10-16', obsOriginal: 'b' }),
      cheque({ numeroCheque: '4', fechaEmision: '2026-10-16', obsOriginal: 'b' }),
    ]
    const ops = agruparOperaciones(docs)
    expect(ops).toHaveLength(2)
    expect(ops[0].fechaEmision).toBe('2026-10-16')
    expect(ops[1].fechaEmision).toBe('2026-09-01')
  })
})
