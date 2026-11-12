import { describe, expect, it } from 'vitest'
import { analizarARevisar } from './analisis-revisar.js'
import { chequesDeRedondeo } from './detalle-interes.js'
import type { ChequeOcasionalDoc, InteresDeRenovacion } from './cheque-ocasional.types.js'
import { REVISAR_INTERES_SIN_ORIGEN, reclasificarDoc } from './clasificar-ocasional.js'
import { basesProbadas, cuotasDelInteres } from './interes-posicion.js'
import { agruparOperacionesRenovacion } from './operacion-renovacion.js'
import { interesAparteDe } from './operaciones-del-cheque.js'
import { camposDeLaClasificacion, validarClasificacion, yaTieneTipo } from './patrones-ocasionales.js'

let siguiente = 5000
function cheque(overrides: Partial<ChequeOcasionalDoc>): ChequeOcasionalDoc {
  siguiente += 1
  return {
    numeroCheque: `020-923-5000-${siguiente}`,
    beneficiario: 'PRESTAMISTA',
    beneficiarioNormalizado: 'prestamista',
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: 100_000_00,
    fechaVencimiento: '2027-01-10',
    fechaEmision: '2026-08-01',
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
    vientriId: siguiente,
    vientriChqId: null,
    baja: false,
    ...overrides,
  } as ChequeOcasionalDoc
}

/**
 * Caso tipo MANA: el 22/09 se renueva un cheque que vencía el 25/10 por otro del mismo importe que vence el 25/01, y
 * el interés (6 % mensual sobre todo lo que vence en enero, 3 meses) sale aparte en 9 cheques iguales.
 */
function escenario() {
  const viejo = cheque({
    montoCentavos: 50_000_050_00,
    fechaEmision: '2026-08-03',
    fechaVencimiento: '2026-10-25',
    obsOriginal: 'u$70.000 TC1565',
    pagado: true,
    fechaConciliado: '2026-09-22',
  })
  const nuevo = cheque({
    montoCentavos: 50_000_050_00,
    fechaEmision: '2026-09-22',
    fechaVencimiento: '2027-01-25',
    obsOriginal: 'Renovacion cheques',
    esRenovacion: true,
    renovacionDe: [viejo.numeroCheque],
  })
  viejo.renovadoPor = [nuevo.numeroCheque]
  const enero = [
    cheque({ montoCentavos: 50_000_000_00, fechaEmision: '2026-07-13', fechaVencimiento: '2027-01-08', obsOriginal: 'u$70.000 TC1525' }),
    cheque({ montoCentavos: 50_000_000_00, fechaEmision: '2026-08-03', fechaVencimiento: '2027-01-15', obsOriginal: 'u$70.000 TC1565' }),
  ]
  const diciembre = cheque({ montoCentavos: 7_000_000_00, fechaEmision: '2026-09-01', fechaVencimiento: '2026-12-10', obsOriginal: 'Otra' })
  const vtos = ['2026-11-29', '2026-11-30', '2026-12-01', '2027-01-01', '2027-01-02', '2027-01-03', '2027-02-01', '2027-02-02', '2027-02-03']
  const intereses = vtos.map((v) =>
    cheque({
      montoCentavos: 3_000_001_00,
      fechaEmision: '2026-09-22',
      fechaVencimiento: v,
      obsOriginal: 'Intereses',
      rolEnOperacion: 'interes',
      revisar: [REVISAR_INTERES_SIN_ORIGEN],
    }),
  )
  return { viejo, nuevo, enero, diciembre, intereses, todos: [viejo, nuevo, ...enero, diciembre, ...intereses] }
}

describe('cuotasDelInteres', () => {
  it('junta los vencimientos cercanos en una cuota por mes', () => {
    const { intereses } = escenario()
    expect(cuotasDelInteres(intereses)).toEqual([
      { desde: '2026-11-29', hasta: '2026-12-01', cheques: 3, montoCentavos: 9_000_003_00 },
      { desde: '2027-01-01', hasta: '2027-01-03', cheques: 3, montoCentavos: 9_000_003_00 },
      { desde: '2027-02-01', hasta: '2027-02-03', cheques: 3, montoCentavos: 9_000_003_00 },
    ])
  })
})

describe('basesProbadas', () => {
  it('da la tasa mensual de cada base posible y solo la de enero cierra', () => {
    const { intereses, todos } = escenario()
    const bases = basesProbadas(intereses, todos)!
    expect(bases.map((b) => b.mes)).toEqual(['2026-12', '2027-01', null])
    const enero = bases.find((b) => b.mes === '2027-01')!
    expect(enero).toMatchObject({ baseCentavos: 150_000_050_00, cantidadCheques: 3, cierra: true })
    expect(enero.tasaPorcentaje).toBeCloseTo(6, 6)
    expect(bases.filter((b) => b.cierra)).toHaveLength(1)
  })
})

describe('chequesDeRedondeo', () => {
  it('acepta hasta $0,50 por cheque', () => {
    expect(chequesDeRedondeo(432, 9)).toBe(9)
    expect(chequesDeRedondeo(-450, 9)).toBe(9)
    expect(chequesDeRedondeo(500, 9)).toBeNull()
  })
})

const corto = (n: string) => n.split('-').pop()!

describe('revisión asistida: % mensual sobre lo que vence en un mes (MANA)', () => {
  it('cuenta el interés paso a paso y lo ata a la renovación del mismo día', () => {
    const { todos, intereses } = escenario()
    const grupos = analizarARevisar(todos, new Map(), agruparOperacionesRenovacion(todos))
    const g = grupos.find((x) => x.obs === 'Intereses')!
    const h = g.hipotesis.find((x) => x.tipo === 'interes_posicion')!
    expect(h.fuerza).toBe('fuerte')
    expect(h.titulo).toBe('Interés del 6% mensual, 3 meses, sobre lo que PRESTAMISTA tiene venciendo en enero de 2027')
    expect(h.cuenta).toMatchObject({ esperadoCentavos: 27_000_009_00, diferenciaCentavos: 0, redondeoCheques: 9 })
    const d = h.detalleInteres!
    expect(d).toMatchObject({ forma: 'mes_vencimiento', tasaPorcentaje: 6, porMes: true, periodos: 3, totalPagadoCentavos: 27_000_009_00 })
    expect(d.pagos).toHaveLength(3)
    expect(d.tramos).toHaveLength(1)
    expect(d.tramos[0]).toMatchObject({
      baseDescripcion: 'lo que vence en enero de 2027',
      baseCentavos: 150_000_050_00,
      tipoCuenta: 'tasa',
      renovacion: { fechaEmision: '2026-09-22', cantidadViejos: 1, vencianDesde: '2026-10-25', vencenHasta: '2027-01-25', meses: 3, interesAdentroCentavos: 0, mismoDia: true },
    })
    expect(d.tramos[0]!.lotes.find((l) => l.esRenovacion)?.obs).toBe('Renovacion cheques')
    expect(d.tramos[0]!.alternativas.filter((a) => a.cierra)).toHaveLength(1)
    expect(h.confirmar).toMatchObject({ tipo: 'rol', etiqueta: 'Confirmar como interés de la renovación del 22/09/2026' })
    const porCheque = h.confirmar!.datos.interesDePorCheque!
    expect(Object.keys(porCheque)).toEqual(intereses.map((c) => corto(c.numeroCheque)))
    expect(porCheque[corto(intereses[0]!.numeroCheque)]).toMatchObject({ fechaRenovacion: '2026-09-22', tasaPorcentaje: 6, porMes: true, meses: 3, baseCentavos: 150_000_050_00 })
    expect(g.renovacionesDelDia[0]?.diasRenovacion).toBe(92)
  })
})

/**
 * Caso tipo POVO: el 08/09 hay dos renovaciones por el mismo importe (una vence el 25/10, otra el 28/10) y el 16/10
 * se paga aparte el 8 % de cada una, en un cheque que vence el mismo día que su capital.
 */
function escenarioPovo() {
  const prov = { beneficiario: 'POVO', beneficiarioNormalizado: 'povo' }
  const viejoA = cheque({ ...prov, montoCentavos: 21_789_648_00, fechaEmision: '2026-06-08', fechaVencimiento: '2026-09-08', pagado: true, fechaConciliado: '2026-09-08', obsOriginal: 'cap A' })
  const viejoB = cheque({ ...prov, montoCentavos: 7_320_264_00, fechaEmision: '2026-06-08', fechaVencimiento: '2026-09-08', pagado: true, fechaConciliado: '2026-09-08', obsOriginal: 'cap B' })
  const nuevosA = [10_000_000_00, 11_789_648_00].map((m) =>
    cheque({ ...prov, montoCentavos: m, fechaEmision: '2026-09-08', fechaVencimiento: '2026-10-25', obsOriginal: 'Renovacion A', esRenovacion: true, renovacionDe: [viejoA.numeroCheque] }))
  const nuevoB = cheque({ ...prov, montoCentavos: 7_320_264_00, fechaEmision: '2026-09-08', fechaVencimiento: '2026-10-28', obsOriginal: 'Renovacion B', esRenovacion: true, renovacionDe: [viejoB.numeroCheque] })
  viejoA.renovadoPor = nuevosA.map((n) => n.numeroCheque)
  viejoB.renovadoPor = [nuevoB.numeroCheque]
  const intereses = [
    cheque({ ...prov, montoCentavos: 1_743_172_00, fechaEmision: '2026-10-16', fechaVencimiento: '2026-10-25', obsOriginal: 'interes', rolEnOperacion: 'interes', revisar: [REVISAR_INTERES_SIN_ORIGEN] }),
    cheque({ ...prov, montoCentavos: 585_621_00, fechaEmision: '2026-10-16', fechaVencimiento: '2026-10-28', obsOriginal: 'interes', rolEnOperacion: 'interes', revisar: [REVISAR_INTERES_SIN_ORIGEN] }),
  ]
  return { intereses, todos: [viejoA, viejoB, ...nuevosA, nuevoB, ...intereses] }
}

describe('revisión asistida: % sobre el capital que vence el mismo día (POVO)', () => {
  it('arma un tramo por operación, con la diferencia real (no copia el total)', () => {
    const { todos, intereses } = escenarioPovo()
    const grupos = analizarARevisar(todos, new Map(), agruparOperacionesRenovacion(todos))
    const g = grupos.find((x) => x.obs === 'interes')!
    const h = g.hipotesis.find((x) => x.tipo === 'interes_posicion')!
    expect(h.titulo).toBe('Interés del 8% sobre el capital que vence el mismo día, de 2 operaciones (renovaciones del 08/09/2026)')
    expect(h.fuerza).toBe('fuerte')
    const d = h.detalleInteres!
    expect(d).toMatchObject({ forma: 'mismo_vencimiento', tasaPorcentaje: 8, porMes: false, periodos: 1 })
    // 8 % exacto: $1.743.171,84 + $585.621,12 = $2.328.792,96; los cheques suman $2.328.793 → $0,04 de redondeo.
    expect(d.esperadoCentavos).toBe(2_328_792_96)
    expect(d.diferenciaCentavos).toBe(4)
    expect(d.redondeoCheques).toBe(2)
    expect(d.tramos.map((t) => [t.baseCentavos, t.esperadoCentavos, t.renovacion?.obs, t.renovacion?.mismoDia])).toEqual([
      [21_789_648_00, 1_743_171_84, 'Renovacion A', false],
      [7_320_264_00, 585_621_12, 'Renovacion B', false],
    ])
    expect(h.confirmar?.etiqueta).toBe('Confirmar como interés de las renovaciones del 08/09/2026')
    const porCheque = h.confirmar!.datos.interesDePorCheque!
    expect(porCheque[corto(intereses[0]!.numeroCheque)]).toMatchObject({ obsRenovacion: 'Renovacion A', tasaPorcentaje: 8, porMes: false })
    expect(porCheque[corto(intereses[1]!.numeroCheque)]).toMatchObject({ obsRenovacion: 'Renovacion B' })
  })

  it('al confirmar, cada renovación muestra solo el interés de su cheque', () => {
    const { todos, intereses } = escenarioPovo()
    const ops = agruparOperacionesRenovacion(todos)
    const g = analizarARevisar(todos, new Map(), ops).find((x) => x.obs === 'interes')!
    const datos = g.hipotesis.find((x) => x.tipo === 'interes_posicion')!.confirmar!.datos
    const confirmados = todos.map((d) => (intereses.includes(d) ? { ...d, ...camposDeLaClasificacion('rol', datos, d.numeroCheque) } : d))
    const opA = ops.find((o) => o.obsOriginal === 'Renovacion A')!
    const opB = ops.find((o) => o.obsOriginal === 'Renovacion B')!
    expect(interesAparteDe(opA, confirmados)).toMatchObject({ cantidadCheques: 1, totalCentavos: 1_743_172_00, tasaPorcentaje: 8 })
    expect(interesAparteDe(opB, confirmados)).toMatchObject({ cantidadCheques: 1, totalCentavos: 585_621_00 })
    // Ya confirmado: no se vuelve a ofrecer.
    const despues = analizarARevisar(confirmados, new Map(), ops).find((x) => x.obs === 'interes')
    expect(despues?.hipotesis.find((x) => x.tipo === 'interes_posicion')?.confirmar ?? null).toBeNull()
  })
})

describe('confirmar el interés de una renovación', () => {
  const interesDe: InteresDeRenovacion = {
    fechaRenovacion: '2026-09-22',
    obsRenovacion: 'Renovacion cheques',
    tasaPorcentaje: 6,
    porMes: true,
    meses: 3,
    baseCentavos: 150_000_050_00,
    baseDescripcion: 'lo que vence en enero de 2027',
  }

  it('valida y guarda la operación de cada cheque, también en cheques que ya decían "interés"', () => {
    const v = validarClasificacion('rol', { rol: 'interes', interesDePorCheque: { '020-923-5000-40074148': interesDe } }, 'Intereses')
    expect(v).toEqual({ ok: true, datos: { rol: 'interes', interesDePorCheque: { '40074148': interesDe } } })
    if (!v.ok) return
    expect(camposDeLaClasificacion('rol', v.datos, '020-923-5000-40074148')).toEqual({ rolEnOperacion: 'interes', interesDe })
    expect(camposDeLaClasificacion('rol', v.datos, '020-923-5000-99999999')).toEqual({ rolEnOperacion: 'interes' })
    const yaInteres = cheque({ numeroCheque: '020-923-5000-40074148', rolEnOperacion: 'interes' })
    expect(yaTieneTipo(yaInteres, 'rol')).toBe(true)
    expect(yaTieneTipo(yaInteres, 'rol', v.datos)).toBe(false)
  })

  it('rechaza un capital asociado a una renovación o una tasa inválida', () => {
    expect(validarClasificacion('rol', { rol: 'capital', interesDePorCheque: { '40074148': interesDe } }, '').ok).toBe(false)
    expect(validarClasificacion('rol', { rol: 'interes', interesDePorCheque: { '40074148': { ...interesDe, tasaPorcentaje: 0 } } }, '').ok).toBe(false)
  })

  it('con el interés asociado deja de estar "sin operación de origen"', () => {
    const doc = cheque({ rolEnOperacion: 'interes', obsOriginal: 'Intereses', revisar: [REVISAR_INTERES_SIN_ORIGEN], interesDe })
    expect(reclasificarDoc(doc, new Map([['prestamista', { id: 'p1' }]])).revisar).toEqual([])
  })

  it('la renovación muestra el interés que se pagó aparte', () => {
    const { todos, intereses } = escenario()
    const conInteres = todos.map((d) => (intereses.includes(d) ? { ...d, interesDe } : d))
    const op = agruparOperacionesRenovacion(conInteres).find((o) => o.fechaEmision === '2026-09-22')!
    expect(op.interesCentavos).toBe(0)
    const aparte = interesAparteDe(op, conInteres)!
    expect(aparte).toMatchObject({
      cantidadCheques: 9,
      totalCentavos: 27_000_009_00,
      tasaPorcentaje: 6,
      porMes: true,
      meses: 3,
      baseDescripcion: 'lo que vence en enero de 2027',
    })
    expect(aparte.cheques).toHaveLength(9)
    expect(aparte.cheques.reduce((s, c) => s + c.montoCentavos, 0)).toBe(27_000_009_00)
  })
})

describe('revisión asistida: la misma cuenta por dos caminos', () => {
  it('"lo que vence el mismo día" y "% de los nuevos de la renovación" sobre los mismos cheques se muestra una sola vez', () => {
    // Caso tipo MANA 16/10/2026: la renovación del 08/09 ya trae 8 % adentro y el 16/10 se paga otro 8 % aparte.
    const prov = { beneficiario: 'MANA', beneficiarioNormalizado: 'mana' }
    const viejo = cheque({ ...prov, montoCentavos: 14_405_843_00, fechaEmision: '2026-06-08', fechaVencimiento: '2026-08-26', pagado: true, fechaConciliado: '2026-09-08', obsOriginal: 'cap' })
    const nuevo = cheque({ ...prov, montoCentavos: 15_558_311_00, fechaEmision: '2026-09-08', fechaVencimiento: '2026-10-27', obsOriginal: 'Renovacion cheques', esRenovacion: true, renovacionDe: [viejo.numeroCheque] })
    viejo.renovadoPor = [nuevo.numeroCheque]
    const interes = cheque({ ...prov, montoCentavos: 1_244_665_00, fechaEmision: '2026-10-16', fechaVencimiento: '2026-10-27', obsOriginal: 'Interes', rolEnOperacion: 'interes', revisar: [REVISAR_INTERES_SIN_ORIGEN] })
    const todos = [viejo, nuevo, interes]
    const g = analizarARevisar(todos, new Map(), agruparOperacionesRenovacion(todos)).find((x) => x.obs === 'Interes')!
    const conDetalle = g.hipotesis.filter((h) => h.detalleInteres)
    expect(conDetalle).toHaveLength(1)
    expect(conDetalle[0]).toMatchObject({ tipo: 'interes_posicion', fuerza: 'fuerte' })
  })
})
