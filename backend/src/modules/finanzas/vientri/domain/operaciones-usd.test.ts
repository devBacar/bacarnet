import { describe, expect, it } from 'vitest'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import { agruparOperacionesUsd, resolverProveedor, resumirUsdPorProveedor } from './operaciones-usd.js'

const GONZALEZ = { id: 'provfin-gonzalez', nombre: 'GONZALEZ FABIAN' }
const CATALOGO = new Map([
  ['gonzalez fabian', GONZALEZ],
  ['gonzales fabian', GONZALEZ],
])

function cheque(overrides: Partial<ChequeOcasionalDoc>): ChequeOcasionalDoc {
  return {
    numeroCheque: '1',
    beneficiario: 'GONZALEZ FABIAN',
    beneficiarioNormalizado: 'gonzalez fabian',
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: 100_000_00,
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
    operacionUsd: { montoUsd: 1000, cotizacion: 1200 },
    tasaExplicita: null,
    rolEnOperacion: null,
    obsOriginal: '',
    revisar: [],
    fechaConciliado: null,
    proveedorFinancieroId: null,
    vientriId: 1,
    vientriChqId: null,
    baja: false,
    ...overrides,
  } as ChequeOcasionalDoc
}

describe('resolverProveedor', () => {
  it('usa el nombre del catálogo cuando el beneficiario es un alias', () => {
    expect(resolverProveedor('GONZALES FABIAN', 'gonzales fabian', CATALOGO)).toEqual({
      proveedorId: 'provfin-gonzalez',
      nombre: 'GONZALEZ FABIAN',
      clave: 'pf:provfin-gonzalez',
    })
  })

  it('deja el nombre como está escrito si no está en el catálogo', () => {
    expect(resolverProveedor('POVO', 'povo', CATALOGO)).toEqual({ proveedorId: null, nombre: 'POVO', clave: 'b:povo' })
  })
})

describe('agruparOperacionesUsd', () => {
  it('junta cheques de una operación aunque el beneficiario esté escrito distinto', () => {
    const ops = agruparOperacionesUsd(
      [
        cheque({ numeroCheque: '1', montoCentavos: 600_000_00 }),
        cheque({ numeroCheque: '2', beneficiario: 'GONZALES FABIAN', beneficiarioNormalizado: 'gonzales fabian', montoCentavos: 600_000_00 }),
      ],
      CATALOGO,
    )
    expect(ops).toHaveLength(1)
    expect(ops[0]!.beneficiario).toBe('GONZALEZ FABIAN')
    expect(ops[0]!.proveedorId).toBe('provfin-gonzalez')
    expect(ops[0]!.cantidadCheques).toBe(2)
    expect(ops[0]!.sumaChequesCentavos).toBe(1_200_000_00)
    expect(ops[0]!.equivalenteCentavos).toBe(1_200_000_00)
  })

  it('separa operaciones con otra cotización o fecha, e ignora cheques sin USD', () => {
    const ops = agruparOperacionesUsd(
      [
        cheque({ numeroCheque: '1' }),
        cheque({ numeroCheque: '2', operacionUsd: { montoUsd: 1000, cotizacion: 1300 } }),
        cheque({ numeroCheque: '3', fechaEmision: '2026-10-11' }),
        cheque({ numeroCheque: '4', operacionUsd: null }),
      ],
      CATALOGO,
    )
    expect(ops).toHaveLength(3)
  })
})

describe('resumirUsdPorProveedor', () => {
  it('suma las operaciones por proveedor con la cotización promedio ponderada', () => {
    const ops = agruparOperacionesUsd(
      [
        cheque({ numeroCheque: '1', operacionUsd: { montoUsd: 1000, cotizacion: 1000 }, montoCentavos: 1_000_000_00 }),
        cheque({ numeroCheque: '2', beneficiario: 'GONZALES FABIAN', beneficiarioNormalizado: 'gonzales fabian', fechaEmision: '2026-10-20', operacionUsd: { montoUsd: 3000, cotizacion: 1400 }, montoCentavos: 4_200_000_00 }),
        cheque({ numeroCheque: '3', beneficiario: 'POVO', beneficiarioNormalizado: 'povo', montoCentavos: 50_000_00 }),
      ],
      CATALOGO,
    )
    const r = resumirUsdPorProveedor(ops)
    expect(r.map((g) => g.beneficiario)).toEqual(['GONZALEZ FABIAN', 'POVO'])
    expect(r[0]).toMatchObject({
      proveedorId: 'provfin-gonzalez',
      cantidadOperaciones: 2,
      cantidadCheques: 2,
      totalUsd: 4000,
      cotizacionPromedio: 1300,
      sumaChequesCentavos: 5_200_000_00,
    })
    expect(r[1]!.proveedorId).toBeNull()
  })
})
