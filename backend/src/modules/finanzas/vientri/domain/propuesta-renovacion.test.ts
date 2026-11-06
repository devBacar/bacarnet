import { describe, expect, it } from 'vitest'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import { armarPropuestaRenovacion, chequesElegidosDelGrupo } from './propuesta-renovacion.js'

const OBS = '39585299/300/1/2'

function cheque(overrides: Partial<ChequeOcasionalDoc>): ChequeOcasionalDoc {
  return {
    numeroCheque: '1',
    beneficiario: 'DAVALOS',
    beneficiarioNormalizado: 'davalos',
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: 100_000_00,
    fechaVencimiento: '2026-09-30',
    fechaEmision: '2026-08-07',
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
    vientriId: 1,
    vientriChqId: null,
    baja: false,
    ...overrides,
  } as ChequeOcasionalDoc
}

const nuevo = (numero: string) => cheque({ numeroCheque: `020-923-5000-${numero}`, obsOriginal: OBS })
const viejo = (numero: string, overrides: Partial<ChequeOcasionalDoc> = {}) =>
  cheque({ numeroCheque: `020-923-5000-${numero}`, fechaEmision: '2026-06-01', fechaVencimiento: '2026-08-05', ...overrides })

describe('armarPropuestaRenovacion', () => {
  it('trae los cheques nuevos del grupo y busca los viejos que nombra el OBS', () => {
    const a = nuevo('39316341')
    const b = nuevo('39316342')
    const todos = [a, b, viejo('39585299'), viejo('39585300'), viejo('39585301'), viejo('39585302')]

    const p = armarPropuestaRenovacion(a, todos)
    expect(p.nuevos.map((n) => n.numeroCheque)).toEqual(['020-923-5000-39316341', '020-923-5000-39316342'])
    expect(p.viejos.map((v) => v.numeroObs)).toEqual(['39585299', '39585300', '39585301', '39585302'])
    expect(p.viejos.every((v) => v.encontrado !== null && v.avisos.length === 0)).toBe(true)
  })

  it('avisa si el viejo no está, es de otro beneficiario, ya se renovó o vencía lejos', () => {
    const a = nuevo('39316341')
    const todos = [
      a,
      viejo('39585300', { beneficiario: 'POVO', beneficiarioNormalizado: 'povo' }),
      viejo('39585301', { renovadoPor: ['39000001'] }),
      viejo('39585302', { fechaVencimiento: '2026-06-15' }),
    ]

    const p = armarPropuestaRenovacion(a, todos)
    const avisos = Object.fromEntries(p.viejos.map((v) => [v.numeroObs, v.avisos]))
    expect(avisos['39585299']).toEqual(['No está entre los cheques ocasionales cargados'])
    expect(avisos['39585300']).toEqual(['Es de otro beneficiario (POVO)'])
    expect(avisos['39585301']).toEqual(['Ya figura renovado por 39000001'])
    expect(avisos['39585302']).toEqual(['Vencía el 15/06/2026, 53 días antes de la emisión de los nuevos'])
  })

  it('con el catálogo, un alias del mismo proveedor no es "otro beneficiario"', () => {
    const a = nuevo('39316341')
    const v = viejo('39585299', { beneficiario: 'DAVALO S', beneficiarioNormalizado: 'davalo s' })
    const catalogo = new Map([
      ['davalos', { id: 'provfin-davalos', nombre: 'DAVALOS' }],
      ['davalo s', { id: 'provfin-davalos', nombre: 'DAVALOS' }],
    ])
    const p = armarPropuestaRenovacion(a, [a, v], catalogo)
    expect(p.viejos.find((x) => x.numeroObs === '39585299')!.avisos).toEqual([])
  })
})

describe('chequesElegidosDelGrupo', () => {
  it('aplica solo a los números elegidos, siempre con el cheque abierto', () => {
    const a = nuevo('39316341')
    const b = nuevo('39316342')
    const c = nuevo('39316343')
    expect(chequesElegidosDelGrupo(a, [a, b, c], ['39316343', '99999999'])).toEqual([a, c])
  })
})
