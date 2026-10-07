import { describe, expect, it } from 'vitest'
import { feriadosDelMes } from './calendarioFeriados.js'
import { convenioDeEsquema, diasVacacionesLct } from './convenios.js'
import { construirInforme, nombreArea } from './informeMensual.js'
import { ajustarUmbral, percentil } from './modeloArea.js'
import { mesesRestantesTemporada } from './recomendaciones.js'
import {
  sumarMeses,
  type HorasPorGrupo,
  type ResultadoResumen,
  type ResumenCentroCostoMes,
  type ResumenPersona,
} from './resumenMensual.js'

describe('modelo con umbral', () => {
  it('calcula percentiles como numpy', () => {
    expect(percentil([1, 2, 3, 4], 25)).toBeCloseTo(1.75)
    expect(percentil([10], 50)).toBe(10)
  })

  it('encuentra el umbral de absorción en datos con ese comportamiento', () => {
    const x = Array.from({ length: 20 }, (_, i) => i * 50)
    const y = x.map((v) => 100 + 0.5 * Math.max(0, v - 400))
    const ajuste = ajustarUmbral(x, y)
    expect(ajuste.k).toBeGreaterThanOrEqual(380)
    expect(ajuste.k).toBeLessThanOrEqual(420)
    expect(ajuste.b).toBeCloseTo(0.5, 1)
    expect(ajuste.r2).toBeGreaterThan(0.99)
  })
})

describe('reglas', () => {
  it('días de vacaciones por antigüedad al 31/12 (LCT art. 150)', () => {
    expect(diasVacacionesLct('2022-01-10', 2026)).toBe(14)
    expect(diasVacacionesLct('2015-03-01', 2026)).toBe(28)
    expect(diasVacacionesLct('2000-01-01', 2026)).toBe(35)
    expect(diasVacacionesLct('2026-09-01', 2026)).toBe(6)
    expect(diasVacacionesLct(null, 2026)).toBe(14)
  })

  it('meses que quedan de la temporada de vacaciones (1/10 al 30/4)', () => {
    expect(mesesRestantesTemporada('202610')).toBe(7)
    expect(mesesRestantesTemporada('202701')).toBe(4)
    expect(mesesRestantesTemporada('202606')).toBe(0)
  })

  it('convenio según el esquema de liquidación de Salario', () => {
    expect(convenioDeEsquema('Suvico')).toBe('suvico')
    expect(convenioDeEsquema('Choferes de Camiones (40/89)')).toBe('camioneros')
    expect(convenioDeEsquema('Bancarios')).toBe('bancarios')
    expect(convenioDeEsquema('Fuera de Convenio')).toBe('fuera')
  })

  it('feriados del calendario para los meses sin liquidar', () => {
    expect(feriadosDelMes('202611').cantidad).toBe(3)
    expect(feriadosDelMes('202611').detalle[0]).toBe('9/11 Visita del Papa')
    expect(feriadosDelMes('202609').cantidad).toBe(0)
  })

  it('nombres legibles de centros de costo', () => {
    expect(nombreArea('SERVICIO DE SEGURIDAD PRIVADA - Personal Permanente', 17)).toBe('Seguridad Privada')
    expect(nombreArea('SERVICIOS DE TESORERIA TERCERIZADOS', 18)).toBe('Servicios de Tesorería Tercerizados')
    expect(nombreArea('ADMINISTRACIÓN CENTRAL', 1)).toBe('Administración Central')
    expect(nombreArea(undefined, 99)).toBe('Centro de costo 99 (sin nombre en Salario)')
  })
})

// ---------- Datos ficticios: 19 meses, un área que depende de ausencias y otra estructural ----------

function horas(he50: number, he100: number, fer = 0): HorasPorGrupo {
  return {
    he50: { hs: he50, monto: he50 * 10_000 },
    he100: { hs: he100, monto: he100 * 13_000 },
    fer: { hs: fer, monto: fer * 12_000 },
    noct: { hs: 0, monto: 0 },
    comp: { hs: 0, monto: 0 },
    jornal: { hs: 0, monto: 0 },
  }
}

const MESES = Array.from({ length: 19 }, (_, i) => sumarMeses('202503', i)) // 202503 … 202609

function resultadoFicticio(): ResultadoResumen {
  const centrosCosto: ResumenCentroCostoMes[] = []
  const feriadosPorMes: Record<string, number> = {}
  MESES.forEach((mes, i) => {
    const vac = [300, 900, 400, 700, 200, 1000, 500, 800, 350, 650][i % 10]
    const feriados = i % 3
    feriadosPorMes[mes] = feriados
    const core = 500 + 0.6 * Math.max(0, vac * ((5 / 7) * 8) - 2000)
    centrosCosto.push({
      mes,
      cc: 17,
      dotacion: 500,
      conHorasExtra: 300,
      horas: horas(core * 0.6, core * 0.4, 2500 * feriados),
      totales: { rem: 500 * 1_400_000, norem: 0, contrib: 0, prov: 0, costo: 0, desc: 0, neto: 0, adelantos: 0 },
      ausencias: { Vacaciones: vac, Enfermedad: 50 },
      horasNormales: 500 * 190,
    })
    centrosCosto.push({
      mes,
      cc: 16,
      dotacion: 80,
      conHorasExtra: 70,
      horas: horas(900 + (i % 2) * 40, 2300 + (i % 3) * 30),
      totales: { rem: 80 * 2_000_000, norem: 0, contrib: 0, prov: 0, costo: 0, desc: 0, neto: 0, adelantos: 0 },
      ausencias: { Vacaciones: [100, 300, 150][i % 3] },
      horasNormales: 80 * 185,
    })
  })
  const mesPersona = (cc: number, he50: number, he100: number) => ({
    cc,
    horas: horas(he50, he100),
    totales: { rem: 1_500_000, norem: 0, contrib: 0, prov: 0, costo: 0, desc: 0, neto: 0, adelantos: 0 },
    ausencias: {},
    horasNormales: 190,
  })
  const persona = (legajo: number, nombre: string, cc: number, esquema: number, he: number): ResumenPersona => ({
    legajo,
    nombre,
    cc,
    seccion: 0,
    puesto: 7,
    esquemaLiquidacion: esquema,
    fechaIngreso: '2015-01-01',
    fechaEgreso: null,
    meses: Object.fromEntries(MESES.map((m) => [m, mesPersona(cc, he * 0.3, he * 0.7)])),
    vacaciones: [{ desde: '2026-11-02', hasta: '2026-11-15', dias: 14, anio: 2026 }],
  })
  return {
    meses: MESES,
    ultimoMes: '202609',
    centrosCosto,
    personas: [persona(1, 'NOMBRE SECRETO UNO', 16, 5, 40), persona(2, 'NOMBRE SECRETO DOS', 17, 6, 5)],
    feriadosPorMes,
    catalogos: {
      centrosCosto: { 16: 'PROTECCION DE VALORES', 17: 'SERVICIO DE SEGURIDAD PRIVADA - Personal Permanente' },
      secciones: {},
      puestos: { 7: 'Chofer Camion Blindado' },
      esquemasLiquidacion: { 5: 'Choferes de Camiones (40/89)', 6: 'Suvico' },
      tiposAusencia: {},
    },
    anomalias: [],
  }
}

describe('construirInforme', () => {
  const { agregado, detalle } = construirInforme(resultadoFicticio())

  it('arma 3 meses reales, el actual y 3 de previsión', () => {
    expect(agregado.reales).toEqual(['202607', '202608', '202609'])
    expect(agregado.actual).toBe('202610')
    expect(agregado.prevision).toEqual(['202611', '202612', '202701'])
    expect(agregado.areas[0].meses.map((m) => m.tipo)).toEqual([
      'real', 'real', 'real', 'actual', 'prevision', 'prevision', 'prevision',
    ])
  })

  it('detecta el tipo de cada área y su convenio', () => {
    const seg = agregado.areas.find((a) => a.cc === 17)!
    const pv = agregado.areas.find((a) => a.cc === 16)!
    expect(seg.modelo.tipo).toBe('ausencias')
    expect(seg.convenio).toBe('suvico')
    expect(seg.modelo.horasExtraPorHoraAusencia).toBeCloseTo(0.6, 1)
    expect(pv.modelo.tipo).toBe('estructural')
    expect(pv.convenio).toBe('camioneros')
    expect(pv.modelo.proporcion100).toBeGreaterThan(0.7)
  })

  it('proyecta feriados con el calendario y vacaciones con lo programado', () => {
    const seg = agregado.areas.find((a) => a.cc === 17)!
    const nov = seg.meses.find((m) => m.mes === '202611')!
    expect(nov.feriados).toBe(3)
    expect(nov.fer).toBeCloseTo(3 * seg.modelo.horasFeriadoPorFeriado, 0)
    expect(nov.vacacionesProgramadas).toBe(14)
    expect(nov.cupoVacaciones).toBeGreaterThan(0)
  })

  it('cuenta el límite legal por área y deja el detalle por persona aparte', () => {
    const pv = agregado.areas.find((a) => a.cc === 16)!
    expect(pv.limite.superaron).toBe(1)
    expect(detalle.limite.map((p) => p.legajo)).toEqual([1])
    expect(detalle.limite[0]).toMatchObject({ nombre: 'NOMBRE SECRETO UNO', area: 'Protección de Valores' })
  })

  it('el informe para el Directorio no trae nombres ni legajos', () => {
    const texto = JSON.stringify(agregado)
    expect(texto).not.toContain('NOMBRE SECRETO')
    expect(texto).not.toContain('"legajo"')
    expect(texto).not.toContain('"nombre":"NOMBRE')
  })

  it('genera focos y recomendaciones con su regla', () => {
    expect(agregado.focos.length).toBeGreaterThan(0)
    expect(agregado.recomendaciones.length).toBeGreaterThan(0)
    for (const r of agregado.recomendaciones) {
      expect(r.regla.length).toBeGreaterThan(0)
      expect(r.titulo.length).toBeGreaterThan(0)
    }
    expect(agregado.recomendaciones.some((r) => r.categoria === 'Feriados' && r.mes === '202611')).toBe(true)
    expect(agregado.recomendaciones.some((r) => r.categoria === 'Límite legal' && r.cc === 16)).toBe(true)
  })
})

describe('reporte por período', () => {
  const { agregado, detalle } = construirInforme(resultadoFicticio())
  const { periodos, anual } = agregado.reporte

  it('trae los 3 meses cerrados (del más nuevo al más viejo), el actual y la previsión', () => {
    expect(periodos.map((p) => `${p.mes}:${p.tipo}`)).toEqual([
      '202609:real', '202608:real', '202607:real', '202610:actual', '202611:prevision', '202612:prevision', '202701:prevision',
    ])
  })

  it('cada mes compara con el anterior y las causas suman el total de horas', () => {
    for (const p of periodos) {
      expect(p.total.anterior).not.toBeNull()
      const c = p.total.causas
      expect(c.ausencias + c.habituales + c.feriados).toBeCloseTo(p.total.horasTotal, 0)
      expect(p.claves.length).toBeGreaterThan(2)
      for (const a of p.areas) expect(a.claves.length).toBeGreaterThan(0)
    }
    const sep = periodos[0]
    expect(sep.total.anterior?.mes).toBe('202608')
    expect(periodos.find((p) => p.tipo === 'actual')?.total.anterior?.mes).toBe('202609')
  })

  it('los meses cerrados cuentan personas y los proyectados no', () => {
    const sep = periodos[0]
    expect(sep.total.personasConHorasExtra).toBe(370)
    expect(sep.total.personasMas30).toBe(1)
    expect(sep.claves[0]).toMatch(/^En septiembre se pagaron/)
    const oct = periodos.find((p) => p.tipo === 'actual')!
    expect(oct.total.personasConHorasExtra).toBeNull()
    expect(oct.claves.some((c) => c.includes('vacaciones cargados en Salario'))).toBe(true)
  })

  it('la visión anual va aparte y cuenta el límite de 200 h', () => {
    expect(anual.anio).toBe(2026)
    expect(anual.desde).toBe('202601')
    expect(anual.hasta).toBe('202609')
    expect(anual.superaron).toBe(1)
    expect(anual.claves[0]).toMatch(/^De enero a septiembre de 2026/)
  })

  it('el detalle por mes (solo RRHH) trae nombres; el reporte del Directorio no', () => {
    expect(detalle.porMes['202609'][0]).toMatchObject({ nombre: 'NOMBRE SECRETO UNO', horasTotal: 40 })
    expect(JSON.stringify(agregado.reporte)).not.toContain('NOMBRE SECRETO')
  })
})
