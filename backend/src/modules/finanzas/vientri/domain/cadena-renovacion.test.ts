import { describe, expect, it } from 'vitest'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import { clasificarCheques, reconstruirCadenas, resumirCostoFinanciero } from './cadena-renovacion.js'

function cheque(overrides: Partial<ChequeOcasionalDoc> = {}): ChequeOcasionalDoc {
  return {
    numeroCheque: '44001234',
    beneficiario: 'Test',
    beneficiarioNormalizado: 'test',
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: 500000000,
    fechaVencimiento: '2027-01-15',
    fechaEmision: '2026-10-01',
    estadoCodigo: 0,
    estado: 'En cartera',
    pagado: false,
    esProveedorFinanciero: false,
    tipoProveedor: null,
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

describe('reconstruirCadenas', () => {
  it('arma una cadena lineal A → B → C y calcula el costo', () => {
    const docs = [
      cheque({ numeroCheque: 'CHQ-A', montoCentavos: 500000000, renovadoPor: ['CHQ-B'], beneficiario: 'Presta', beneficiarioNormalizado: 'presta', vientriId: 1 }),
      cheque({ numeroCheque: 'CHQ-B', montoCentavos: 580000000, renovacionDe: ['CHQ-A'], renovadoPor: ['CHQ-C'], beneficiario: 'Presta', beneficiarioNormalizado: 'presta', vientriId: 2 }),
      cheque({ numeroCheque: 'CHQ-C', montoCentavos: 670000000, renovacionDe: ['CHQ-B'], beneficiario: 'Presta', beneficiarioNormalizado: 'presta', vientriId: 3 }),
    ]

    const cadenas = reconstruirCadenas(docs)

    expect(cadenas).toHaveLength(1)
    const c = cadenas[0]!
    expect(c.cheques).toEqual(['CHQ-A', 'CHQ-B', 'CHQ-C'])
    expect(c.capitalInicialCentavos).toBe(500000000)
    expect(c.montoFinalCentavos).toBe(670000000)
    expect(c.interesTotalCentavos).toBe(170000000)
    expect(c.tasaImplicita).toBeCloseTo(0.34, 2)

    expect(c.eslabones).toHaveLength(2)
    expect(c.eslabones[0]!.interesCentavos).toBe(80000000)
    expect(c.eslabones[1]!.interesCentavos).toBe(90000000)
  })

  it('no arma cadena de un cheque suelto sin renovaciones', () => {
    const docs = [
      cheque({ numeroCheque: 'CHQ-SOLO', vientriId: 1 }),
    ]
    expect(reconstruirCadenas(docs)).toHaveLength(0)
  })

  it('arma dos cadenas independientes', () => {
    const docs = [
      cheque({ numeroCheque: 'A1', montoCentavos: 100000, renovadoPor: ['A2'], beneficiarioNormalizado: 'uno', vientriId: 1 }),
      cheque({ numeroCheque: 'A2', montoCentavos: 120000, renovacionDe: ['A1'], beneficiarioNormalizado: 'uno', vientriId: 2 }),
      cheque({ numeroCheque: 'B1', montoCentavos: 200000, renovadoPor: ['B2'], beneficiarioNormalizado: 'dos', vientriId: 3 }),
      cheque({ numeroCheque: 'B2', montoCentavos: 250000, renovacionDe: ['B1'], beneficiarioNormalizado: 'dos', vientriId: 4 }),
    ]

    const cadenas = reconstruirCadenas(docs)
    expect(cadenas).toHaveLength(2)
  })

  it('resuelve número corto en renovacionDe cuando el cheque tiene numero_completo', () => {
    const docs = [
      cheque({ numeroCheque: '020-111-2222-44000999', montoCentavos: 300000, renovadoPor: ['020-111-2222-44001111'], vientriId: 1 }),
      cheque({ numeroCheque: '020-111-2222-44001111', montoCentavos: 360000, renovacionDe: ['44000999'], vientriId: 2 }),
    ]

    const cadenas = reconstruirCadenas(docs)
    expect(cadenas).toHaveLength(1)
    expect(cadenas[0]!.cheques).toEqual(['020-111-2222-44000999', '020-111-2222-44001111'])
  })

  it('captura la operación USD de cualquier cheque de la cadena', () => {
    const docs = [
      cheque({ numeroCheque: 'U1', montoCentavos: 100000, renovadoPor: ['U2'], vientriId: 1 }),
      cheque({ numeroCheque: 'U2', montoCentavos: 120000, renovacionDe: ['U1'], operacionUsd: { montoUsd: 70000, cotizacion: 1565 }, vientriId: 2 }),
    ]

    const cadenas = reconstruirCadenas(docs)
    expect(cadenas[0]!.operacionUsd).toEqual({ montoUsd: 70000, cotizacion: 1565 })
  })
})

describe('clasificarCheques', () => {
  it('clasifica cheques en cadena como operacion_financiera con roles', () => {
    const docs = [
      cheque({ numeroCheque: 'CHQ-A', montoCentavos: 500000, renovadoPor: ['CHQ-B'], vientriId: 1 }),
      cheque({ numeroCheque: 'CHQ-B', montoCentavos: 580000, renovacionDe: ['CHQ-A'], renovadoPor: ['CHQ-C'], vientriId: 2 }),
      cheque({ numeroCheque: 'CHQ-C', montoCentavos: 670000, renovacionDe: ['CHQ-B'], vientriId: 3 }),
      cheque({ numeroCheque: 'CHQ-REAL', vientriId: 4 }),
    ]

    const cadenas = reconstruirCadenas(docs)
    const clasificados = clasificarCheques(docs, cadenas)

    const a = clasificados.find((c) => c.numeroCheque === 'CHQ-A')!
    expect(a.clasificacion).toBe('operacion_financiera')
    expect(a.rolEnCadena).toBe('capital')

    const b = clasificados.find((c) => c.numeroCheque === 'CHQ-B')!
    expect(b.clasificacion).toBe('operacion_financiera')
    expect(b.rolEnCadena).toBe('mixto')

    const c = clasificados.find((c) => c.numeroCheque === 'CHQ-C')!
    expect(c.clasificacion).toBe('operacion_financiera')
    expect(c.rolEnCadena).toBe('interes')

    const real = clasificados.find((c) => c.numeroCheque === 'CHQ-REAL')!
    expect(real.clasificacion).toBe('gasto_real')
    expect(real.rolEnCadena).toBeNull()
  })

  it('clasifica proveedor financiero sin cadena como operacion_financiera', () => {
    const docs = [
      cheque({ numeroCheque: 'FIN-1', esProveedorFinanciero: true, vientriId: 1 }),
    ]

    const clasificados = clasificarCheques(docs, [])
    expect(clasificados[0]!.clasificacion).toBe('operacion_financiera')
    expect(clasificados[0]!.cadenaId).toBeNull()
  })
})

describe('resumirCostoFinanciero', () => {
  it('agrupa por beneficiario y calcula totales', () => {
    const docs = [
      cheque({ numeroCheque: 'P1', montoCentavos: 1000000, renovadoPor: ['P2'], beneficiario: 'Presta', beneficiarioNormalizado: 'presta', vientriId: 1 }),
      cheque({ numeroCheque: 'P2', montoCentavos: 1200000, renovacionDe: ['P1'], beneficiario: 'Presta', beneficiarioNormalizado: 'presta', vientriId: 2 }),
      cheque({ numeroCheque: 'C1', montoCentavos: 2000000, renovadoPor: ['C2'], beneficiario: 'Cambia', beneficiarioNormalizado: 'cambia', vientriId: 3 }),
      cheque({ numeroCheque: 'C2', montoCentavos: 2500000, renovacionDe: ['C1'], beneficiario: 'Cambia', beneficiarioNormalizado: 'cambia', vientriId: 4 }),
    ]

    const cadenas = reconstruirCadenas(docs)
    const resumen = resumirCostoFinanciero(cadenas)

    expect(resumen.cantidadCadenas).toBe(2)
    expect(resumen.capitalTotalCentavos).toBe(3000000)
    expect(resumen.interesTotalCentavos).toBe(700000)
    expect(resumen.porBeneficiario).toHaveLength(2)
    // Ordenado por interés desc: Cambia (500k) > Presta (200k)
    expect(resumen.porBeneficiario[0]!.beneficiario).toBe('Cambia')
    expect(resumen.porBeneficiario[0]!.interesCentavos).toBe(500000)
    expect(resumen.porBeneficiario[1]!.beneficiario).toBe('Presta')
    expect(resumen.porBeneficiario[1]!.interesCentavos).toBe(200000)
  })

  it('devuelve resumen vacío sin cadenas', () => {
    const resumen = resumirCostoFinanciero([])
    expect(resumen.cantidadCadenas).toBe(0)
    expect(resumen.capitalTotalCentavos).toBe(0)
    expect(resumen.interesTotalCentavos).toBe(0)
    expect(resumen.tasaImplicitaPromedio).toBe(0)
  })
})
