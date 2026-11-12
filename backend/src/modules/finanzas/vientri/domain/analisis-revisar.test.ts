import { describe, expect, it } from 'vitest'
import { analizarARevisar } from './analisis-revisar.js'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import { agruparOperacionesRenovacion } from './operacion-renovacion.js'

let siguienteId = 1
function doc(overrides: Partial<ChequeOcasionalDoc>): ChequeOcasionalDoc {
  return {
    numeroCheque: '',
    beneficiario: 'MANA',
    beneficiarioNormalizado: 'mana',
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
    vientriId: siguienteId++,
    vientriChqId: null,
    baja: false,
    ...overrides,
  }
}

const analizar = (docs: ChequeOcasionalDoc[]) => analizarARevisar(docs, new Map(), agruparOperacionesRenovacion(docs))

// Una renovación cerrada: 2 viejos por $12.345.678 → 2 nuevos por $13.086.418,68 (6 %).
const viejos = [
  doc({ numeroCheque: '020-923-5000-39000001', montoCentavos: 600000000, fechaEmision: '2026-03-11', fechaVencimiento: '2026-06-10', fechaConciliado: '2026-06-10', pagado: true, renovadoPor: ['39000011', '39000012'], obsOriginal: 'cap' }),
  doc({ numeroCheque: '020-923-5000-39000002', montoCentavos: 634567800, fechaEmision: '2026-03-11', fechaVencimiento: '2026-06-10', fechaConciliado: '2026-06-10', pagado: true, renovadoPor: ['39000011', '39000012'], obsOriginal: 'cap' }),
]
const nuevos = [
  doc({ numeroCheque: '020-923-5000-39000011', montoCentavos: 654320934, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', esRenovacion: true, renovacionDe: ['39000001', '39000002'], obsOriginal: 'Renovacion cheques 39000001/02' }),
  doc({ numeroCheque: '020-923-5000-39000012', montoCentavos: 654320934, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', esRenovacion: true, renovacionDe: ['39000001', '39000002'], obsOriginal: 'Renovacion cheques 39000001/02' }),
]

describe('analizarARevisar', () => {
  it('junta por beneficiario + emisión + OBS y trae todos los cheques del grupo, estén o no a revisar', () => {
    const grupos = analizar([
      doc({ numeroCheque: '1', montoCentavos: 100000, fechaEmision: '2026-10-01', obsOriginal: 'algo', revisar: ['Sin datos'] }),
      doc({ numeroCheque: '2', montoCentavos: 200000, fechaEmision: '2026-10-01', obsOriginal: 'algo' }),
      doc({ numeroCheque: '3', montoCentavos: 300000, fechaEmision: '2026-10-02', obsOriginal: 'algo' }),
    ])
    expect(grupos).toHaveLength(1)
    expect(grupos[0]).toMatchObject({ cantidadCheques: 2, totalCentavos: 300000, motivos: ['Sin datos'], obs: 'algo' })
    expect(grupos[0]!.cheques.map((c) => c.aRevisar)).toEqual([true, false])
  })

  it('interés: el total da un % justo sobre los cheques nuevos de una renovación del mismo día', () => {
    // 2 % de $13.086.418,68 = $261.728,37
    const interes = doc({ numeroCheque: '020-923-5000-39000020', montoCentavos: 26172837, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', obsOriginal: 'Intereses', revisar: ['Interés sin operación de origen'] })
    const [g] = analizar([...viejos, ...nuevos, interes])
    const h = g!.hipotesis.find((x) => x.tipo === 'interes_renovacion' && x.titulo.includes('nuevos'))
    expect(h).toMatchObject({ fuerza: 'fuerte', cuenta: { baseCentavos: 1308641868, tasaPorcentaje: 2, diferenciaCentavos: 0 } })
    expect(h!.cheques).toHaveLength(2)
    // La renovación de ese día, con sus cheques viejos y nuevos y cuánto es el grupo sobre cada lado.
    expect(g!.renovacionesDelDia).toHaveLength(1)
    expect(g!.renovacionesDelDia[0]).toMatchObject({
      vinculada: true,
      totalViejosCentavos: 1234567800,
      totalNuevosCentavos: 1308641868,
      interesCentavos: 74074068,
      tasaPorcentaje: 6,
      grupoSobreNuevosPorcentaje: 2,
    })
    expect(g!.renovacionesDelDia[0]!.viejos).toHaveLength(2)
    expect(g!.renovacionesDelDia[0]!.nuevos).toHaveLength(2)
    // Qué más se emitió ese día al proveedor.
    expect(g!.mismoDia).toEqual([{ obs: 'Renovacion cheques 39000001/02', cantidadCheques: 2, totalCentavos: 1308641868 }])
  })

  it('diferencia: un % chico sobre una renovación de días antes', () => {
    // 1 % de los viejos ($12.345.678) = $123.456,78
    const dif = doc({ numeroCheque: '020-923-5000-39000030', montoCentavos: 12345678, fechaEmision: '2026-06-20', obsOriginal: 'DIFERENCIA', revisar: ['Sin datos'] })
    const [g] = analizar([...viejos, ...nuevos, dif])
    expect(g!.hipotesis.find((x) => x.tipo === 'diferencia')).toMatchObject({
      fuerza: 'posible',
      cuenta: { baseCentavos: 1234567800, tasaPorcentaje: 1, diferenciaCentavos: 0 },
      confirmar: { tipo: 'rol', datos: { rol: 'interes' }, etiqueta: 'Confirmar como interés de la renovación del 10/06/2026' },
    })
    // Aunque ya diga "interés", se puede atar a la renovación; si ya está atado, no hay nada nuevo para guardar.
    const [yaInteres] = analizar([...viejos, ...nuevos, { ...dif, rolEnOperacion: 'interes' }])
    expect(yaInteres!.hipotesis.find((x) => x.tipo === 'diferencia')!.confirmar).not.toBeNull()
    const atado = { ...dif, rolEnOperacion: 'interes' as const, interesDe: { fechaRenovacion: '2026-06-10', obsRenovacion: 'Renovacion cheques 39000001/02', tasaPorcentaje: 1, porMes: false, meses: 1, baseCentavos: 1234567800, baseDescripcion: 'los cheques viejos' } }
    const [yaAtado] = analizar([...viejos, ...nuevos, atado])
    expect(yaAtado!.hipotesis.find((x) => x.tipo === 'diferencia')!.confirmar).toBeNull()
  })

  it('una base redonda queda como coincidencia débil y con aviso', () => {
    const v = doc({ numeroCheque: '020-923-5000-39000101', montoCentavos: 1000000000, fechaEmision: '2026-03-11', fechaVencimiento: '2026-06-10', pagado: true, obsOriginal: 'cap' })
    const n = doc({ numeroCheque: '020-923-5000-39000111', montoCentavos: 1060000000, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', esRenovacion: true, renovacionDe: ['39000101'], obsOriginal: 'Renovacion cheque 39000101' })
    const suelto = doc({ numeroCheque: '020-923-5000-39000120', montoCentavos: 10000000, fechaEmision: '2026-06-25', obsOriginal: 'varios', revisar: ['Sin datos'] })
    const [g] = analizar([v, n, suelto])
    const h = g!.hipotesis.find((x) => x.tipo === 'diferencia' && x.titulo.includes('viejos'))
    expect(h).toMatchObject({ fuerza: 'debil' })
    expect(h!.avisos[0]).toContain('redondo')
  })

  it('renovación que nombra el OBS: busca los viejos y hace la cuenta', () => {
    const viejo = doc({ numeroCheque: '020-923-5000-39584870', montoCentavos: 500000000, fechaEmision: '2026-07-01', fechaVencimiento: '2026-10-01', obsOriginal: 'cap' })
    const nuevo = doc({ numeroCheque: '020-923-5000-39584999', montoCentavos: 535000000, fechaEmision: '2026-10-01', fechaVencimiento: '2026-12-01', obsOriginal: 'Reemplazo cheque 39584870', revisar: ['Sin datos'] })
    const [g] = analizar([viejo, nuevo])
    expect(g!.hipotesis[0]).toMatchObject({
      tipo: 'renovacion_obs',
      fuerza: 'fuerte',
      cuenta: { baseCentavos: 500000000, tasaPorcentaje: 7, diferenciaCentavos: 35000000 },
      chequesTotal: 1,
      confirmar: { tipo: 'renovacion', datos: { chequeIds: ['39584870'] } },
    })
  })

  it('dólares: compara dólares × cotización contra el total del grupo', () => {
    const cuotas = [1, 2].map((i) =>
      doc({ numeroCheque: `020-923-5000-3900020${i}`, montoCentavos: 4663750000, fechaEmision: '2026-10-01', obsOriginal: '65000 TC1435', revisar: ['Sin datos'] }),
    )
    const [g] = analizar(cuotas)
    expect(g!.hipotesis.find((x) => x.tipo === 'dolares')).toMatchObject({
      fuerza: 'fuerte',
      cuenta: { esperadoCentavos: 9327500000, diferenciaCentavos: 0 },
      confirmar: { tipo: 'usd', datos: { usd: { montoUsd: 65000, cotizacion: 1435 } } },
    })
    // Si ya está cargada como dólares no hay nada para guardar.
    const [cargado] = analizar(cuotas.map((c) => ({ ...c, operacionUsd: { montoUsd: 65000, cotizacion: 1435 } })))
    expect(cargado!.hipotesis.find((x) => x.tipo === 'dolares')!.confirmar).toBeNull()

    const [incompleto] = analizar([cuotas[0]!])
    const h = incompleto!.hipotesis.find((x) => x.tipo === 'dolares')
    expect(h).toMatchObject({ fuerza: 'posible' })
    expect(h!.avisos[0]).toContain('menos')
  })

  it('origen posible: cheques del proveedor que salieron en esos días y nadie renovó', () => {
    const salieron = [
      doc({ numeroCheque: '020-923-5000-39000301', montoCentavos: 500000000, fechaEmision: '2026-07-01', fechaVencimiento: '2026-10-01', fechaConciliado: '2026-10-01', pagado: true, obsOriginal: 'lote A' }),
      doc({ numeroCheque: '020-923-5000-39000302', montoCentavos: 500000000, fechaEmision: '2026-07-01', fechaVencimiento: '2026-10-02', fechaConciliado: '2026-10-01', pagado: true, obsOriginal: 'lote A' }),
    ]
    const yaRenovado = doc({ numeroCheque: '020-923-5000-39000303', montoCentavos: 500000000, fechaEmision: '2026-07-01', fechaVencimiento: '2026-10-01', fechaConciliado: '2026-10-01', pagado: true, renovadoPor: ['39999999'], obsOriginal: 'lote B' })
    const deOtro = doc({ numeroCheque: '020-923-5000-39000304', beneficiario: 'POVO', beneficiarioNormalizado: 'povo', montoCentavos: 500000000, fechaEmision: '2026-07-01', fechaVencimiento: '2026-10-01', fechaConciliado: '2026-10-01', pagado: true, obsOriginal: 'lote C' })
    const nuevo = doc({ numeroCheque: '020-923-5000-39000310', montoCentavos: 1070000000, fechaEmision: '2026-10-01', fechaVencimiento: '2026-12-01', obsOriginal: 'cambio', revisar: ['Sin datos'] })
    const [g] = analizar([...salieron, yaRenovado, deOtro, nuevo])
    const origen = g!.hipotesis.filter((x) => x.tipo === 'origen_posible')
    expect(origen).toHaveLength(1)
    expect(origen[0]).toMatchObject({
      chequesTotal: 2,
      cuenta: { baseCentavos: 1000000000, tasaPorcentaje: 7 },
      confirmar: { tipo: 'renovacion', datos: { chequeIds: ['39000301', '39000302'] } },
    })

    // A un cheque de interés no se le busca origen como si reemplazara a otros.
    const [gInteres] = analizar([...salieron, { ...nuevo, rolEnOperacion: 'interes' }])
    expect(gInteres!.hipotesis.filter((x) => x.tipo === 'origen_posible')).toHaveLength(0)
  })

  it('las hipótesis fuertes van primero y los dados de baja no cuentan', () => {
    const interes = doc({ numeroCheque: '020-923-5000-39000020', montoCentavos: 26172837, fechaEmision: '2026-06-10', fechaVencimiento: '2026-09-10', obsOriginal: 'Intereses', revisar: ['x'] })
    const baja = doc({ numeroCheque: '020-923-5000-39000021', montoCentavos: 1, fechaEmision: '2026-06-10', obsOriginal: 'Intereses', revisar: ['x'], baja: true })
    const [g] = analizar([...viejos, ...nuevos, interes, baja])
    expect(g!.cantidadCheques).toBe(1)
    const fuerzas = g!.hipotesis.map((h) => h.fuerza)
    expect(fuerzas).toEqual([...fuerzas].sort((a, b) => ['fuerte', 'posible', 'debil'].indexOf(a) - ['fuerte', 'posible', 'debil'].indexOf(b)))
  })
})
