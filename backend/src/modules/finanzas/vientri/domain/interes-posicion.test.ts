import { describe, expect, it } from 'vitest'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import { REVISAR_INTERES_SIN_ORIGEN } from './clasificar-ocasional.js'
import {
  REVISAR_INTERES_POSIBLE_PREFIJO,
  aplicarInteresSugerido,
  sugerirInteres,
  sugerirInteresesSueltos,
} from './interes-posicion.js'

let siguiente = 1000
function cheque(overrides: Partial<ChequeOcasionalDoc>): ChequeOcasionalDoc {
  siguiente += 1
  return {
    numeroCheque: `020-923-5000-${siguiente}`,
    beneficiario: 'PRESTAMISTA',
    beneficiarioNormalizado: 'prestamista',
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: 100_000_00,
    fechaVencimiento: '2026-10-25',
    fechaEmision: '2026-09-08',
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

const interes = (monto: number, vto: string, overrides: Partial<ChequeOcasionalDoc> = {}) =>
  cheque({
    montoCentavos: monto,
    fechaVencimiento: vto,
    fechaEmision: '2026-10-16',
    obsOriginal: 'Intereses',
    rolEnOperacion: 'interes',
    revisar: [REVISAR_INTERES_SIN_ORIGEN],
    ...overrides,
  })

describe('sugerirInteres: mismo vencimiento', () => {
  it('encuentra el % justo sobre la operación cuyos cheques vencen el mismo día', () => {
    // Renovación de 3 cheques que suman $10.000.003, vencen el 25/10; el interés (8 %) se paga aparte el 16/10.
    const capital = [3_000_001_00, 3_000_001_00, 4_000_001_00].map((m) =>
      cheque({ montoCentavos: m, obsOriginal: 'Renovacion', esRenovacion: true }))
    const i = interes(800_000_24, '2026-10-25')

    const s = sugerirInteres([i], [...capital, i])
    expect(s).toMatchObject({ forma: 'mismo_vencimiento', tasaPorcentaje: 8, baseCentavos: 10_000_003_00, cantidadChequesBase: 3 })
    expect(s!.porCheque[0]).toMatchObject({ fechaVencimiento: '2026-10-25', baseCentavos: 10_000_003_00 })
  })

  it('cada cheque de interés puede ir a una operación distinta, con la misma tasa', () => {
    const opA = [cheque({ montoCentavos: 5_000_000_00, fechaVencimiento: '2026-10-25', obsOriginal: 'Renovacion A' })]
    const opB = [cheque({ montoCentavos: 2_000_000_00, fechaVencimiento: '2026-10-28', obsOriginal: 'Renovacion B' })]
    const grupo = [interes(400_000_00, '2026-10-25'), interes(160_000_00, '2026-10-28')]

    const s = sugerirInteres(grupo, [...opA, ...opB, ...grupo])
    expect(s?.tasaPorcentaje).toBe(8)
    expect(s?.porCheque.map((p) => p.operacion.obs)).toEqual(['Renovacion A', 'Renovacion B'])
  })

  it('usa la operación entera aunque tenga cheques que vencen otros días', () => {
    const op = [
      cheque({ montoCentavos: 6_000_000_00, fechaVencimiento: '2026-10-27', obsOriginal: 'Renovacion' }),
      cheque({ montoCentavos: 4_000_000_00, fechaVencimiento: '2026-10-30', obsOriginal: 'Renovacion' }),
    ]
    const s = sugerirInteres([interes(800_000_00, '2026-10-27')], op)
    expect(s).toMatchObject({ forma: 'mismo_vencimiento', tasaPorcentaje: 8, baseCentavos: 10_000_000_00 })
  })

  it('no toma como base cheques ya renovados ni cobrados antes del interés, ni los de otro proveedor', () => {
    const renovador = cheque({ fechaEmision: '2026-10-01', fechaVencimiento: '2027-01-10' })
    const base = [
      cheque({ montoCentavos: 5_000_000_00, renovadoPor: [renovador.numeroCheque] }),
      cheque({ montoCentavos: 5_000_000_00, fechaConciliado: '2026-10-10' }),
      cheque({ montoCentavos: 5_000_000_00, beneficiario: 'OTRO', beneficiarioNormalizado: 'otro' }),
    ]
    expect(sugerirInteres([interes(400_000_00, '2026-10-25')], [...base, renovador])).toBeNull()
  })
})

describe('sugerirInteres: mes de vencimiento', () => {
  // Tres operaciones con cheques que vencen en enero: $150.000.050 en total.
  const enero = [
    cheque({ montoCentavos: 50_000_000_00, fechaEmision: '2026-07-13', fechaVencimiento: '2027-01-08', obsOriginal: 'u$70.000 TC1525' }),
    cheque({ montoCentavos: 50_000_000_00, fechaEmision: '2026-08-03', fechaVencimiento: '2027-01-15', obsOriginal: 'u$70.000 TC1565' }),
    cheque({ montoCentavos: 50_000_050_00, fechaEmision: '2026-09-22', fechaVencimiento: '2027-01-25', obsOriginal: 'Renovacion' }),
  ]
  const otroMes = cheque({ montoCentavos: 7_000_000_00, fechaEmision: '2026-09-01', fechaVencimiento: '2026-12-10' })
  // 6 % mensual = $9.000.003 por mes, en 3 cheques de $3.000.001; 3 meses.
  const vtos = ['2026-11-29', '2026-11-30', '2026-12-01', '2027-01-01', '2027-01-02', '2027-01-03', '2027-02-01', '2027-02-02', '2027-02-03']
  const grupo = vtos.map((v) => interes(3_000_001_00, v, { fechaEmision: '2026-09-22' }))

  it('encuentra el % mensual sobre todo lo que vence en un mes, partido en cheques iguales', () => {
    const s = sugerirInteres(grupo, [...enero, otroMes, ...grupo])
    expect(s).toMatchObject({
      forma: 'mes_vencimiento',
      tasaPorcentaje: 6,
      mesBase: '2027-01',
      chequesPorMes: 3,
      meses: 3,
      baseCentavos: 150_000_050_00,
      cantidadChequesBase: 3,
    })
    expect(s!.operaciones).toHaveLength(3)
  })

  it('no sugiere nada si ningún mes da al peso', () => {
    const raros = grupo.map((c) => ({ ...c, montoCentavos: 3_123_457_00 }))
    expect(sugerirInteres(raros, [...enero, otroMes, ...raros])).toBeNull()
  })
})

describe('sugerirInteresesSueltos y aplicarInteresSugerido', () => {
  it('solo mira los cheques con el aviso de interés sin origen y deja el texto en revisar', () => {
    const capital = cheque({ montoCentavos: 10_000_000_00, obsOriginal: 'Renovacion' })
    const conAviso = interes(800_000_00, '2026-10-25')
    const sinAviso = interes(800_000_00, '2026-10-25', { obsOriginal: 'Interes', revisar: [] })

    const mapa = sugerirInteresesSueltos([capital, conAviso, sinAviso])
    expect(mapa.has(conAviso)).toBe(true)
    expect(mapa.has(sinAviso)).toBe(false)

    const conTexto = aplicarInteresSugerido(conAviso, mapa.get(conAviso)!, 'PRESTAMISTA')
    expect(conTexto.revisar[0]).toBe(REVISAR_INTERES_SIN_ORIGEN)
    expect(conTexto.revisar[1]).toMatch(/^Posible interés del 8% sobre \$10\.000\.000 que vencen el mismo día/)
    expect(conTexto.revisar.join(' ').toLowerCase()).not.toContain('imposible')

    // Al recalcular sin sugerencia, el texto se va y el resto queda.
    const sin = aplicarInteresSugerido(conTexto, null, 'PRESTAMISTA')
    expect(sin.revisar).toEqual([REVISAR_INTERES_SIN_ORIGEN])
    expect(sin.interesSugerido).toBeNull()
    expect(aplicarInteresSugerido(conTexto, mapa.get(conAviso)!, 'PRESTAMISTA').revisar.filter((r) => r.startsWith(REVISAR_INTERES_POSIBLE_PREFIJO))).toHaveLength(1)
  })

  it('el texto de mes de vencimiento nombra el mes, la base y los cheques por mes', () => {
    const base = cheque({ montoCentavos: 150_000_050_00, fechaEmision: '2026-09-01', fechaVencimiento: '2027-01-15' })
    const grupo = ['2026-12-01', '2027-01-01', '2027-02-01'].map((v) => interes(9_000_003_00, v, { fechaEmision: '2026-09-22' }))
    const s = sugerirInteres(grupo, [base, ...grupo])!
    const r = aplicarInteresSugerido(grupo[0]!, s, 'PRESTAMISTA').revisar.at(-1)
    expect(r).toBe('Posible interés del 6% mensual sobre los cheques de PRESTAMISTA que vencen en enero de 2027 ($150.000.050 en 1 cheque de 1 operación), 1 cheque por mes')
  })
})
