import { describe, expect, it } from 'vitest'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import { armarCatalogoProveedores, sugerirProveedores, type ProveedorCatalogoEntrada } from './catalogo-proveedores.js'

const MANA: ProveedorCatalogoEntrada = { id: 'provfin-mana', nombre: 'MANA', alias: ['OP MANA'], claves: ['mana', 'op mana'] }
const LIO: ProveedorCatalogoEntrada = { id: 'provfin-lio', nombre: 'LIO', alias: [], claves: ['lio'] }
const PROVEEDORES = [MANA, LIO]

function cheque(overrides: Partial<ChequeOcasionalDoc>): ChequeOcasionalDoc {
  return {
    numeroCheque: '1',
    beneficiario: 'MANA',
    beneficiarioNormalizado: 'mana',
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: 100,
    fechaVencimiento: '2026-11-10',
    fechaEmision: '2026-10-10',
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
    proveedorFinancieroId: 'provfin-mana',
    vientriId: 1,
    vientriChqId: null,
    baja: false,
    ...overrides,
  }
}

describe('sugerirProveedores', () => {
  it('sugiere cuando el nombre contiene al proveedor o al revés', () => {
    expect(sugerirProveedores('mana sa', PROVEEDORES)).toEqual([{ proveedorId: 'provfin-mana', nombre: 'MANA' }])
    expect(sugerirProveedores('op', [{ ...MANA, claves: ['op mana'] }])).toEqual([])
  })

  it('sugiere cuando difiere en una letra', () => {
    expect(sugerirProveedores('manna', PROVEEDORES).map((s) => s.proveedorId)).toEqual(['provfin-mana'])
  })

  it('no sugiere nombres que no se parecen', () => {
    expect(sugerirProveedores('juneda', PROVEEDORES)).toEqual([])
  })
})

describe('armarCatalogoProveedores', () => {
  it('cuenta cheques y monto por proveedor, sin las bajas', () => {
    const c = armarCatalogoProveedores(
      [
        cheque({ montoCentavos: 500 }),
        cheque({ beneficiario: 'OP MANA', beneficiarioNormalizado: 'op mana', montoCentavos: 300 }),
        cheque({ baja: true, montoCentavos: 999 }),
      ],
      PROVEEDORES,
    )
    expect(c.proveedores.find((p) => p.id === 'provfin-mana')).toMatchObject({ cantidadCheques: 2, totalCentavos: 800 })
    expect(c.proveedores.find((p) => p.id === 'provfin-lio')).toMatchObject({ cantidadCheques: 0, totalCentavos: 0 })
    expect(c.sinAsignar).toEqual([])
  })

  it('agrupa por nombre normalizado los beneficiarios sin proveedor y sugiere', () => {
    const sin = { proveedorFinancieroId: null }
    const c = armarCatalogoProveedores(
      [
        cheque({ ...sin, beneficiario: 'Mana SA', beneficiarioNormalizado: 'mana sa', montoCentavos: 200 }),
        cheque({ ...sin, beneficiario: 'MANA SA', beneficiarioNormalizado: 'mana sa', montoCentavos: 300 }),
        cheque({ ...sin, beneficiario: 'MANA SA', beneficiarioNormalizado: 'mana sa', montoCentavos: 100 }),
        cheque({ ...sin, beneficiario: 'Otro', beneficiarioNormalizado: 'otro', montoCentavos: 5000 }),
        cheque({ ...sin, beneficiario: '', beneficiarioNormalizado: '' }),
      ],
      PROVEEDORES,
    )
    expect(c.sinAsignar.map((s) => s.nombreNormalizado)).toEqual(['otro', 'mana sa'])
    expect(c.sinAsignar[1]).toMatchObject({
      nombre: 'MANA SA',
      variantes: ['MANA SA', 'Mana SA'],
      cantidadCheques: 3,
      totalCentavos: 600,
      sugerencias: [{ proveedorId: 'provfin-mana', nombre: 'MANA' }],
    })
  })
})
