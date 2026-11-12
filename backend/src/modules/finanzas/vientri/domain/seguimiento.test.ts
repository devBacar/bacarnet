import { describe, expect, it } from 'vitest'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import { armarSeguimiento, construirSeguimiento, estadoOperacion } from './seguimiento.js'

function doc(overrides: Partial<ChequeOcasionalDoc>): ChequeOcasionalDoc {
  return {
    numeroCheque: '',
    beneficiario: 'JULIO',
    beneficiarioNormalizado: 'julio',
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: 100_000_00,
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

/** Número físico de 8 dígitos en el mismo banco: num(929) → 020-923-5000-00000929 */
const num = (n: number) => `020-923-5000-${String(n).padStart(8, '0')}`
const corto = (n: number) => String(n).padStart(8, '0')

describe('construirSeguimiento', () => {
  it('caso Julio: Op1 (3 viejos → 5 nuevos) y Op2 (929 → 2 nuevos)', () => {
    const viejos = [676, 677, 678].map((n) =>
      doc({ numeroCheque: num(n), pagado: true, fechaEmision: '2026-01-01', fechaVencimiento: '2026-04-01', obsOriginal: 'previo' }),
    )
    const nuevosOp1 = [
      // 929 se renueva en Op2 (aparece como viejo ahí)
      doc({ numeroCheque: num(929), pagado: true, esRenovacion: true, renovacionDe: viejos.map((v) => corto(Number(v.numeroCheque.slice(-8)))), fechaEmision: '2026-04-01', fechaVencimiento: '2026-04-29' }),
      doc({ numeroCheque: num(930), pagado: false, esRenovacion: true, renovacionDe: ['00000676', '00000677', '00000678'], fechaEmision: '2026-04-01', fechaVencimiento: '2026-06-01' }),
      doc({ numeroCheque: num(931), pagado: false, esRenovacion: true, renovacionDe: ['00000676', '00000677', '00000678'], fechaEmision: '2026-04-01', fechaVencimiento: '2026-06-01' }),
      doc({ numeroCheque: num(932), pagado: true, esRenovacion: true, renovacionDe: ['00000676', '00000677', '00000678'], fechaEmision: '2026-04-01', fechaVencimiento: '2026-05-01' }),
      doc({ numeroCheque: num(933), pagado: true, esRenovacion: true, renovacionDe: ['00000676', '00000677', '00000678'], fechaEmision: '2026-04-01', fechaVencimiento: '2026-05-01' }),
    ]
    const nuevosOp2 = [
      doc({ numeroCheque: num(84), pagado: false, esRenovacion: true, renovacionDe: ['00000929'], fechaEmision: '2026-04-29', fechaVencimiento: '2026-07-01' }),
      doc({ numeroCheque: num(85), pagado: true, esRenovacion: true, renovacionDe: ['00000929'], fechaEmision: '2026-04-29', fechaVencimiento: '2026-05-29' }),
    ]

    const ops = construirSeguimiento([...viejos, ...nuevosOp1, ...nuevosOp2])
    expect(ops).toHaveLength(2)

    const op1 = ops.find((o) => o.fechaEmision === '2026-04-01')!
    const op2 = ops.find((o) => o.fechaEmision === '2026-04-29')!

    expect(op1.id).toBe('renov-julio-2026-04-01-020-923-5000')
    expect(op2.id).toBe('renov-julio-2026-04-29-020-923-5000')

    const estados1 = Object.fromEntries(op1.chequesNuevos.map((c) => [c.numeroCheque.slice(-3), c.estado]))
    expect(estados1).toEqual({ '929': 'renovado', '930': 'pendiente', '931': 'pendiente', '932': 'debitado', '933': 'debitado' })
    expect(op1.chequesNuevos.find((c) => c.numeroCheque === num(929))!.operacionSiguienteId).toBe(op2.id)
    expect(op1.operacionesAnterioresIds).toEqual([])

    const estados2 = Object.fromEntries(op2.chequesNuevos.map((c) => [c.numeroCheque.slice(-3), c.estado]))
    expect(estados2).toEqual({ '084': 'pendiente', '085': 'debitado' })
    expect(op2.operacionesAnterioresIds).toEqual([op1.id])

    // Exposición = solo pendientes (930 + 931 en Op1, 084 en Op2)
    expect(op1.exposicionCentavos).toBe(2 * 100_000_00)
    expect(op2.exposicionCentavos).toBe(100_000_00)
    expect(op1.fechaVtoMax).toBe('2026-06-01')

    // Con pendientes sigue abierta aunque el vencimiento ya haya pasado
    expect(estadoOperacion(op1, '2026-12-01')).toBe('abierta')
    expect(estadoOperacion(op2, '2026-12-01')).toBe('abierta')
  })

  it('caso sin vínculo: nuevo sin viejos ni IDs queda sin cadena', () => {
    const ops = construirSeguimiento([
      doc({ numeroCheque: num(500), pagado: false, esRenovacion: true, fechaEmision: '2026-05-01', fechaVencimiento: '2026-08-01' }),
    ])
    expect(ops).toHaveLength(1)
    expect(ops[0]!.vinculada).toBe(false)
    expect(ops[0]!.operacionesAnterioresIds).toEqual([])
    expect(ops[0]!.chequesNuevos[0]!.estado).toBe('pendiente')
    expect(ops[0]!.chequesNuevos[0]!.operacionSiguienteId).toBeNull()
    expect(ops[0]!.origenRevisar).toBe(false)
  })

  it('renovación armada a mano desde "A revisar" queda marcada', () => {
    const ops = construirSeguimiento([
      doc({
        numeroCheque: num(501),
        pagado: false,
        esRenovacion: true,
        fechaEmision: '2026-05-01',
        fechaVencimiento: '2026-08-01',
        clasificacionManual: { tipo: 'renovacion', uid: 'u1', fecha: '2026-11-06T10:00:00.000Z' },
      }),
    ])
    expect(ops[0]!.origenRevisar).toBe(true)
  })

  it('cadena A→B→C: cada op apunta solo a la anterior inmediata', () => {
    const base = doc({ numeroCheque: num(1), pagado: true, fechaEmision: '2026-01-01', fechaVencimiento: '2026-02-01', obsOriginal: 'origen' })
    const a = doc({ numeroCheque: num(2), pagado: true, esRenovacion: true, renovacionDe: [corto(1)], fechaEmision: '2026-02-01', fechaVencimiento: '2026-03-01' })
    const b = doc({ numeroCheque: num(3), pagado: true, esRenovacion: true, renovacionDe: [corto(2)], fechaEmision: '2026-03-01', fechaVencimiento: '2026-04-01' })
    const c = doc({ numeroCheque: num(4), pagado: false, esRenovacion: true, renovacionDe: [corto(3)], fechaEmision: '2026-04-01', fechaVencimiento: '2026-05-01' })

    const ops = construirSeguimiento([base, a, b, c])
    expect(ops).toHaveLength(3)
    const opA = ops.find((o) => o.fechaEmision === '2026-02-01')!
    const opB = ops.find((o) => o.fechaEmision === '2026-03-01')!
    const opC = ops.find((o) => o.fechaEmision === '2026-04-01')!

    expect(opA.operacionesAnterioresIds).toEqual([])
    expect(opB.operacionesAnterioresIds).toEqual([opA.id])
    expect(opC.operacionesAnterioresIds).toEqual([opB.id])

    expect(opA.chequesNuevos[0]!.estado).toBe('renovado')
    expect(opB.chequesNuevos[0]!.estado).toBe('renovado')
    expect(opC.chequesNuevos[0]!.estado).toBe('pendiente')

    expect(estadoOperacion(opA, '2026-12-01')).toBe('cerrada')
    expect(estadoOperacion(opB, '2026-12-01')).toBe('cerrada')
    expect(estadoOperacion(opC, '2026-12-01')).toBe('abierta')
  })

  it('rechazado cuenta en exposición; anulado no; baja se excluye', () => {
    const viejo = doc({ numeroCheque: num(10), pagado: true, fechaEmision: '2026-01-01', fechaVencimiento: '2026-02-01', obsOriginal: 'origen' })
    const nuevos = [
      doc({ numeroCheque: num(11), esRenovacion: true, renovacionDe: [corto(10)], fechaEmision: '2026-02-01', fechaVencimiento: '2026-03-01', estadoCodigo: 3 }),
      doc({ numeroCheque: num(12), esRenovacion: true, renovacionDe: [corto(10)], fechaEmision: '2026-02-01', fechaVencimiento: '2026-03-01', estadoCodigo: 9 }),
      doc({ numeroCheque: num(13), esRenovacion: true, renovacionDe: [corto(10)], fechaEmision: '2026-02-01', fechaVencimiento: '2026-03-01', baja: true }),
      doc({ numeroCheque: num(14), esRenovacion: true, renovacionDe: [corto(10)], fechaEmision: '2026-02-01', fechaVencimiento: '2026-03-01', pagado: true }),
    ]
    const ops = construirSeguimiento([viejo, ...nuevos])
    expect(ops).toHaveLength(1)
    const op = ops[0]!

    expect(op.chequesNuevos.map((c) => c.numeroCheque)).not.toContain(num(13))
    const est = Object.fromEntries(op.chequesNuevos.map((c) => [c.numeroCheque.slice(-2), c.estado]))
    expect(est).toEqual({ '11': 'rechazado', '12': 'anulado', '14': 'debitado' })
    expect(op.exposicionCentavos).toBe(100_000_00) // solo el rechazado
    expect(estadoOperacion(op, '2026-12-01')).toBe('abierta') // el rechazado mantiene abierta
  })

  it('estadoCodigo 5 sin op siguiente igual cuenta como renovado', () => {
    const ops = construirSeguimiento([
      doc({ numeroCheque: num(20), esRenovacion: true, fechaEmision: '2026-05-01', fechaVencimiento: '2026-06-01', estadoCodigo: 5 }),
    ])
    expect(ops[0]!.chequesNuevos[0]!.estado).toBe('renovado')
    expect(ops[0]!.chequesNuevos[0]!.operacionSiguienteId).toBeNull()
  })

  describe('estadoOperacion', () => {
    const cheque = (estado: 'debitado' | 'pendiente') => ({
      numeroCheque: 'x', montoCentavos: 1, fechaVencimiento: '2026-06-01', fechaEmision: null,
      rol: null, pagado: estado === 'debitado', estado, operacionSiguienteId: null,
    })

    it('cerrada: todos resueltos y vencimiento anterior a hoy', () => {
      expect(estadoOperacion({ chequesNuevos: [cheque('debitado')], fechaVtoMax: '2026-06-01' }, '2026-06-02')).toBe('cerrada')
    })
    it('abierta: todos resueltos pero vencimiento no anterior a hoy', () => {
      expect(estadoOperacion({ chequesNuevos: [cheque('debitado')], fechaVtoMax: '2026-06-01' }, '2026-06-01')).toBe('abierta')
    })
    it('abierta: hay pendiente aunque haya vencido', () => {
      expect(estadoOperacion({ chequesNuevos: [cheque('debitado'), cheque('pendiente')], fechaVtoMax: '2026-06-01' }, '2026-12-01')).toBe('abierta')
    })
  })

  it('ids repetidos en un mismo grupo reciben sufijo -2', () => {
    const viejoA = doc({ numeroCheque: num(30), pagado: true, fechaEmision: '2026-01-01', fechaVencimiento: '2026-02-01', obsOriginal: 'a' })
    const viejoB = doc({ numeroCheque: num(31), pagado: true, fechaEmision: '2026-01-01', fechaVencimiento: '2026-02-01', obsOriginal: 'b' })
    const nuevoA = doc({ numeroCheque: num(32), esRenovacion: true, renovacionDe: [corto(30)], fechaEmision: '2026-02-01', fechaVencimiento: '2026-03-01' })
    const nuevoB = doc({ numeroCheque: num(33), esRenovacion: true, renovacionDe: [corto(31)], fechaEmision: '2026-02-01', fechaVencimiento: '2026-03-01' })

    const ops = construirSeguimiento([viejoA, viejoB, nuevoA, nuevoB])
    const ids = ops.map((o) => o.id).sort()
    expect(ids).toEqual([
      'renov-julio-2026-02-01-020-923-5000',
      'renov-julio-2026-02-01-020-923-5000-2',
    ])
  })
})

describe('armarSeguimiento', () => {
  const viejo = doc({ numeroCheque: num(1), pagado: true, fechaEmision: '2026-01-01', fechaVencimiento: '2026-02-01', obsOriginal: 'origen' })
  const a = doc({ numeroCheque: num(2), pagado: true, esRenovacion: true, renovacionDe: [corto(1)], fechaEmision: '2026-02-01', fechaVencimiento: '2026-03-01' })
  const b = doc({ numeroCheque: num(3), pagado: true, esRenovacion: true, renovacionDe: [corto(2)], fechaEmision: '2026-03-01', fechaVencimiento: '2026-04-01' })
  const c = doc({ numeroCheque: num(4), pagado: false, esRenovacion: true, renovacionDe: [corto(3)], fechaEmision: '2026-04-01', fechaVencimiento: '2026-05-01' })
  const ops = construirSeguimiento([viejo, a, b, c])

  it('abiertas: solo la op vigente, con ancestros transitivos del más cercano al más lejano', () => {
    const r = armarSeguimiento(ops, '2026-12-01', 'abiertas')
    expect(r.estado).toBe('abiertas')
    expect(r.beneficiarios).toHaveLength(1)
    const [opC] = r.beneficiarios[0]!.operaciones
    expect(r.beneficiarios[0]!.operaciones).toHaveLength(1)
    expect(opC!.estadoOperacion).toBe('abierta')

    const opA = ops.find((o) => o.fechaEmision === '2026-02-01')!
    const opB = ops.find((o) => o.fechaEmision === '2026-03-01')!
    expect(opC!.ancestrosIds).toEqual([opB.id, opA.id])
    expect(r.ancestros.map((x) => x.id).sort()).toEqual([opA.id, opB.id].sort())
    expect(r.ancestros.every((x) => x.estadoOperacion === 'cerrada')).toBe(true)

    expect(r.beneficiarios[0]!.posicionesAbiertas).toBe(1)
    expect(r.beneficiarios[0]!.exposicionCentavos).toBe(100_000_00)
    expect(r.totales.beneficiarios).toBe(1)
    expect(r.totales.operaciones).toBe(1)
    expect(r.totales.posicionesAbiertas).toBe(1)
    expect(r.totales.exposicionCentavos).toBe(100_000_00)
    expect(r.totales.vencidosCantidad).toBe(1)
    expect(r.totales.vencidosCentavos).toBe(100_000_00)
    expect(r.totales.profundidadMaxCadena).toBe(2)
  })

  it('todas: incluye las cerradas y no repite ancestros', () => {
    const r = armarSeguimiento(ops, '2026-12-01', 'todas')
    expect(r.beneficiarios[0]!.operaciones).toHaveLength(3)
    expect(r.ancestros).toEqual([])
    expect(r.totales.operaciones).toBe(3)
    expect(r.totales.exposicionCentavos).toBe(100_000_00)
  })

  it('agrupa nombres compatibles (HNA CLAUDIA + HERMANA CLAUDIA) y cuenta rechazados', () => {
    const hna = doc({ numeroCheque: num(50), beneficiario: 'HNA CLAUDIA', beneficiarioNormalizado: 'hna claudia', esRenovacion: true, fechaEmision: '2026-05-01', fechaVencimiento: '2026-08-01' })
    const hermana = doc({ numeroCheque: num(60), beneficiario: 'HERMANA CLAUDIA', beneficiarioNormalizado: 'hermana claudia', esRenovacion: true, fechaEmision: '2026-06-01', fechaVencimiento: '2026-09-01', estadoCodigo: 3 })
    const otro = doc({ numeroCheque: num(70), beneficiario: 'POVO', beneficiarioNormalizado: 'povo', esRenovacion: true, fechaEmision: '2026-06-01', fechaVencimiento: '2026-09-01' })

    const r = armarSeguimiento(construirSeguimiento([hna, hermana, otro]), '2026-07-01', 'abiertas')
    expect(r.beneficiarios).toHaveLength(2)
    const claudia = r.beneficiarios.find((g) => g.beneficiarioNormalizado.includes('claudia'))!
    expect(claudia.operaciones).toHaveLength(2)
    expect(claudia.posicionesAbiertas).toBe(2)
    expect(claudia.rechazadas).toBe(1)
    expect(claudia.exposicionCentavos).toBe(200_000_00)
  })

  it('con el catálogo, junta las formas de escribir un proveedor y lo muestra con su nombre', () => {
    const gonzales = doc({ numeroCheque: num(80), beneficiario: 'GONZALES FABIAN', beneficiarioNormalizado: 'gonzales fabian', esRenovacion: true, fechaEmision: '2026-05-01', fechaVencimiento: '2026-08-01' })
    const gonzalez = doc({ numeroCheque: num(90), beneficiario: 'GONZALEZ F', beneficiarioNormalizado: 'gonzalez f', esRenovacion: true, fechaEmision: '2026-06-01', fechaVencimiento: '2026-09-01' })
    const catalogo = new Map([
      ['gonzales fabian', { id: 'provfin-gonzalez', nombre: 'GONZALEZ FABIAN' }],
      ['gonzalez f', { id: 'provfin-gonzalez', nombre: 'GONZALEZ FABIAN' }],
    ])

    const r = armarSeguimiento(construirSeguimiento([gonzales, gonzalez]), '2026-07-01', 'abiertas', catalogo)
    expect(r.beneficiarios).toHaveLength(1)
    expect(r.beneficiarios[0]!.beneficiario).toBe('GONZALEZ FABIAN')
    expect(r.beneficiarios[0]!.proveedorId).toBe('provfin-gonzalez')
    expect(r.beneficiarios[0]!.operaciones).toHaveLength(2)
  })

  it('marca la operación que renueva cheques de otro proveedor (POVO 20/02/2026 renueva cheques de MANA)', () => {
    const mana = [700, 701].map((n) =>
      doc({ numeroCheque: num(n), beneficiario: 'MANA', beneficiarioNormalizado: 'mana', montoCentavos: 2_780_000_00, pagado: true, fechaEmision: '2026-01-30', fechaVencimiento: '2026-02-14', obsOriginal: 'Op' }),
    )
    const propio = doc({ numeroCheque: num(702), beneficiario: 'POVO', beneficiarioNormalizado: 'povo', montoCentavos: 1_000_000_00, pagado: true, fechaEmision: '2026-01-30', fechaVencimiento: '2026-02-14', obsOriginal: 'Op' })
    const nuevo = doc({
      numeroCheque: num(800),
      beneficiario: 'POVO',
      beneficiarioNormalizado: 'povo',
      montoCentavos: 7_000_000_00,
      esRenovacion: true,
      renovacionDe: ['00000700', '00000701', '00000702'],
      fechaEmision: '2026-02-20',
      fechaVencimiento: '2026-08-14',
    })
    const catalogo = new Map([
      ['mana', { id: 'provfin-mana', nombre: 'MANA' }],
      ['povo', { id: 'provfin-povo', nombre: 'POVO' }],
    ])
    const r = armarSeguimiento(construirSeguimiento([...mana, propio, nuevo]), '2026-07-01', 'abiertas', catalogo)
    const op = r.beneficiarios[0]!.operaciones[0]!
    expect(op.viejosDeOtroBeneficiario).toEqual([{ beneficiario: 'MANA', cantidadCheques: 2, montoCentavos: 5_560_000_00 }])
  })

  it('trae el interés que la renovación pagó aparte (confirmado), con sus cheques y su estado', () => {
    // Renovación del 22/09 con cheques nuevos por el mismo importe; el interés sale aparte en 2 cheques.
    const viejo = doc({ numeroCheque: num(720), pagado: true, fechaEmision: '2026-07-01', fechaVencimiento: '2026-09-22', obsOriginal: 'Op' })
    const nuevo = doc({ numeroCheque: num(820), esRenovacion: true, renovacionDe: ['00000720'], fechaEmision: '2026-09-22', fechaVencimiento: '2027-01-22', obsOriginal: 'Renovacion cheques 720' })
    const interesDe = { fechaRenovacion: '2026-09-22', obsRenovacion: 'Renovacion cheques 720', tasaPorcentaje: 6, porMes: true, meses: 3, baseCentavos: 100_000_00, baseDescripcion: 'lo que vence en enero de 2027' }
    const intereses = [
      doc({ numeroCheque: num(901), montoCentavos: 9_000_00, rolEnOperacion: 'interes', fechaEmision: '2026-09-22', fechaVencimiento: '2026-11-22', obsOriginal: 'Intereses', interesDe }),
      doc({ numeroCheque: num(900), montoCentavos: 9_000_00, rolEnOperacion: 'interes', pagado: true, fechaEmision: '2026-09-22', fechaVencimiento: '2026-10-22', obsOriginal: 'Intereses', interesDe }),
      // Otro proveedor con la misma fecha y OBS: no es de esta renovación.
      doc({ numeroCheque: num(902), beneficiario: 'POVO', beneficiarioNormalizado: 'povo', montoCentavos: 5_000_00, fechaEmision: '2026-09-22', obsOriginal: 'Intereses', interesDe }),
    ]
    const r = armarSeguimiento(construirSeguimiento([viejo, nuevo]), '2026-10-01', 'abiertas', new Map(), intereses)
    const op = r.beneficiarios[0]!.operaciones[0]!
    expect(op.interesCentavos).toBe(0)
    expect(op.interesAparte).toMatchObject({ cantidadCheques: 2, totalCentavos: 18_000_00, tasaPorcentaje: 6, porMes: true, meses: 3, baseCentavos: 100_000_00 })
    expect(op.interesAparte!.cheques.map((c) => [c.numeroCheque, c.estado])).toEqual([
      [num(900), 'debitado'],
      [num(901), 'pendiente'],
    ])
    // Sin cheques de interés confirmados, no hay interés aparte.
    expect(armarSeguimiento(construirSeguimiento([viejo, nuevo]), '2026-10-01', 'abiertas').beneficiarios[0]!.operaciones[0]!.interesAparte).toBeNull()
  })

  it('no marca alias del mismo proveedor ni operaciones guardadas sin el beneficiario de los viejos', () => {
    const viejo = doc({ numeroCheque: num(710), beneficiario: 'GONZALES FABIAN', beneficiarioNormalizado: 'gonzales fabian', pagado: true, fechaEmision: '2026-04-01', fechaVencimiento: '2026-05-01', obsOriginal: 'Op' })
    const nuevo = doc({ numeroCheque: num(810), beneficiario: 'GONZALEZ F', beneficiarioNormalizado: 'gonzalez f', esRenovacion: true, renovacionDe: ['00000710'], fechaEmision: '2026-05-01', fechaVencimiento: '2026-08-01' })
    const catalogo = new Map([
      ['gonzales fabian', { id: 'provfin-gonzalez', nombre: 'GONZALEZ FABIAN' }],
      ['gonzalez f', { id: 'provfin-gonzalez', nombre: 'GONZALEZ FABIAN' }],
    ])
    const ops = construirSeguimiento([viejo, nuevo])
    expect(armarSeguimiento(ops, '2026-07-01', 'abiertas', catalogo).beneficiarios[0]!.operaciones[0]!.viejosDeOtroBeneficiario).toEqual([])
    // Una forma de escribirlo que falta en el catálogo tampoco cuenta como otro si los nombres se parecen.
    const conFabian = construirSeguimiento([viejo, { ...nuevo, beneficiario: 'GONZALEZ FABIAN', beneficiarioNormalizado: 'gonzalez fabian' }])
    const soloUno = new Map([['gonzalez fabian', { id: 'provfin-gonzalez', nombre: 'GONZALEZ FABIAN' }]])
    expect(armarSeguimiento(conFabian, '2026-07-01', 'abiertas', soloUno).beneficiarios[0]!.operaciones[0]!.viejosDeOtroBeneficiario).toEqual([])
    const viejas = ops.map((o) => ({ ...o, chequesViejos: o.chequesViejos.map(({ beneficiario: _b, beneficiarioNormalizado: _n, ...c }) => c) }))
    expect(armarSeguimiento(viejas, '2026-07-01', 'abiertas').beneficiarios[0]!.operaciones[0]!.viejosDeOtroBeneficiario).toEqual([])
  })

  it('dos proveedores distintos del catálogo no se juntan aunque los nombres se parezcan', () => {
    const a = doc({ numeroCheque: num(110), beneficiario: 'CLAUDIA PEREZ', beneficiarioNormalizado: 'claudia perez', esRenovacion: true, fechaEmision: '2026-05-01', fechaVencimiento: '2026-08-01' })
    const b = doc({ numeroCheque: num(120), beneficiario: 'CLAUDIA RUIZ', beneficiarioNormalizado: 'claudia ruiz', esRenovacion: true, fechaEmision: '2026-06-01', fechaVencimiento: '2026-09-01' })
    const catalogo = new Map([
      ['claudia perez', { id: 'provfin-perez', nombre: 'CLAUDIA PEREZ' }],
      ['claudia ruiz', { id: 'provfin-ruiz', nombre: 'CLAUDIA RUIZ' }],
    ])

    const r = armarSeguimiento(construirSeguimiento([a, b]), '2026-07-01', 'abiertas', catalogo)
    expect(r.beneficiarios).toHaveLength(2)
  })

  it('KPIs: vencidos, por vencer y concentración', () => {
    const docs = [
      doc({ numeroCheque: num(100), esRenovacion: true, fechaEmision: '2026-05-01', fechaVencimiento: '2026-06-01', beneficiario: 'ALFA', beneficiarioNormalizado: 'alfa', montoCentavos: 500_000_00 }),
      doc({ numeroCheque: num(101), esRenovacion: true, fechaEmision: '2026-05-01', fechaVencimiento: '2026-06-10', beneficiario: 'ALFA', beneficiarioNormalizado: 'alfa', montoCentavos: 300_000_00 }),
      doc({ numeroCheque: num(102), esRenovacion: true, fechaEmision: '2026-05-01', fechaVencimiento: '2026-06-25', beneficiario: 'ALFA', beneficiarioNormalizado: 'alfa', montoCentavos: 200_000_00 }),
      doc({ numeroCheque: num(103), esRenovacion: true, fechaEmision: '2026-05-01', fechaVencimiento: '2026-07-20', beneficiario: 'BETA', beneficiarioNormalizado: 'beta', montoCentavos: 100_000_00 }),
    ]
    const ops = construirSeguimiento(docs)
    const r = armarSeguimiento(ops, '2026-06-05', 'abiertas')

    expect(r.totales.vencidosCantidad).toBe(1)
    expect(r.totales.vencidosCentavos).toBe(500_000_00)
    expect(r.totales.porVencer7d).toBe(1)
    expect(r.totales.porVencer15d).toBe(1)
    expect(r.totales.porVencer30d).toBe(2)
    expect(r.totales.profundidadMaxCadena).toBe(0)
    expect(r.totales.concentracionTopPct).toBeCloseTo(90.91, 1)
  })
})