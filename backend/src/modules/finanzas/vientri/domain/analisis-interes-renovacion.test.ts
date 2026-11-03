import { describe, expect, it } from 'vitest'
import type { ChequeOcasionalDoc, OperacionRenovacion } from './cheque-ocasional.types.js'
import { analizarInteresVsRenovaciones } from './analisis-interes-renovacion.js'

function doc(overrides: Partial<ChequeOcasionalDoc> = {}): ChequeOcasionalDoc {
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
    obsOriginal: '',
    revisar: [],
    fechaConciliado: null,
    proveedorFinancieroId: null,
    vientriId: 1,
    vientriChqId: null,
    baja: false,
    ...overrides,
  }
}

function op(overrides: Partial<OperacionRenovacion> = {}): OperacionRenovacion {
  return {
    id: 'renov-mana-2026-10-16',
    beneficiario: 'MANA',
    beneficiarioNormalizado: 'mana',
    fechaEmision: '2026-10-16',
    banco: '020-923-5000',
    chequesViejos: [],
    chequesNuevos: [],
    totalViejosCentavos: 1000000000,
    totalNuevosCentavos: 1100000000,
    interesCentavos: 100000000,
    fechaVtoViejos: null,
    fechaVtoNuevos: null,
    diasRenovacion: null,
    tasaImplicita: 0.1,
    tasaMensualEstimada: null,
    vinculada: true,
    tipoVinculo: 'explicito',
    obsOriginal: 'Renovacion',
    ...overrides,
  }
}

describe('analizarInteresVsRenovaciones', () => {
  it('vincula cheque interés con renovación del mismo beneficiario+fecha', () => {
    const chequeInt = doc({
      numeroCheque: '020-923-5000-99999',
      rolEnOperacion: 'interes',
      esRenovacion: false,
      montoCentavos: 50000000,
      fechaEmision: '2026-10-16',
      obsOriginal: 'Interes',
    })
    const renovacion = op({ fechaEmision: '2026-10-16' })

    const resultado = analizarInteresVsRenovaciones([chequeInt], [renovacion])

    expect(resultado.totalChequesInteres).toBe(1)
    expect(resultado.vinculados).toBe(1)
    expect(resultado.chequesInteres[0]!.match).not.toBeNull()
    expect(resultado.chequesInteres[0]!.match!.criterio).toBe('beneficiario+fecha')
  })

  it('vincula por fecha cercana (±5 días) cuando no hay exacta', () => {
    const chequeInt = doc({
      numeroCheque: '020-923-5000-99999',
      rolEnOperacion: 'interes',
      esRenovacion: false,
      montoCentavos: 50000000,
      fechaEmision: '2026-10-18',
      obsOriginal: 'int',
    })
    const renovacion = op({ fechaEmision: '2026-10-16' })

    const resultado = analizarInteresVsRenovaciones([chequeInt], [renovacion])

    expect(resultado.vinculados).toBe(1)
    expect(resultado.chequesInteres[0]!.match!.criterio).toBe('beneficiario+fecha_cercana')
  })

  it('vincula por beneficiario solo cuando no hay fecha cercana', () => {
    const chequeInt = doc({
      numeroCheque: '020-923-5000-99999',
      rolEnOperacion: 'interes',
      esRenovacion: false,
      montoCentavos: 50000000,
      fechaEmision: '2026-12-01',
      obsOriginal: 'Intereses',
    })
    const renovacion = op({ fechaEmision: '2026-10-16' })

    const resultado = analizarInteresVsRenovaciones([chequeInt], [renovacion])

    expect(resultado.vinculados).toBe(1)
    expect(resultado.chequesInteres[0]!.match!.criterio).toBe('beneficiario_solo')
  })

  it('no vincula cuando no hay renovaciones del beneficiario', () => {
    const chequeInt = doc({
      numeroCheque: '020-923-5000-99999',
      rolEnOperacion: 'interes',
      esRenovacion: false,
      beneficiario: 'POVO',
      beneficiarioNormalizado: 'povo',
      montoCentavos: 50000000,
      fechaEmision: '2026-10-16',
      obsOriginal: 'int',
    })
    const renovacion = op({ beneficiarioNormalizado: 'mana' })

    const resultado = analizarInteresVsRenovaciones([chequeInt], [renovacion])

    expect(resultado.noVinculados).toBe(1)
    expect(resultado.chequesInteres[0]!.razonNoMatch).toContain('povo')
  })

  it('ignora cheques de interés que YA son parte de renovación', () => {
    const chequeRenov = doc({
      numeroCheque: '020-923-5000-99999',
      rolEnOperacion: 'interes',
      esRenovacion: true,
      montoCentavos: 50000000,
      obsOriginal: 'int',
    })

    const resultado = analizarInteresVsRenovaciones([chequeRenov], [op()])

    expect(resultado.totalChequesInteres).toBe(0)
  })

  it('ignora cheques dados de baja', () => {
    const chequeBaja = doc({
      rolEnOperacion: 'interes',
      esRenovacion: false,
      baja: true,
      obsOriginal: 'int',
    })

    const resultado = analizarInteresVsRenovaciones([chequeBaja], [op()])

    expect(resultado.totalChequesInteres).toBe(0)
  })

  it('incluye cheques mixtos sueltos (no renovación)', () => {
    const chequeMixto = doc({
      numeroCheque: '020-923-5000-88888',
      rolEnOperacion: 'mixto',
      esRenovacion: false,
      montoCentavos: 80000000,
      fechaEmision: '2026-10-16',
      obsOriginal: 'Capital + Intereses',
    })

    const resultado = analizarInteresVsRenovaciones([chequeMixto], [op()])

    expect(resultado.totalChequesInteres).toBe(1)
    expect(resultado.vinculados).toBe(1)
  })

  it('calcula tasa implícita sobre el capital viejo', () => {
    const chequeInt = doc({
      numeroCheque: '020-923-5000-99999',
      rolEnOperacion: 'interes',
      esRenovacion: false,
      montoCentavos: 100000000, // $1M
      fechaEmision: '2026-10-16',
      obsOriginal: 'Interes',
    })
    const renovacion = op({
      totalViejosCentavos: 1000000000, // $10M
      fechaEmision: '2026-10-16',
    })

    const resultado = analizarInteresVsRenovaciones([chequeInt], [renovacion])

    expect(resultado.chequesInteres[0]!.match!.tasaImplicita).toBeCloseTo(0.1)
  })

  it('resumen agrupa por beneficiario ordenado por monto', () => {
    const docs = [
      doc({ numeroCheque: '1', rolEnOperacion: 'interes', esRenovacion: false, beneficiarioNormalizado: 'mana', montoCentavos: 80000000, obsOriginal: 'int', vientriId: 1 }),
      doc({ numeroCheque: '2', rolEnOperacion: 'interes', esRenovacion: false, beneficiarioNormalizado: 'mana', montoCentavos: 60000000, obsOriginal: 'int', vientriId: 2 }),
      doc({ numeroCheque: '3', rolEnOperacion: 'interes', esRenovacion: false, beneficiarioNormalizado: 'povo', montoCentavos: 200000000, obsOriginal: 'int', vientriId: 3 }),
    ]
    const ops = [op()]

    const resultado = analizarInteresVsRenovaciones(docs, ops)

    expect(resultado.resumen.porBeneficiario).toHaveLength(2)
    expect(resultado.resumen.porBeneficiario[0]!.beneficiario).toBe('povo')
    expect(resultado.resumen.porBeneficiario[0]!.montoCentavos).toBe(200000000)
    expect(resultado.resumen.porBeneficiario[1]!.beneficiario).toBe('mana')
    expect(resultado.resumen.porBeneficiario[1]!.cantidad).toBe(2)
  })

  it('elige la renovación más cercana cuando hay varias del mismo beneficiario', () => {
    const chequeInt = doc({
      numeroCheque: '020-923-5000-99999',
      rolEnOperacion: 'interes',
      esRenovacion: false,
      montoCentavos: 50000000,
      fechaEmision: '2026-10-18',
      obsOriginal: 'int',
    })
    const opLejana = op({ id: 'renov-lejana', fechaEmision: '2026-10-10' })
    const opCercana = op({ id: 'renov-cercana', fechaEmision: '2026-10-17' })

    const resultado = analizarInteresVsRenovaciones([chequeInt], [opLejana, opCercana])

    expect(resultado.chequesInteres[0]!.match!.operacionId).toBe('renov-cercana')
  })
})
