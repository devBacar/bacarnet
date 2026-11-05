import { describe, expect, it } from 'vitest'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import { resolverIdsSinEncabezado } from './resolver-ids-sin-encabezado.js'

function doc(overrides: Partial<ChequeOcasionalDoc>): ChequeOcasionalDoc {
  return {
    numeroCheque: '020-923-5000-39316485',
    beneficiario: 'MANA',
    beneficiarioNormalizado: 'mana',
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: 483720200,
    fechaVencimiento: '2027-02-03',
    fechaEmision: '2026-09-22',
    estadoCodigo: null,
    estado: 'Sin estado',
    pagado: false,
    esProveedorFinanciero: true,
    tipoProveedor: 'financiero',
    esRenovacion: false,
    renovacionDe: [],
    renovadoPor: [],
    operacionUsd: null,
    tasaExplicita: null,
    rolEnOperacion: 'interes',
    obsOriginal: 'Intereses',
    revisar: [],
    fechaConciliado: null,
    proveedorFinancieroId: null,
    vientriId: 39316485,
    vientriChqId: null,
    baja: false,
    ...overrides,
  }
}

const guardado = (o: Partial<ChequeOcasionalDoc> = {}) =>
  doc({ vientriId: 26813, vientriChqId: 0, estadoCodigo: 0, estado: 'Estado 0', ...o })

describe('resolverIdsSinEncabezado', () => {
  it('reutiliza el id de Vientri del cheque ya guardado y conserva sus campos vivos', () => {
    const base = [guardado({ fechaConciliado: '2026-10-05', baja: false })]
    const r = resolverIdsSinEncabezado([doc({ pagado: false })], base)
    expect(r.sinIdDeVientri).toEqual([])
    expect(r.docs).toHaveLength(1)
    expect(r.docs[0]).toMatchObject({
      vientriId: 26813, vientriChqId: 0, estadoCodigo: 0, estado: 'Estado 0',
      fechaConciliado: '2026-10-05', baja: false, pagado: true,
    })
  })

  it('no sirve de referencia un doc viejo guardado con el número como id', () => {
    const viejo = doc({}) // vientriId = 39316485 = número corto
    const r = resolverIdsSinEncabezado([doc({})], [viejo])
    expect(r.docs).toEqual([])
    expect(r.sinIdDeVientri).toEqual(['020-923-5000-39316485'])
  })

  it('descarta e informa el cheque que no está guardado', () => {
    const r = resolverIdsSinEncabezado([doc({ numeroCheque: '020-923-5000-39999999' })], [guardado()])
    expect(r.docs).toEqual([])
    expect(r.sinIdDeVientri).toEqual(['020-923-5000-39999999'])
  })

  it('no adivina si el número está guardado más de una vez con ids reales', () => {
    const base = [guardado({ vientriId: 25604, estadoCodigo: 10 }), guardado({ vientriId: 25657 })]
    const r = resolverIdsSinEncabezado([doc({})], base)
    expect(r.docs).toEqual([])
    expect(r.sinIdDeVientri).toHaveLength(1)
  })

  it('ignora al doc viejo y usa el real cuando están los dos', () => {
    const r = resolverIdsSinEncabezado([doc({})], [doc({}), guardado()])
    expect(r.docs[0]?.vientriId).toBe(26813)
  })
})
