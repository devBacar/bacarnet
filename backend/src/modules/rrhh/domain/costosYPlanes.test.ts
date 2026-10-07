import { describe, expect, it } from 'vitest'
import { calcularFactores, costoPersonaArea, tasasDelMes } from './costosEmpresa.js'
import { detectarPactadas, pactadoDelMes } from './horasPactadas.js'
import { construirPlanes, type InsumoPlanArea, type InsumosPlanes } from './planesReduccion.js'
import type { HorasPorGrupo, MesPersona, ResultadoResumen, ResumenPersona } from './resumenMensual.js'

function horas(he50 = 0, he100 = 0, v50 = 10_000, v100 = 13_000): HorasPorGrupo {
  return {
    he50: { hs: he50, monto: he50 * v50 },
    he100: { hs: he100, monto: he100 * v100 },
    fer: { hs: 0, monto: 0 },
    noct: { hs: 0, monto: 0 },
    comp: { hs: 0, monto: 0 },
    jornal: { hs: 0, monto: 0 },
  }
}

function mesPersona(rem: number, he50 = 0, he100 = 0, cc = 16): MesPersona {
  const h = horas(he50, he100)
  const remTotal = rem + h.he50.monto + h.he100.monto
  const contrib = remTotal * 0.25 + 2_000 // parte fija (seguro, ART fija) + 25% proporcional
  return {
    cc,
    horas: h,
    totales: { rem: remTotal, norem: 300_000, contrib, prov: remTotal * 0.1, costo: remTotal + 300_000 + contrib, desc: 0, neto: 0, adelantos: 0 },
    ausencias: {},
    horasNormales: 190,
  }
}

function persona(legajo: number, meses: Record<string, MesPersona>): ResumenPersona {
  return {
    legajo,
    nombre: `PERSONA ${legajo}`,
    cc: 16,
    seccion: 0,
    puesto: 1,
    esquemaLiquidacion: 1,
    fechaIngreso: '2015-01-01',
    fechaEgreso: null,
    meses,
    vacaciones: [],
  }
}

const MESES = ['202601', '202602', '202603', '202604', '202605', '202606', '202607', '202608', '202609']

function resultado(personas: ResumenPersona[]): ResultadoResumen {
  return {
    meses: MESES,
    ultimoMes: '202609',
    centrosCosto: MESES.map((mes) => ({
      mes,
      cc: 16,
      dotacion: personas.length,
      conHorasExtra: 0,
      horas: horas(),
      totales: { rem: 0, norem: 0, contrib: 0, prov: 0, costo: 0, desc: 0, neto: 0, adelantos: 0 },
      ausencias: { Vacaciones: personas.length * 1.5 },
      horasNormales: personas.length * 190,
    })),
    personas,
    feriadosPorMes: {},
    catalogos: { centrosCosto: { 16: 'PROTECCION DE VALORES' }, secciones: {}, puestos: { 1: 'Chofer' }, esquemasLiquidacion: {}, tiposAusencia: {} },
    anomalias: [],
  }
}

describe('costo real de la hora extra y de una persona', () => {
  // 60 recibos con sueldos distintos: la pendiente separa la parte proporcional de la fija.
  const personas = Array.from({ length: 60 }, (_, i) =>
    persona(i + 1, Object.fromEntries(MESES.map((m) => [m, mesPersona(1_000_000 + i * 20_000, 10, 5)]))),
  )
  const r = resultado(personas)

  it('mide contribuciones y provisiones con la pendiente de los recibos', () => {
    const t = tasasDelMes(r, '202609')
    expect(t.contribuciones).toBeCloseTo(0.25, 6)
    expect(t.provisiones).toBeCloseTo(0.1, 6)
  })

  it('arma el factor total y no usa meses con aguinaldo', () => {
    const f = calcularFactores(r, 21)
    expect(f.medido).toBe(true)
    expect(f.mesBase).toBe('202609')
    expect(f.cargasAguinaldo).toBeCloseTo(0.25 / 12, 6)
    expect(f.vacaciones).toBeCloseTo((21 / 300) * 1.25, 6)
    expect(f.total).toBeCloseTo(1 + 0.25 + 0.1 + 0.25 / 12 + (21 / 300) * 1.25, 6)
  })

  it('sin recibos suficientes usa las tasas de referencia y lo avisa', () => {
    const f = calcularFactores(resultado(personas.slice(0, 5)), 14)
    expect(f.medido).toBe(false)
    expect(f.contribuciones).toBeCloseTo(0.2655, 4)
  })

  it('el costo de una persona más es el recibo completo sin sus horas extra', () => {
    const f = calcularFactores(r, 21)
    const c = costoPersonaArea(r, 16, '202609', f, new Set())
    // Persona promedio: rem 1.590.000 sin horas extra; costo = rem + no rem + contrib + prov + cargas del aguinaldo.
    const rem = 1_000_000 + 29.5 * 20_000
    const esperado = rem + 300_000 + rem * 0.25 + 2_000 + rem * 0.1 + rem * (0.25 / 12)
    expect(c.costoMes).toBeCloseTo(esperado, 0)
    expect(c.noRemunerativo).toBe(300_000)
    expect(c.productividad).toBeCloseTo(1 - 1.5 / 30, 6)
  })
})

describe('horas pactadas', () => {
  const fija = persona(1, Object.fromEntries(MESES.map((m) => [m, mesPersona(1_000_000, 20, 20)])))
  const variable = persona(2, Object.fromEntries(MESES.map((m, i) => [m, mesPersona(1_000_000, 5 + i * 4, i)])))
  const nueva = persona(3, Object.fromEntries(MESES.slice(-4).map((m) => [m, mesPersona(1_000_000, 29, 38)])))
  const r = resultado([fija, variable, nueva])
  const puesto = () => 'Chofer'

  it('detecta a quien cobra siempre lo mismo, también si entró hace poco', () => {
    const p = detectarPactadas(r, { confirmadas: [], descartadas: [] }, puesto)
    expect(p.map((x) => x.legajo).sort()).toEqual([1, 3])
    expect(p.find((x) => x.legajo === 1)).toMatchObject({ horas50: 20, horas100: 20, mesesIguales: 9, estado: 'detectada' })
  })

  it('RRHH puede descartar una detectada o confirmar a alguien que el sistema no detectó', () => {
    const p = detectarPactadas(r, { confirmadas: [2], descartadas: [3] }, puesto)
    expect(p.map((x) => x.legajo).sort()).toEqual([1, 2])
    expect(p.find((x) => x.legajo === 2)?.estado).toBe('confirmada')
  })

  it('lo pactado de un mes llega hasta el tope del acuerdo (un pago duplicado no cuenta como pactado)', () => {
    const doble = persona(4, { ...fija.meses, '202609': mesPersona(1_000_000, 40, 40) })
    const [p] = detectarPactadas(resultado([doble]), { confirmadas: [], descartadas: [] }, puesto)
    expect(pactadoDelMes(resultado([doble]), p, '202609')).toMatchObject({ horas: 40, monto: 20 * 10_000 + 20 * 13_000 })
  })
})

describe('planes suave, medio y brusco', () => {
  const factores = calcularFactores(resultado([]), 14)
  const area = (x: Partial<InsumoPlanArea>): InsumoPlanArea => ({
    cc: 16,
    nombre: 'Protección de Valores',
    tipo: 'estructural',
    convenio: 'camioneros',
    horasMes: 200,
    horasExtraMes: 2_000,
    horasHabituales: 2_000,
    proporcion100: 0.7,
    valor50: 10_000,
    valor100: 14_000,
    horaExtraEmpresa: 20_000,
    horaFeriadoEmpresa: 0,
    horasFeriadoPorFeriado: 0,
    costoPersonaMes: 3_000_000,
    productividad: 0.9,
    horasExtraPorHoraAusencia: 0,
    temporada: [],
    ...x,
  })
  const insumos = (areas: InsumoPlanArea[]): InsumosPlanes => ({
    areas,
    factores,
    feriadosAnio: 12,
    eventuales: { personas: 0, horasLibresMes: 0, costoHora: 0 },
    gastoMensual: 60_000_000,
    pactadasMensual: 0,
  })

  it('el suave no contrata; medio y brusco contratan 1/3 y 2/3 de los puestos donde conviene', () => {
    const { planes, contratacion } = construirPlanes(insumos([area({})]))
    // Puestos: 2.000 / (200 × 0,9) = 11,1. Ahorro por persona: 180 h × 20.000 − 3.000.000 = 600.000 por mes.
    expect(contratacion[0].puestosEquivalentes).toBeCloseTo(11.11, 2)
    expect(contratacion[0].ahorroPorPersonaMes).toBeCloseTo(600_000, 0)
    const [suave, medio, brusco] = planes
    expect(suave.personasAContratar).toBe(0)
    expect(medio.personasAContratar).toBe(3)
    expect(brusco.personasAContratar).toBe(7)
    expect(medio.medidas.find((m) => m.id === 'contratar')?.ahorroAnual).toBeCloseTo(3 * 600_000 * 12, 0)
  })

  it('no propone contratar donde una persona cuesta más que las horas que reemplaza', () => {
    const { planes, contratacion } = construirPlanes(insumos([area({ costoPersonaMes: 4_000_000 })]))
    expect(contratacion[0].conviene).toBe(false)
    expect(planes[2].personasAContratar).toBe(0)
  })

  it('turnos: el ahorro es la diferencia entre la hora al doble y al 50%, con el costo empresa', () => {
    const { planes } = construirPlanes(insumos([area({ costoPersonaMes: 4_000_000 })]))
    const turnos = planes[0].medidas.find((m) => m.id === 'turnos')!
    // Suave: 10% de 2.000 × 0,7 = 140 h por mes × 4.000 × factor × 12.
    expect(turnos.ahorroAnual).toBeCloseTo(140 * 4_000 * factores.total * 12, 0)
  })

  it('vacaciones: solo se mueve lo que entra en los meses con margen', () => {
    const seg = area({
      cc: 17,
      nombre: 'Seguridad Privada',
      tipo: 'ausencias',
      convenio: 'suvico',
      horasHabituales: 0,
      proporcion100: 0.3,
      horasExtraPorHoraAusencia: 0.7,
      temporada: [
        { mes: '202610', vacaciones: 100, cupo: 400 },
        { mes: '202701', vacaciones: 900, cupo: 400 },
      ],
    })
    const { planes } = construirPlanes(insumos([seg]))
    const vac = (i: number) => planes[i].medidas.find((m) => m.id === 'vacaciones')!.ahorroAnual
    // Exceso 500, margen 300: se mueven 300 × (50% | 75% | 100%) días.
    const porDia = (5 / 7) * 8 * 0.7 * 20_000
    expect(vac(0)).toBeCloseTo(150 * porDia, 0)
    expect(vac(2)).toBeCloseTo(300 * porDia, 0)
  })

  it('el porcentaje se calcula sobre el gasto que se puede reducir (sin pactadas)', () => {
    const ins = { ...insumos([area({})]), pactadasMensual: 10_000_000 }
    const { planes, gastoMensualReducible } = construirPlanes(ins)
    expect(gastoMensualReducible).toBe(50_000_000)
    expect(planes[1].porcentaje).toBeCloseTo(planes[1].ahorroMensual / 50_000_000, 6)
  })
})
