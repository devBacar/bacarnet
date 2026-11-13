import { describe, expect, it } from 'vitest'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import { armarOperacionesIniciales, detectarDesgloseInicial } from './operacion-inicial.js'
import { agruparOperacionesRenovacion } from './operacion-renovacion.js'
import { armarSeguimiento, construirSeguimiento } from './seguimiento.js'

function doc(overrides: Partial<ChequeOcasionalDoc>): ChequeOcasionalDoc {
  return {
    numeroCheque: '',
    beneficiario: 'MAHUM DIEGO',
    beneficiarioNormalizado: 'mahum diego',
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
    vientriId: 1,
    vientriChqId: null,
    baja: false,
    ...overrides,
  }
}

const num = (n: number) => `020-923-5000-${String(n).padStart(8, '0')}`
const corto = (n: number) => String(n).padStart(8, '0')

const iniciales = (docs: ChequeOcasionalDoc[]) => armarOperacionesIniciales(docs, agruparOperacionesRenovacion(docs))

describe('armarOperacionesIniciales', () => {
  it('"INTERESES Y CAP" emitidos juntos son una operación inicial, con todos sus cheques', () => {
    const cheques = [1, 2, 3].map((n) =>
      doc({ numeroCheque: num(n), fechaEmision: '2026-09-04', fechaVencimiento: `2026-12-2${n}`, obsOriginal: 'INTERESES Y CAP', rolEnOperacion: 'mixto' }),
    )
    const ops = iniciales(cheques)
    expect(ops).toHaveLength(1)
    expect(ops[0]!.tipo).toBe('inicial')
    expect(ops[0]!.chequesViejos).toEqual([])
    expect(ops[0]!.chequesNuevos.map((c) => c.numeroCheque)).toEqual([num(1), num(2), num(3)])
    expect(ops[0]!.totalNuevosCentavos).toBe(300_000_00)
    expect(ops[0]!.banco).toBe('020-923-5000')
    expect(ops[0]!.vinculada).toBe(false)
  })

  it('OBS distinto el mismo día va en operaciones separadas', () => {
    const ops = iniciales([
      doc({ numeroCheque: num(1), fechaEmision: '2026-09-04', obsOriginal: 'Capital', rolEnOperacion: 'capital' }),
      doc({ numeroCheque: num(2), fechaEmision: '2026-09-04', obsOriginal: 'INTERESES Y CAP', rolEnOperacion: 'mixto' }),
    ])
    expect(ops).toHaveLength(2)
  })

  it('sin capital en el OBS y sin renovar no es operación inicial; tampoco interés solo, compra de IVA ni otros pagos', () => {
    const ops = iniciales([
      doc({ numeroCheque: num(1), fechaEmision: '2026-09-04', obsOriginal: 'algo' }),
      doc({ numeroCheque: num(2), fechaEmision: '2026-09-04', obsOriginal: 'Intereses', rolEnOperacion: 'interes' }),
      doc({ numeroCheque: num(3), fechaEmision: '2026-09-04', obsOriginal: 'capital iva', rolEnOperacion: 'capital', esCompraIva: true }),
      doc({ numeroCheque: num(4), fechaEmision: '2026-09-04', obsOriginal: 'capital', rolEnOperacion: 'capital', beneficiario: 'CAVAZZA', beneficiarioNormalizado: 'cavazza' }),
      doc({ numeroCheque: num(5), fechaEmision: '2026-09-04', obsOriginal: 'capital', rolEnOperacion: 'capital', baja: true }),
    ])
    expect(ops).toEqual([])
  })

  it('cheques viejos de una renovación son operación inicial aunque el OBS esté vacío; el cheque nuevo no entra', () => {
    const viejo = doc({ numeroCheque: num(10), pagado: true, fechaEmision: '2026-06-01', fechaVencimiento: '2026-07-01' })
    const nuevo = doc({ numeroCheque: num(11), esRenovacion: true, renovacionDe: [corto(10)], fechaEmision: '2026-07-01', fechaVencimiento: '2026-08-01', obsOriginal: 'Renovacion cheque 10 capital' })
    const ops = iniciales([viejo, nuevo])
    expect(ops).toHaveLength(1)
    expect(ops[0]!.chequesNuevos.map((c) => c.numeroCheque)).toEqual([num(10)])
  })
})

describe('seguimiento con operaciones iniciales', () => {
  const sola = [1, 2].map((n) =>
    doc({ numeroCheque: num(n), fechaEmision: '2026-09-04', fechaVencimiento: `2026-12-2${n}`, obsOriginal: 'INTERESES Y CAP', rolEnOperacion: 'mixto' }),
  )
  // Préstamo de 2 cheques: uno se cobró y el otro se renovó.
  const renovadaDebitado = doc({ numeroCheque: num(20), pagado: true, fechaEmision: '2026-05-01', fechaVencimiento: '2026-06-01', obsOriginal: 'Capital', rolEnOperacion: 'capital', beneficiario: 'MANA', beneficiarioNormalizado: 'mana' })
  const renovadaRenovado = doc({ numeroCheque: num(21), pagado: true, fechaEmision: '2026-05-01', fechaVencimiento: '2026-07-01', obsOriginal: 'Capital', rolEnOperacion: 'capital', beneficiario: 'MANA', beneficiarioNormalizado: 'mana' })
  const renovacion = doc({ numeroCheque: num(22), esRenovacion: true, renovacionDe: [corto(21)], fechaEmision: '2026-07-01', fechaVencimiento: '2026-12-01', obsOriginal: 'Renovacion 21', beneficiario: 'MANA', beneficiarioNormalizado: 'mana' })
  const ops = construirSeguimiento([...sola, renovadaDebitado, renovadaRenovado, renovacion])

  it('clasifica inicial sola, inicial renovada y renovación, y encadena la renovación con su préstamo', () => {
    const r = armarSeguimiento(ops, '2026-11-13', 'todas')
    const todas = r.beneficiarios.flatMap((g) => g.operaciones)
    const porClase = Object.fromEntries(todas.map((o) => [o.clase, o]))
    expect(Object.keys(porClase).sort()).toEqual(['inicial_renovada', 'inicial_sola', 'renovacion'])

    const ini = porClase.inicial_renovada!
    const renov = porClase.renovacion!
    expect(ini.id).toBe('ini-mana-2026-05-01-020-923-5000')
    expect(renov.operacionesAnterioresIds).toEqual([ini.id])
    expect(ini.chequesNuevos.find((c) => c.numeroCheque === num(21))!.operacionSiguienteId).toBe(renov.id)
    expect(ini.chequesNuevos.find((c) => c.numeroCheque === num(20))!.estado).toBe('debitado')
    expect(ini.interesAparte).toBeNull()
    expect(renov.tipo).toBe('renovacion')
  })

  it('la operación inicial sin renovar suma a la plata en la calle del proveedor', () => {
    const r = armarSeguimiento(ops, '2026-11-13', 'abiertas')
    const mahum = r.beneficiarios.find((g) => g.beneficiarioNormalizado === 'mahum diego')!
    expect(mahum.operaciones.map((o) => o.clase)).toEqual(['inicial_sola'])
    expect(mahum.exposicionCentavos).toBe(200_000_00)
    expect(mahum.posicionesAbiertas).toBe(2)
    // MANA: solo el cheque de la renovación sigue pendiente; la inicial renovada ya está cerrada.
    const mana = r.beneficiarios.find((g) => g.beneficiarioNormalizado === 'mana')!
    expect(mana.operaciones.map((o) => o.clase)).toEqual(['renovacion'])
    expect(r.totales.exposicionCentavos).toBe(300_000_00)
  })
})

describe('detectarDesgloseInicial', () => {
  // HERMANA CLAU 11/03/2026, OBS "int+cap": 3 cheques de interés por mes y el capital al final.
  const ch = (n: number, monto: number, vto: string) => ({
    numeroCheque: `020-923-5010-${n}`, montoCentavos: monto, fechaVencimiento: vto, fechaEmision: '2026-03-11', rol: 'mixto' as const, pagado: false,
  })
  const hermanaClau = [
    ch(39584792, 1_262_266_00, '2026-04-10'),
    ch(39584793, 1_262_266_00, '2026-05-10'),
    ch(39584794, 1_262_266_00, '2026-06-10'),
    ch(39584795, 6_000_000_00, '2026-06-10'),
    ch(39584796, 6_000_000_00, '2026-06-10'),
    ch(39584797, 6_032_366_00, '2026-06-10'),
  ]

  it('caso HERMANA CLAU: $1.262.266 por mes es el 7 % de $18.032.366 de capital', () => {
    const d = detectarDesgloseInicial(hermanaClau)!
    expect(d.tasaMensual).toBe(0.07)
    expect(d.capitalCentavos).toBe(18_032_366_00)
    expect(d.interesPorChequeCentavos).toBe(1_262_266_00)
    expect(d.interesCentavos).toBe(3_786_798_00)
    expect(d.chequesInteres.map((n) => n.slice(-3))).toEqual(['792', '793', '794'])
    expect(d.chequesCapital.map((n) => n.slice(-3))).toEqual(['795', '796', '797'])
  })

  it('caso MAHUM DIEGO: 2 cheques de interés por mes (el 24 y el 26) = 5,5 % de $20.000.000', () => {
    const c = (n: number, monto: number, vto: string) => ({ ...ch(n, monto, vto), numeroCheque: `020-923-5000-${n}`, fechaEmision: '2026-09-04' })
    const d = detectarDesgloseInicial([
      c(39316495, 550_000_00, '2026-10-24'),
      c(39316496, 550_000_00, '2026-10-26'),
      c(39316497, 550_000_00, '2026-11-24'),
      c(39316498, 550_000_00, '2026-11-26'),
      c(39316499, 550_000_00, '2026-12-24'),
      c(39316501, 10_000_000_00, '2026-12-24'),
      c(39316500, 550_000_00, '2026-12-26'),
      c(39316502, 10_000_000_00, '2026-12-26'),
    ])!
    expect(d.chequesPorMes).toBe(2)
    expect(d.interesPorMesCentavos).toBe(1_100_000_00)
    // No 2,75 % (un cheque solo sobre todo el capital): el interés del mes son los dos.
    expect(d.tasaMensual).toBe(0.055)
    expect(d.capitalCentavos).toBe(20_000_000_00)
    expect(d.interesCentavos).toBe(3_300_000_00)
    expect(d.chequesInteres).toHaveLength(6)
    expect(d.chequesCapital.map((n) => n.slice(-3))).toEqual(['501', '502'])
  })

  it('HERMANA CLAU es 1 cheque de interés por mes', () => {
    expect(detectarDesgloseInicial(hermanaClau)!.chequesPorMes).toBe(1)
  })

  it('si la tasa no da redonda no se marca nada', () => {
    const corrido = hermanaClau.map((c) => (c.montoCentavos === 1_262_266_00 ? { ...c, montoCentavos: 1_250_000_00 } : c))
    expect(detectarDesgloseInicial(corrido)).toBeNull()
  })

  it('los cheques iguales tienen que vencer uno por mes', () => {
    const mismoDia = hermanaClau.map((c) => (c.montoCentavos === 1_262_266_00 ? { ...c, fechaVencimiento: '2026-04-10' } : c))
    expect(detectarDesgloseInicial(mismoDia)).toBeNull()
  })

  it('un solo cheque de cada monto no alcanza', () => {
    expect(detectarDesgloseInicial([hermanaClau[0]!, hermanaClau[5]!])).toBeNull()
  })

  it('la renovación que se lleva el último cheque de interés lo marca: no es capital', () => {
    const docs = hermanaClau.map((c) =>
      doc({
        numeroCheque: c.numeroCheque, montoCentavos: c.montoCentavos, fechaVencimiento: c.fechaVencimiento, fechaEmision: '2026-03-11',
        obsOriginal: 'int+cap', rolEnOperacion: 'mixto', pagado: true, beneficiario: 'HERMANA CLAU', beneficiarioNormalizado: 'hermana clau',
      }),
    )
    const renovacion = doc({
      numeroCheque: '020-923-5010-39600001', montoCentavos: 20_000_000_00, esRenovacion: true,
      renovacionDe: ['39584794', '39584795', '39584796', '39584797'], fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10',
      obsOriginal: 'Renovacion', beneficiario: 'HERMANA CLAU', beneficiarioNormalizado: 'hermana clau',
    })
    const ops = construirSeguimiento([...docs, renovacion])
    const ini = ops.find((o) => o.tipo === 'inicial')!
    const renov = ops.find((o) => o.tipo !== 'inicial')!
    expect(ini.desgloseInicial?.tasaMensual).toBe(0.07)
    expect(ini.interesInicialEnViejos).toBeNull()
    expect(renov.totalViejosCentavos).toBe(19_294_632_00)
    expect(renov.interesInicialEnViejos).toEqual({ cantidadCheques: 1, montoCentavos: 1_262_266_00, capitalRenovadoCentavos: 18_032_366_00 })
  })
})
