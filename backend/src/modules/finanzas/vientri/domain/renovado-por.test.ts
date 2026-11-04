import { describe, expect, it } from 'vitest'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import { calcularRenovadoPor } from './renovado-por.js'

function doc(overrides: Partial<ChequeOcasionalDoc>): ChequeOcasionalDoc {
  return {
    numeroCheque: '',
    beneficiario: '',
    beneficiarioNormalizado: '',
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: 0,
    fechaVencimiento: null,
    fechaEmision: null,
    estadoCodigo: null,
    estado: '',
    pagado: false,
    esProveedorFinanciero: true,
    tipoProveedor: 'financiero',
    esRenovacion: false,
    renovacionDe: [],
    renovadoPor: [],
    operacionUsd: null,
    tasaExplicita: null,
    rolEnOperacion: null,
    obsOriginal: '',
    revisar: [],
    fechaConciliado: null,
    proveedorFinancieroId: null,
    vientriId: 0,
    vientriChqId: null,
    baja: false,
    ...overrides,
  }
}

describe('calcularRenovadoPor', () => {
  it('liga el cheque viejo con el nuevo, por número completo o corto', () => {
    const viejo = doc({ numeroCheque: '020-111-2222-44000999' })
    const nuevo = doc({ numeroCheque: '020-111-2222-44001111', renovacionDe: ['44000999'] })
    expect(calcularRenovadoPor([viejo, nuevo])).toEqual([['020-111-2222-44001111'], []])
  })

  it('el resultado no depende del orden de los docs', () => {
    const viejo = doc({ numeroCheque: '020-111-2222-100' })
    const n1 = doc({ numeroCheque: '020-111-2222-300', renovacionDe: ['100'] })
    const n2 = doc({ numeroCheque: '020-111-2222-200', renovacionDe: ['100'] })
    const a = calcularRenovadoPor([viejo, n1, n2])[0]
    const b = calcularRenovadoPor([n2, viejo, n1])[1]
    expect(a).toEqual(['020-111-2222-200', '020-111-2222-300'])
    expect(b).toEqual(a)
  })

  it('un cheque nuevo dado de baja no marca al viejo como renovado', () => {
    const viejo = doc({ numeroCheque: '020-111-2222-100' })
    const nuevoBaja = doc({ numeroCheque: '020-111-2222-200', renovacionDe: ['100'], baja: true })
    expect(calcularRenovadoPor([viejo, nuevoBaja])).toEqual([[], []])
  })

  it('ignora referencias a cheques que no están', () => {
    const nuevo = doc({ numeroCheque: '020-111-2222-200', renovacionDe: ['999'] })
    expect(calcularRenovadoPor([nuevo])).toEqual([[]])
  })
})
