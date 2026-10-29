import { describe, expect, it } from 'vitest'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import { filtrarVentanaConCadenas } from './ventana-ocasionales.js'

function cheque(overrides: Partial<ChequeOcasionalDoc> = {}): ChequeOcasionalDoc {
  return {
    numeroCheque: '1001',
    beneficiario: 'Test',
    beneficiarioNormalizado: 'test',
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: 100000,
    fechaVencimiento: '2026-01-15',
    fechaEmision: '2025-12-01',
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
    obsOriginal: '',
    revisar: [],
    vientriId: 1,
    vientriChqId: null,
    baja: false,
    ...overrides,
  }
}

const DESDE = '2025-10-20'
const numeros = (docs: ChequeOcasionalDoc[]) => docs.map((d) => d.numeroCheque).sort()

describe('filtrarVentanaConCadenas', () => {
  it('descarta lo que vence antes de la ventana si no es parte de una cadena abierta', () => {
    const docs = [
      cheque({ numeroCheque: 'viejo', fechaVencimiento: '2024-05-01', pagado: true }),
      cheque({ numeroCheque: 'nuevo', fechaVencimiento: '2026-02-01' }),
    ]
    expect(numeros(filtrarVentanaConCadenas(docs, DESDE))).toEqual(['nuevo'])
  })

  it('conserva los antecesores viejos de una cadena con un cheque sin pagar en la ventana', () => {
    const docs = [
      cheque({ numeroCheque: 'a', fechaVencimiento: '2023-06-01', pagado: true, vientriId: 1 }),
      cheque({ numeroCheque: 'b', fechaVencimiento: '2024-06-01', pagado: true, renovacionDe: ['a'], vientriId: 2 }),
      cheque({ numeroCheque: 'c', fechaVencimiento: '2026-06-01', renovacionDe: ['b'], vientriId: 3 }),
      cheque({ numeroCheque: 'suelto', fechaVencimiento: '2023-01-01', pagado: true, vientriId: 4 }),
    ]
    expect(numeros(filtrarVentanaConCadenas(docs, DESDE))).toEqual(['a', 'b', 'c'])
  })

  it('no arrastra una cadena cerrada: si el último cheque ya está pagado, solo queda lo de la ventana', () => {
    const docs = [
      cheque({ numeroCheque: 'a', fechaVencimiento: '2023-06-01', pagado: true, vientriId: 1 }),
      cheque({ numeroCheque: 'c', fechaVencimiento: '2025-11-01', pagado: true, renovacionDe: ['a'], vientriId: 3 }),
    ]
    expect(numeros(filtrarVentanaConCadenas(docs, DESDE))).toEqual(['c'])
  })

  it('encuentra el antecesor por número corto y no se cuelga si hay ciclos', () => {
    const docs = [
      cheque({ numeroCheque: '020-111-2222-777', fechaVencimiento: '2024-01-01', pagado: true, renovacionDe: ['888'], vientriId: 1 }),
      cheque({ numeroCheque: '888', fechaVencimiento: '2026-03-01', renovacionDe: ['777'], vientriId: 2 }),
    ]
    expect(numeros(filtrarVentanaConCadenas(docs, DESDE))).toEqual(['020-111-2222-777', '888'])
  })
})
