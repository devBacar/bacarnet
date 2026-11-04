import { describe, expect, it } from 'vitest'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import { agruparOperacionesRenovacion } from './operacion-renovacion.js'

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

describe('agruparOperacionesRenovacion', () => {
  it('caso HERMANA CLAUDIA: 4 viejos int+cap → 4 nuevos Renovacion', () => {
    const viejos = [
      doc({ numeroCheque: '020-923-5000-39584794', montoCentavos: 126226600, fechaEmision: '2026-03-11', fechaVencimiento: '2026-06-10', beneficiario: 'HERMANA CLAU', beneficiarioNormalizado: 'hermana clau', rolEnOperacion: 'mixto', obsOriginal: 'int+cap', estadoCodigo: 5 }),
      doc({ numeroCheque: '020-923-5000-39584795', montoCentavos: 600000000, fechaEmision: '2026-03-11', fechaVencimiento: '2026-06-10', beneficiario: 'HERMANA CLAU', beneficiarioNormalizado: 'hermana clau', rolEnOperacion: 'mixto', obsOriginal: 'int+cap', estadoCodigo: 5 }),
      doc({ numeroCheque: '020-923-5000-39584796', montoCentavos: 600000000, fechaEmision: '2026-03-11', fechaVencimiento: '2026-06-10', beneficiario: 'HERMANA CLAU', beneficiarioNormalizado: 'hermana clau', rolEnOperacion: 'mixto', obsOriginal: 'int+cap', estadoCodigo: 5 }),
      doc({ numeroCheque: '020-923-5000-39584797', montoCentavos: 603236600, fechaEmision: '2026-03-11', fechaVencimiento: '2026-06-10', beneficiario: 'HERMANA CLAU', beneficiarioNormalizado: 'hermana clau', rolEnOperacion: 'mixto', obsOriginal: 'int+cap', estadoCodigo: 5 }),
    ]
    const nuevos = [
      doc({ numeroCheque: '020-923-5000-39585362', montoCentavos: 600000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'HERMANA CLAU', beneficiarioNormalizado: 'hermana clau', esRenovacion: true, renovacionDe: ['39584794', '39584795', '39584796', '39584797'], rolEnOperacion: 'capital', obsOriginal: 'Renovacion' }),
      doc({ numeroCheque: '020-923-5000-39585363', montoCentavos: 600000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'HERMANA CLAU', beneficiarioNormalizado: 'hermana clau', esRenovacion: true, renovacionDe: ['39584794', '39584795', '39584796', '39584797'], rolEnOperacion: 'capital', obsOriginal: 'Renovacion' }),
      doc({ numeroCheque: '020-923-5000-39585364', montoCentavos: 729463200, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'HERMANA CLAU', beneficiarioNormalizado: 'hermana clau', esRenovacion: true, renovacionDe: ['39584794', '39584795', '39584796', '39584797'], rolEnOperacion: 'capital', obsOriginal: 'Renovacion' }),
      doc({ numeroCheque: '020-923-5000-39585367', montoCentavos: 135062400, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'HERMANA CLAU', beneficiarioNormalizado: 'hermana clau', esRenovacion: true, renovacionDe: ['39584794', '39584795', '39584796', '39584797'], rolEnOperacion: 'capital', obsOriginal: 'Renovacion' }),
    ]

    const ops = agruparOperacionesRenovacion([...viejos, ...nuevos])
    expect(ops).toHaveLength(1)

    const op = ops[0]!
    expect(op.beneficiarioNormalizado).toBe('hermana clau')
    expect(op.chequesNuevos).toHaveLength(4)
    expect(op.chequesViejos).toHaveLength(4)
    expect(op.totalViejosCentavos).toBe(1929463200) // $19.294.632
    expect(op.totalNuevosCentavos).toBe(2064525600) // $20.645.256
    expect(op.interesCentavos).toBe(135062400) // $1.350.624
    expect(op.vinculada).toBe(true)
    expect(op.tipoVinculo).toBe('explicito')
    expect(op.fechaVtoViejos).toBe('2026-06-10')
    expect(op.fechaVtoNuevos).toBe('2026-09-10')
    expect(op.diasRenovacion).toBe(92)
    expect(op.tasaImplicita).toBeCloseTo(0.07, 2) // ~7%
    expect(op.tasaMensualEstimada).toBeCloseTo(0.023, 2) // ~2.3% mensual
  })

  it('caso sin IDs: MANA Renovacion sin vincular', () => {
    const nuevos = [
      doc({ numeroCheque: '020-923-5000-39316625', montoCentavos: 328058200, fechaEmision: '2026-09-23', fechaVencimiento: '2026-10-23', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', esRenovacion: true, renovacionDe: [], rolEnOperacion: 'capital', obsOriginal: 'Renovacion' }),
      doc({ numeroCheque: '020-923-5000-40074051', montoCentavos: 328058200, fechaEmision: '2026-09-23', fechaVencimiento: '2026-10-23', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', esRenovacion: true, renovacionDe: [], rolEnOperacion: 'capital', obsOriginal: 'Renovacion' }),
      doc({ numeroCheque: '020-923-5000-40074052', montoCentavos: 328058200, fechaEmision: '2026-09-23', fechaVencimiento: '2026-10-23', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', esRenovacion: true, renovacionDe: [], rolEnOperacion: 'capital', obsOriginal: 'Renovacion' }),
    ]

    const ops = agruparOperacionesRenovacion(nuevos)
    expect(ops).toHaveLength(1)

    const op = ops[0]!
    expect(op.beneficiarioNormalizado).toBe('mana')
    expect(op.chequesNuevos).toHaveLength(3)
    expect(op.chequesViejos).toHaveLength(0)
    expect(op.vinculada).toBe(false)
    expect(op.tipoVinculo).toBe('implicito')
    expect(op.interesCentavos).toBe(0)
    expect(op.tasaImplicita).toBe(0)
  })

  it('separa operaciones de distintos beneficiarios en misma fecha', () => {
    const docs1 = [
      doc({ numeroCheque: '020-923-5000-11111', montoCentavos: 100000, fechaEmision: '2026-09-23', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', esRenovacion: true, renovacionDe: [] }),
      doc({ numeroCheque: '020-923-5000-22222', montoCentavos: 200000, fechaEmision: '2026-09-23', beneficiario: 'DAVALOS', beneficiarioNormalizado: 'davalos', esRenovacion: true, renovacionDe: [] }),
    ]

    const ops = agruparOperacionesRenovacion(docs1)
    expect(ops).toHaveLength(2)
    const beneficiarios = ops.map(o => o.beneficiarioNormalizado).sort()
    expect(beneficiarios).toEqual(['davalos', 'mana'])
  })

  it('agrupa capital e interés del mismo beneficiario+fecha+banco', () => {
    const viejo = doc({ numeroCheque: '020-923-5000-10000', montoCentavos: 500000000, fechaEmision: '2026-01-01', fechaVencimiento: '2026-06-10', beneficiario: 'DAVALOS', beneficiarioNormalizado: 'davalos' })
    const capital = doc({ numeroCheque: '020-923-5000-20001', montoCentavos: 500000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'DAVALOS', beneficiarioNormalizado: 'davalos', esRenovacion: true, renovacionDe: ['10000'], rolEnOperacion: 'capital', obsOriginal: 'Renovacion' })
    const interes = doc({ numeroCheque: '020-923-5000-20002', montoCentavos: 35000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'DAVALOS', beneficiarioNormalizado: 'davalos', esRenovacion: true, renovacionDe: ['10000'], rolEnOperacion: 'interes', obsOriginal: 'int' })

    const ops = agruparOperacionesRenovacion([viejo, capital, interes])
    expect(ops).toHaveLength(1)

    const op = ops[0]!
    expect(op.chequesNuevos).toHaveLength(2)
    expect(op.chequesViejos).toHaveLength(1)
    expect(op.totalViejosCentavos).toBe(500000000)
    expect(op.totalNuevosCentavos).toBe(535000000)
    expect(op.interesCentavos).toBe(35000000) // $350.000
    expect(op.vinculada).toBe(true)
    expect(op.tipoVinculo).toBe('explicito')
    expect(op.diasRenovacion).toBe(92)
    expect(op.tasaMensualEstimada).toBeCloseTo(0.07 / 92 * 30, 3)
  })

  it('no incluye cheques que no son renovación', () => {
    const regular = doc({ numeroCheque: '020-923-5000-99999', montoCentavos: 100000, fechaEmision: '2026-06-10', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', esRenovacion: false })
    const ops = agruparOperacionesRenovacion([regular])
    expect(ops).toHaveLength(0)
  })

  it('auto-vincula por banco+vto+beneficiario compatible cuando no hay IDs', () => {
    const viejos = [
      doc({ numeroCheque: '020-923-5000-39584794', montoCentavos: 600000000, fechaEmision: '2026-03-11', fechaVencimiento: '2026-06-10', beneficiario: 'HERMANA CLAU', beneficiarioNormalizado: 'hermana clau', pagado: true, estadoCodigo: 7, obsOriginal: 'Renovacion' }),
      doc({ numeroCheque: '020-923-5000-39584795', montoCentavos: 600000000, fechaEmision: '2026-03-11', fechaVencimiento: '2026-06-10', beneficiario: 'HERMANA CLAU', beneficiarioNormalizado: 'hermana clau', pagado: true, estadoCodigo: 7, obsOriginal: 'Renovacion' }),
    ]
    const nuevos = [
      doc({ numeroCheque: '020-923-5000-39585362', montoCentavos: 700000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'HERMANA CLAUDIA', beneficiarioNormalizado: 'hermana claudia', esRenovacion: true, renovacionDe: [], rolEnOperacion: 'capital', obsOriginal: 'Renovacion' }),
      doc({ numeroCheque: '020-923-5000-39585363', montoCentavos: 700000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'HERMANA CLAUDIA', beneficiarioNormalizado: 'hermana claudia', esRenovacion: true, renovacionDe: [], rolEnOperacion: 'capital', obsOriginal: 'Renovacion' }),
    ]

    const ops = agruparOperacionesRenovacion([...viejos, ...nuevos])
    expect(ops).toHaveLength(1)

    const op = ops[0]!
    expect(op.vinculada).toBe(true)
    expect(op.tipoVinculo).toBe('implicito')
    expect(op.chequesViejos).toHaveLength(2)
    expect(op.chequesNuevos).toHaveLength(2)
    expect(op.totalViejosCentavos).toBe(1200000000)
    expect(op.totalNuevosCentavos).toBe(1400000000)
    expect(op.interesCentavos).toBe(200000000)
  })

  it('auto-vincula HNA ↔ HERMANA por palabra compartida "claudia"', () => {
    const viejos = [
      doc({ numeroCheque: '020-923-5000-39585362', montoCentavos: 600000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'HERMANA CLAUDIA', beneficiarioNormalizado: 'hermana claudia', pagado: true, estadoCodigo: 7, obsOriginal: 'Renovacion' }),
    ]
    const nuevos = [
      doc({ numeroCheque: '020-923-5000-39316563', montoCentavos: 650000000, fechaEmision: '2026-09-10', fechaVencimiento: '2026-12-10', beneficiario: 'HNA CLAUDIA', beneficiarioNormalizado: 'hna claudia', esRenovacion: true, renovacionDe: [], rolEnOperacion: 'capital', obsOriginal: 'Renovacion' }),
    ]

    const ops = agruparOperacionesRenovacion([...viejos, ...nuevos])
    expect(ops).toHaveLength(1)
    expect(ops[0]!.vinculada).toBe(true)
    expect(ops[0]!.tipoVinculo).toBe('implicito')
    expect(ops[0]!.chequesViejos).toHaveLength(1)
  })

  it('auto-vinculación no reutiliza viejos entre operaciones distintas', () => {
    const viejo = doc({ numeroCheque: '020-923-5000-10000', montoCentavos: 500000000, fechaEmision: '2026-01-01', fechaVencimiento: '2026-06-10', beneficiario: 'DAVALOS', beneficiarioNormalizado: 'davalos', pagado: true, estadoCodigo: 7, obsOriginal: 'Renovacion' })
    const nuevo1 = doc({ numeroCheque: '020-923-5000-20001', montoCentavos: 300000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'DAVALOS', beneficiarioNormalizado: 'davalos', esRenovacion: true, renovacionDe: ['10000'], rolEnOperacion: 'capital' })
    const nuevo2 = doc({ numeroCheque: '020-923-5000-30001', montoCentavos: 300000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'DAVALOS', beneficiarioNormalizado: 'davalos', esRenovacion: true, renovacionDe: [], rolEnOperacion: 'capital' })

    const ops = agruparOperacionesRenovacion([viejo, nuevo1, nuevo2])
    // nuevo1 y nuevo2 tienen misma clave de grupo, se agrupan juntos
    // El viejo se vincula por ID de nuevo1
    expect(ops).toHaveLength(1)
    expect(ops[0]!.chequesViejos).toHaveLength(1)
    expect(ops[0]!.vinculada).toBe(true)
  })

  it('caso MANA: descarta op USD por montos absurdos, vincula op Renovacion con ±1 día', () => {
    // Op USD (emitida 08/03): 1 cheque vto 22/10, $5.95M — total no cuadra con $25M nuevos
    const viejoUsd = doc({ numeroCheque: '020-923-5000-39316312', montoCentavos: 595000000, fechaEmision: '2026-08-03', fechaVencimiento: '2026-10-22', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', pagado: true, estadoCodigo: 7, obsOriginal: 'u$70.000 TC1565' })
    // Op Renovacion (emitida 23/09): 7 cheques vto 23/10, $3.28M c/u = $22.96M — cuadra
    const viejosRenov = Array.from({ length: 7 }, (_, i) =>
      doc({ numeroCheque: `020-923-5000-4007405${i}`, montoCentavos: 328058200, fechaEmision: '2026-09-23', fechaVencimiento: '2026-10-23', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', pagado: true, estadoCodigo: 7, obsOriginal: 'Renovacion' })
    )
    // Nuevos: emitidos 22/10, total $25.08M
    const nuevos = Array.from({ length: 3 }, (_, i) =>
      doc({ numeroCheque: `020-923-5000-4007417${i}`, montoCentavos: 354302800, fechaEmision: '2026-10-22', fechaVencimiento: '2026-11-22', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', esRenovacion: true, renovacionDe: [], rolEnOperacion: 'capital', obsOriginal: 'Renovacion' })
    )
    const nuevos2 = Array.from({ length: 8 }, (_, i) =>
      doc({ numeroCheque: `020-923-5000-4007418${i}`, montoCentavos: 180650700, fechaEmision: '2026-10-22', fechaVencimiento: '2026-11-30', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', esRenovacion: true, renovacionDe: [], rolEnOperacion: 'capital', obsOriginal: 'Renovacion' })
    )

    const ops = agruparOperacionesRenovacion([viejoUsd, ...viejosRenov, ...nuevos, ...nuevos2])
    expect(ops).toHaveLength(1)

    const op = ops[0]!
    expect(op.vinculada).toBe(true)
    expect(op.tipoVinculo).toBe('implicito')
    expect(op.chequesViejos).toHaveLength(7) // los 7 de Renovacion, no el 1 de USD
    expect(op.totalViejosCentavos).toBe(328058200 * 7)
  })

  it('auto-vincula por fechaConciliado del viejo = fechaEmision del nuevo', () => {
    const viejos = [
      doc({ numeroCheque: '020-923-5000-30001', montoCentavos: 500000000, fechaEmision: '2026-03-01', fechaVencimiento: '2026-06-01', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', pagado: true, fechaConciliado: '2026-06-10', obsOriginal: 'cap' }),
      doc({ numeroCheque: '020-923-5000-30002', montoCentavos: 500000000, fechaEmision: '2026-03-01', fechaVencimiento: '2026-06-01', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', pagado: true, fechaConciliado: '2026-06-10', obsOriginal: 'cap' }),
    ]
    const nuevos = [
      doc({ numeroCheque: '020-923-5000-40001', montoCentavos: 550000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', esRenovacion: true, renovacionDe: [], rolEnOperacion: 'capital', obsOriginal: 'Renovacion' }),
      doc({ numeroCheque: '020-923-5000-40002', montoCentavos: 550000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', esRenovacion: true, renovacionDe: [], rolEnOperacion: 'capital', obsOriginal: 'Renovacion' }),
    ]

    const ops = agruparOperacionesRenovacion([...viejos, ...nuevos])
    expect(ops).toHaveLength(1)
    const op = ops[0]!
    expect(op.vinculada).toBe(true)
    expect(op.tipoVinculo).toBe('implicito')
    expect(op.chequesViejos).toHaveLength(2)
    expect(op.totalViejosCentavos).toBe(1000000000)
    expect(op.totalNuevosCentavos).toBe(1100000000)
    expect(op.interesCentavos).toBe(100000000)
  })

  it('fechaConciliado tiene prioridad sobre fechaVencimiento', () => {
    // Viejo con fechaConciliado que matchea, otro con fechaVto que matchea pero sin conciliado
    const viejoConciliado = doc({ numeroCheque: '020-923-5000-30001', montoCentavos: 500000000, fechaEmision: '2026-03-01', fechaVencimiento: '2026-05-15', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', pagado: true, fechaConciliado: '2026-06-10', obsOriginal: 'cap' })
    const viejoVto = doc({ numeroCheque: '020-923-5000-30002', montoCentavos: 500000000, fechaEmision: '2026-03-01', fechaVencimiento: '2026-06-10', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', pagado: true, fechaConciliado: null, obsOriginal: 'cap' })
    const nuevo = doc({ numeroCheque: '020-923-5000-40001', montoCentavos: 550000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', esRenovacion: true, renovacionDe: [], rolEnOperacion: 'capital', obsOriginal: 'Renovacion' })

    const ops = agruparOperacionesRenovacion([viejoConciliado, viejoVto, nuevo])
    expect(ops).toHaveLength(1)
    const op = ops[0]!
    expect(op.vinculada).toBe(true)
    // Debe vincular el de fechaConciliado, no el de fechaVto
    expect(op.chequesViejos).toHaveLength(1)
    expect(op.chequesViejos[0]!.numeroCheque).toBe('020-923-5000-30001')
  })

  it('auto-vincula por fechaConciliado con tolerancia ±1 día', () => {
    const viejo = doc({ numeroCheque: '020-923-5000-30001', montoCentavos: 500000000, fechaEmision: '2026-03-01', fechaVencimiento: '2026-05-15', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', pagado: true, fechaConciliado: '2026-06-11', obsOriginal: 'cap' })
    const nuevo = doc({ numeroCheque: '020-923-5000-40001', montoCentavos: 530000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', esRenovacion: true, renovacionDe: [], rolEnOperacion: 'capital', obsOriginal: 'Renovacion' })

    const ops = agruparOperacionesRenovacion([viejo, nuevo])
    expect(ops).toHaveLength(1)
    expect(ops[0]!.vinculada).toBe(true)
    expect(ops[0]!.chequesViejos).toHaveLength(1)
  })

  it('auto-vincula cross-bank (5000 ↔ 5010) por bancos equivalentes', () => {
    const viejo = doc({ numeroCheque: '020-923-5000-30001', montoCentavos: 500000000, fechaEmision: '2026-03-01', fechaVencimiento: '2026-05-15', beneficiario: 'POVO', beneficiarioNormalizado: 'povo', pagado: true, fechaConciliado: '2026-06-10', obsOriginal: 'cap' })
    const nuevo = doc({ numeroCheque: '020-923-5010-40001', montoCentavos: 530000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'POVO', beneficiarioNormalizado: 'povo', esRenovacion: true, renovacionDe: [], rolEnOperacion: 'capital', obsOriginal: 'Renovacion' })

    const ops = agruparOperacionesRenovacion([viejo, nuevo])
    expect(ops).toHaveLength(1)
    expect(ops[0]!.vinculada).toBe(true)
    expect(ops[0]!.chequesViejos).toHaveLength(1)
    expect(ops[0]!.chequesViejos[0]!.numeroCheque).toBe('020-923-5000-30001')
  })

  it('no vincula bancos distintos que no son equivalentes', () => {
    const viejo = doc({ numeroCheque: '011-500-3000-30001', montoCentavos: 500000000, fechaEmision: '2026-03-01', fechaVencimiento: '2026-05-15', beneficiario: 'TEST', beneficiarioNormalizado: 'test', pagado: true, fechaConciliado: '2026-06-10', obsOriginal: 'cap' })
    const nuevo = doc({ numeroCheque: '020-923-5000-40001', montoCentavos: 530000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'TEST', beneficiarioNormalizado: 'test', esRenovacion: true, renovacionDe: [], rolEnOperacion: 'capital', obsOriginal: 'Renovacion' })

    const ops = agruparOperacionesRenovacion([viejo, nuevo])
    expect(ops).toHaveLength(1)
    expect(ops[0]!.vinculada).toBe(false)
  })

  it('auto-vincula cheque viejo de CHQ regular (sintético) por fechaConciliado', () => {
    const viejoChq = doc({
      numeroCheque: '020-923-5000-88001',
      montoCentavos: 300000000,
      fechaEmision: '2026-01-15',
      fechaVencimiento: '2026-04-15',
      beneficiario: 'MAHUM DIEGO',
      beneficiarioNormalizado: 'mahum diego',
      pagado: true,
      fechaConciliado: '2026-06-10',
      obsOriginal: '',
      vientriId: 0,
    })
    const nuevoChqoca = doc({
      numeroCheque: '020-923-5000-99001',
      montoCentavos: 318000000,
      fechaEmision: '2026-06-10',
      fechaVencimiento: '2026-09-10',
      beneficiario: 'MAHUM DIEGO',
      beneficiarioNormalizado: 'mahum diego',
      esRenovacion: true,
      renovacionDe: [],
      rolEnOperacion: 'capital',
      obsOriginal: 'Renovacion',
    })

    const ops = agruparOperacionesRenovacion([viejoChq, nuevoChqoca])
    expect(ops).toHaveLength(1)
    expect(ops[0]!.vinculada).toBe(true)
    expect(ops[0]!.tipoVinculo).toBe('implicito')
    expect(ops[0]!.chequesViejos).toHaveLength(1)
    expect(ops[0]!.chequesViejos[0]!.numeroCheque).toBe('020-923-5000-88001')
  })

  it('cadena A→B→C: cheque renovación pagado es origen de otra renovación', () => {
    // B: renovación de A, ya pagada y conciliada
    const b = doc({
      numeroCheque: '020-923-5010-39585362',
      montoCentavos: 600000000,
      fechaEmision: '2026-06-10',
      fechaVencimiento: '2026-09-10',
      beneficiario: 'HERMANA CLAUDIA',
      beneficiarioNormalizado: 'hermana claudia',
      esRenovacion: true,
      pagado: true,
      fechaConciliado: '2026-09-11',
      obsOriginal: 'Renovacion',
    })
    // C: nueva renovación de B, con nombre distinto (HNA vs HERMANA)
    const c = doc({
      numeroCheque: '020-923-5000-39316563',
      montoCentavos: 650000000,
      fechaEmision: '2026-09-10',
      fechaVencimiento: '2026-12-10',
      beneficiario: 'HNA CLAUDIA',
      beneficiarioNormalizado: 'hna claudia',
      esRenovacion: true,
      renovacionDe: [],
      obsOriginal: 'Renovacion',
    })

    const ops = agruparOperacionesRenovacion([b, c])
    // B genera su propia operación (sin viejos en este test), C se vincula a B
    const opC = ops.find(o => o.beneficiarioNormalizado === 'hna claudia')!
    expect(opC).toBeDefined()
    expect(opC.vinculada).toBe(true)
    expect(opC.tipoVinculo).toBe('implicito')
    expect(opC.chequesViejos).toHaveLength(1)
    expect(opC.chequesViejos[0]!.numeroCheque).toBe('020-923-5010-39585362')
    expect(opC.interesCentavos).toBe(50000000)
  })

  it('excluye cheque intruso con conciliado cercano pero vto lejano', () => {
    // 3 cheques viejos con vto=15/06 y conc=10/06 → legítimos origen
    // 1 cheque intruso con vto=01/06 y conc=11/06 → pagado tarde, no es parte de esta renovación
    const v1 = doc({ numeroCheque: '020-923-5000-30001', montoCentavos: 500000000, fechaEmision: '2026-03-01', fechaVencimiento: '2026-06-15', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', pagado: true, fechaConciliado: '2026-06-10', obsOriginal: 'Renovacion' })
    const v2 = doc({ numeroCheque: '020-923-5000-30002', montoCentavos: 500000000, fechaEmision: '2026-03-01', fechaVencimiento: '2026-06-15', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', pagado: true, fechaConciliado: '2026-06-10', obsOriginal: 'Renovacion' })
    const v3 = doc({ numeroCheque: '020-923-5000-30003', montoCentavos: 500000000, fechaEmision: '2026-03-01', fechaVencimiento: '2026-06-15', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', pagado: true, fechaConciliado: '2026-06-10', obsOriginal: 'Renovacion' })
    // Intruso: mismo beneficiario, misma emisión, conc cercano, pero vto lejano
    const intruso = doc({ numeroCheque: '020-923-5000-30099', montoCentavos: 400000000, fechaEmision: '2026-03-01', fechaVencimiento: '2026-06-01', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', pagado: true, fechaConciliado: '2026-06-11', obsOriginal: 'Renovacion' })
    // Nuevos: total > 3 viejos (interés 9.3%), pero < 4 viejos (negativo)
    const n1 = doc({ numeroCheque: '020-923-5010-40001', montoCentavos: 820000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', esRenovacion: true, renovacionDe: [], obsOriginal: 'Renovacion' })
    const n2 = doc({ numeroCheque: '020-923-5010-40002', montoCentavos: 820000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', esRenovacion: true, renovacionDe: [], obsOriginal: 'Renovacion' })

    const ops = agruparOperacionesRenovacion([v1, v2, v3, intruso, n1, n2])
    const op = ops.find(o => o.chequesNuevos.some(c => c.numeroCheque === '020-923-5010-40001'))!
    expect(op).toBeDefined()
    expect(op.vinculada).toBe(true)
    expect(op.chequesViejos).toHaveLength(3)
    expect(op.chequesViejos.map(c => c.numeroCheque).sort()).toEqual([
      '020-923-5000-30001', '020-923-5000-30002', '020-923-5000-30003',
    ])
    expect(op.interesCentavos).toBe(140000000)
  })

  it('cross-operación: junta candidatos de distintas operaciones origen', () => {
    // 2 cheques viejos de una operación (obs A, em 08-25) y 2 de otra (obs B, em 09-10),
    // todos pagados el mismo día. Ninguna operación sola alcanza, pero juntas sí.
    const v1 = doc({ numeroCheque: '020-923-5000-30010', montoCentavos: 300000000, fechaEmision: '2026-08-25', fechaVencimiento: '2026-10-12', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', pagado: true, fechaConciliado: '2026-10-16', obsOriginal: 'Renovacion cheque A' })
    const v2 = doc({ numeroCheque: '020-923-5000-30011', montoCentavos: 300000000, fechaEmision: '2026-08-25', fechaVencimiento: '2026-10-12', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', pagado: true, fechaConciliado: '2026-10-16', obsOriginal: 'Renovacion cheque A' })
    const v3 = doc({ numeroCheque: '020-923-5000-30020', montoCentavos: 250000000, fechaEmision: '2026-09-10', fechaVencimiento: '2026-10-16', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', pagado: true, fechaConciliado: '2026-10-16', obsOriginal: 'Renovacion cheque B' })
    const v4 = doc({ numeroCheque: '020-923-5000-30021', montoCentavos: 250000000, fechaEmision: '2026-09-10', fechaVencimiento: '2026-10-16', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', pagado: true, fechaConciliado: '2026-10-16', obsOriginal: 'Renovacion cheque B' })
    // Nuevos: $12M sobre $11M viejos → ~9% interés
    const n1 = doc({ numeroCheque: '020-923-5010-40010', montoCentavos: 600000000, fechaEmision: '2026-10-16', fechaVencimiento: '2026-12-16', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', esRenovacion: true, renovacionDe: [], obsOriginal: 'Renovacion' })
    const n2 = doc({ numeroCheque: '020-923-5010-40011', montoCentavos: 600000000, fechaEmision: '2026-10-16', fechaVencimiento: '2026-12-16', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', esRenovacion: true, renovacionDe: [], obsOriginal: 'Renovacion' })

    const ops = agruparOperacionesRenovacion([v1, v2, v3, v4, n1, n2])
    const op = ops.find(o => o.chequesNuevos.some(c => c.numeroCheque === '020-923-5010-40010'))!
    expect(op).toBeDefined()
    expect(op.vinculada).toBe(true)
    expect(op.tipoVinculo).toBe('implicito')
    expect(op.chequesViejos).toHaveLength(4)
    expect(op.interesCentavos).toBe(100000000)
  })

  it('sub-divide grupo cuando renovacionDe son disjuntos (caso POVO)', () => {
    // Op A: 2 viejos (100, 101) → 2 nuevos (200, 201) con OBS explícita
    const vA1 = doc({ numeroCheque: '020-923-5000-100', montoCentavos: 300000000, fechaEmision: '2026-07-13', fechaVencimiento: '2026-07-27', beneficiario: 'POVO', beneficiarioNormalizado: 'povo', pagado: true, obsOriginal: 'int+cap' })
    const vA2 = doc({ numeroCheque: '020-923-5000-101', montoCentavos: 300000000, fechaEmision: '2026-07-13', fechaVencimiento: '2026-07-27', beneficiario: 'POVO', beneficiarioNormalizado: 'povo', pagado: true, obsOriginal: 'int+cap' })
    const nA1 = doc({ numeroCheque: '020-923-5000-200', montoCentavos: 320000000, fechaEmision: '2026-08-03', fechaVencimiento: '2026-08-26', beneficiario: 'POVO', beneficiarioNormalizado: 'povo', esRenovacion: true, renovacionDe: ['100', '101'], obsOriginal: 'Renovacion 100/101' })
    const nA2 = doc({ numeroCheque: '020-923-5000-201', montoCentavos: 320000000, fechaEmision: '2026-08-03', fechaVencimiento: '2026-08-26', beneficiario: 'POVO', beneficiarioNormalizado: 'povo', esRenovacion: true, renovacionDe: ['100', '101'], obsOriginal: 'Renovacion 100/101' })

    // Op B: 1 viejo (150) → 2 nuevos (202, 203) con OBS distinta, misma fecha/beneficiario/banco
    const vB1 = doc({ numeroCheque: '020-923-5000-150', montoCentavos: 500000000, fechaEmision: '2026-07-13', fechaVencimiento: '2026-07-30', beneficiario: 'POVO', beneficiarioNormalizado: 'povo', pagado: true, obsOriginal: 'int+cap' })
    const nB1 = doc({ numeroCheque: '020-923-5000-202', montoCentavos: 270000000, fechaEmision: '2026-08-03', fechaVencimiento: '2026-08-29', beneficiario: 'POVO', beneficiarioNormalizado: 'povo', esRenovacion: true, renovacionDe: ['150'], obsOriginal: 'Renovacion 150' })
    const nB2 = doc({ numeroCheque: '020-923-5000-203', montoCentavos: 270000000, fechaEmision: '2026-08-03', fechaVencimiento: '2026-08-29', beneficiario: 'POVO', beneficiarioNormalizado: 'povo', esRenovacion: true, renovacionDe: ['150'], obsOriginal: 'Renovacion 150' })

    const ops = agruparOperacionesRenovacion([vA1, vA2, vB1, nA1, nA2, nB1, nB2])

    // Deben ser 2 operaciones separadas, no 1 mezclada
    expect(ops).toHaveLength(2)

    const opA = ops.find(o => o.chequesViejos.some(c => c.numeroCheque.endsWith('100')))!
    expect(opA).toBeDefined()
    expect(opA.chequesViejos).toHaveLength(2)
    expect(opA.chequesNuevos).toHaveLength(2)
    expect(opA.totalViejosCentavos).toBe(600000000)
    expect(opA.totalNuevosCentavos).toBe(640000000)

    const opB = ops.find(o => o.chequesViejos.some(c => c.numeroCheque.endsWith('150')))!
    expect(opB).toBeDefined()
    expect(opB.chequesViejos).toHaveLength(1)
    expect(opB.chequesNuevos).toHaveLength(2)
    expect(opB.totalViejosCentavos).toBe(500000000)
    expect(opB.totalNuevosCentavos).toBe(540000000)
  })

  it('descarta auto-vínculo si interés implícito > 50%', () => {
    // 1 viejo de $5M, nuevos de $25M = 400% interés → no vincular
    const viejo = doc({ numeroCheque: '020-923-5000-10000', montoCentavos: 500000000, fechaEmision: '2026-01-01', fechaVencimiento: '2026-06-10', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', pagado: true, obsOriginal: 'Renovacion' })
    const nuevos = Array.from({ length: 5 }, (_, i) =>
      doc({ numeroCheque: `020-923-5000-2000${i}`, montoCentavos: 500000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'MANA', beneficiarioNormalizado: 'mana', esRenovacion: true, renovacionDe: [], rolEnOperacion: 'capital', obsOriginal: 'Renovacion' })
    )

    const ops = agruparOperacionesRenovacion([viejo, ...nuevos])
    expect(ops).toHaveLength(1)
    expect(ops[0]!.vinculada).toBe(false)
    expect(ops[0]!.chequesViejos).toHaveLength(0)
  })

  describe('explícitas antes que implícitas', () => {
    // V1 lo nombra por número la operación A (banco 5000). La operación B (banco 5010, sin IDs)
    // también "encaja" con V1 por beneficiario, banco equivalente y fechas: si B se procesara primero
    // se quedaría con V1 y A lo usaría igual, duplicado.
    const viejo = doc({ numeroCheque: '020-923-5000-10000', montoCentavos: 500000000, fechaEmision: '2026-03-01', fechaVencimiento: '2026-06-10', beneficiario: 'DAVALOS', beneficiarioNormalizado: 'davalos', pagado: true, fechaConciliado: '2026-06-10', obsOriginal: 'cap' })
    const explicita = doc({ numeroCheque: '020-923-5000-20001', montoCentavos: 520000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'DAVALOS', beneficiarioNormalizado: 'davalos', esRenovacion: true, renovacionDe: ['10000'], rolEnOperacion: 'capital', obsOriginal: 'Renovacion 10000' })
    const implicita = doc({ numeroCheque: '020-923-5010-30001', montoCentavos: 530000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', beneficiario: 'DAVALOS', beneficiarioNormalizado: 'davalos', esRenovacion: true, renovacionDe: [], rolEnOperacion: 'capital', obsOriginal: 'Renovacion' })

    function resumen(docs: ChequeOcasionalDoc[]) {
      return agruparOperacionesRenovacion(docs)
        .map((o) => ({
          nuevos: o.chequesNuevos.map((c) => c.numeroCheque).sort(),
          viejos: o.chequesViejos.map((c) => c.numeroCheque).sort(),
          tipoVinculo: o.tipoVinculo,
        }))
        .sort((a, b) => a.nuevos[0]!.localeCompare(b.nuevos[0]!))
    }

    it('la implícita no se lleva un viejo que una explícita ya nombró, aunque venga primero', () => {
      const ops = agruparOperacionesRenovacion([viejo, implicita, explicita])
      const opExplicita = ops.find((o) => o.chequesNuevos.some((c) => c.numeroCheque === explicita.numeroCheque))!
      const opImplicita = ops.find((o) => o.chequesNuevos.some((c) => c.numeroCheque === implicita.numeroCheque))!

      expect(opExplicita.chequesViejos.map((c) => c.numeroCheque)).toEqual([viejo.numeroCheque])
      expect(opImplicita.chequesViejos).toHaveLength(0)
      expect(opImplicita.vinculada).toBe(false)
    })

    it('el resultado no depende del orden en que llegan los docs', () => {
      const adelante = resumen([viejo, explicita, implicita])
      const atras = resumen([implicita, explicita, viejo])
      const mezclado = resumen([explicita, viejo, implicita])
      expect(atras).toEqual(adelante)
      expect(mezclado).toEqual(adelante)
    })
  })
})
