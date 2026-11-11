import { describe, expect, it } from 'vitest'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import { REVISAR_INTERES_SIN_ORIGEN, REVISAR_SIN_DATOS_FINANCIEROS } from './clasificar-ocasional.js'
import {
  REVISAR_DIFERENCIA_POSIBLE_PREFIJO,
  REVISAR_INTERES_POSIBLE_PREFIJO,
  aplicarDiferenciaSugerida,
  aplicarInteresSugerido,
  sugerirDiferenciasDeInteres,
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

  it('los cheques de operaciones en dólares no son base de interés (ya lo traen adentro), salvo que se pida', () => {
    const conUsd = enero.map((c, i) => (i < 2 ? { ...c, operacionUsd: { montoUsd: 70000, cotizacion: 1525 } } : c))
    expect(sugerirInteres(grupo, [...conUsd, otroMes, ...grupo])).toBeNull()
    expect(sugerirInteres(grupo, [...conUsd, otroMes, ...grupo], new Map(), { incluirUsd: true })).toMatchObject({
      forma: 'mes_vencimiento',
      tasaPorcentaje: 6,
      baseCentavos: 150_000_050_00,
    })
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

describe('sugerirDiferenciasDeInteres y aplicarDiferenciaSugerida', () => {
  // Interés del 6 % mensual sobre lo que vence en enero ($150.000.050), emitido el 22/09 en 3 cheques por mes.
  const enero = [
    cheque({ montoCentavos: 50_000_000_00, fechaEmision: '2026-07-13', fechaVencimiento: '2027-01-08', obsOriginal: 'u$70.000 TC1525' }),
    cheque({ montoCentavos: 50_000_000_00, fechaEmision: '2026-08-03', fechaVencimiento: '2027-01-15', obsOriginal: 'u$70.000 TC1565' }),
    cheque({ montoCentavos: 50_000_050_00, fechaEmision: '2026-09-22', fechaVencimiento: '2027-01-25', obsOriginal: 'Renovacion' }),
  ]
  const vtos = ['2026-11-29', '2026-11-30', '2026-12-01', '2027-01-01', '2027-01-02', '2027-01-03', '2027-02-01', '2027-02-02', '2027-02-03']
  const grupo = vtos.map((v) => interes(3_000_001_00, v, { fechaEmision: '2026-09-22' }))
  const sinDatos = (overrides: Partial<ChequeOcasionalDoc>) =>
    cheque({ montoCentavos: 1_500_000_00, fechaEmision: '2026-10-02', fechaVencimiento: '2027-01-17', obsOriginal: 'DIFERENCIA', revisar: [REVISAR_SIN_DATOS_FINANCIEROS], ...overrides })

  const buscar = (otros: ChequeOcasionalDoc[]) => {
    const todos = [...enero, ...grupo, ...otros]
    return sugerirDiferenciasDeInteres(todos, sugerirInteresesSueltos(todos))
  }

  it('encuentra el % chico y justo sobre la misma base del interés y reemplaza el aviso "Sin datos"', () => {
    const dif = sinDatos({})
    const s = buscar([dif]).get(dif)
    expect(s).toMatchObject({ tasaPorcentaje: 1, fechaEmisionInteres: '2026-09-22' })
    expect(s!.interes.baseCentavos).toBe(150_000_050_00)

    const r = aplicarDiferenciaSugerida(dif, s!)
    expect(r.revisar).toEqual([
      'Posible diferencia de interés: 1% sobre los $150.000.050 que vencen en enero de 2027 (mismo cálculo que los intereses del 22/09/2026)',
    ])
    expect(r.revisar.join(' ').toLowerCase()).not.toContain('imposible')
  })

  it('no sugiere nada si el monto no da al peso, si es de otro proveedor o si no está en la ventana de días', () => {
    const cheques = [
      sinDatos({ montoCentavos: 1_234_567_00 }),
      sinDatos({ beneficiario: 'OTRO', beneficiarioNormalizado: 'otro' }),
      sinDatos({ fechaEmision: '2026-09-20' }),
      sinDatos({ fechaEmision: '2026-11-30' }),
    ]
    const mapa = buscar(cheques)
    for (const c of cheques) expect(mapa.has(c)).toBe(false)
  })

  it('solo mira cheques "Sin datos": uno con renovación o USD no se toca', () => {
    const conRenovacion = sinDatos({ obsOriginal: 'Renovacion', esRenovacion: true, revisar: [] })
    expect(buscar([conRenovacion]).has(conRenovacion)).toBe(false)
  })

  it('sin un interés ya explicado no busca contra los meses del proveedor', () => {
    const dif = sinDatos({})
    const todos = [...enero, dif]
    expect(sugerirDiferenciasDeInteres(todos, sugerirInteresesSueltos(todos)).size).toBe(0)
  })

  it('no usa bases redondas: con $1.200.000 cualquier cheque redondo daría un % justo', () => {
    // 2 % mensual sobre $1.200.000 que vencen el 25/10 = $24.000; después, un cheque común de $24.000.
    const base = cheque({ montoCentavos: 1_200_000_00, fechaEmision: '2026-09-01', fechaVencimiento: '2026-10-25' })
    const int = interes(24_000_00, '2026-10-25', { fechaEmision: '2026-09-22' })
    const comun = sinDatos({ montoCentavos: 12_000_00, obsOriginal: 'op patio' })
    const todos = [base, int, comun]
    const intereses = sugerirInteresesSueltos(todos)
    expect(intereses.size).toBe(1)
    expect(sugerirDiferenciasDeInteres(todos, intereses).size).toBe(0)
  })

  it('si coincide con dos bases distintas no adivina', () => {
    // Segundo interés del proveedor: 3 % mensual sobre $300.000.100 que vencen en marzo; 0,5 % de esa base = 1 % de enero.
    const marzo = cheque({ montoCentavos: 300_000_100_00, fechaEmision: '2026-09-01', fechaVencimiento: '2027-03-10' })
    const otroGrupo = ['2027-03-01'].map((v) => interes(9_000_003_00, v, { fechaEmision: '2026-09-25', obsOriginal: 'Interes' }))
    const dif = sinDatos({})
    const todos = [...enero, marzo, ...grupo, ...otroGrupo, dif]
    const intereses = sugerirInteresesSueltos(todos)
    expect(new Set(intereses.values()).size).toBe(2)
    expect(sugerirDiferenciasDeInteres(todos, intereses).has(dif)).toBe(false)
  })

  it('al recalcular sin sugerencia se va solo el texto propio y no se duplica', () => {
    const dif = sinDatos({})
    const s = buscar([dif]).get(dif)!
    const conTexto = aplicarDiferenciaSugerida(dif, s)
    expect(aplicarDiferenciaSugerida(conTexto, s).revisar.filter((r) => r.startsWith(REVISAR_DIFERENCIA_POSIBLE_PREFIJO))).toHaveLength(1)
    expect(aplicarDiferenciaSugerida(conTexto, null).revisar).toEqual([])
  })
})
