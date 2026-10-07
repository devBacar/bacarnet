import { CONVENIOS, convenioDeEsquema, type Convenio } from './convenios.js'
import type { AreaInforme } from './informeMensual.js'
import { excluidas, type ResultadoResumen } from './resumenMensual.js'

/**
 * Evolución mes a mes por área, para el gráfico con filtros de período (mes, trimestre, semestre, año),
 * unidad de negocio y área. Sin nombres ni legajos: lo puede ver el Directorio.
 */

export type UnidadNegocio = 'seguridad' | 'caudales' | 'tesoreria' | 'gruas' | 'estructura'

export const UNIDADES_NEGOCIO: { id: UnidadNegocio; nombre: string }[] = [
  { id: 'seguridad', nombre: 'Seguridad' },
  { id: 'caudales', nombre: 'Transporte de caudales' },
  { id: 'tesoreria', nombre: 'Tesorería' },
  { id: 'gruas', nombre: 'Grúas' },
  { id: 'estructura', nombre: 'Estructura y administración' },
]

/** Unidad de negocio según el nombre del centro de costo en Salario (Salario no tiene ese dato). */
export function unidadDeArea(nombreSalario: string | undefined): UnidadNegocio {
  const n = (nombreSalario ?? '').toLowerCase()
  if (n.includes('seguridad')) return 'seguridad'
  if (n.includes('proteccion') || n.includes('protección')) return 'caudales'
  if (n.includes('tesoreria') || n.includes('tesorería') || n.includes('cajero')) return 'tesoreria'
  if (n.includes('grua') || n.includes('grúa')) return 'gruas'
  return 'estructura'
}

export interface FilaEvolucion {
  mes: string
  tipo: 'real' | 'actual' | 'prevision'
  cc: number
  /** Personas liquidadas en el mes. */
  dotacion: number
  /** Solo meses cerrados (null en los estimados). */
  conHorasExtra: number | null
  mas30: number | null
  /** Horas normales trabajadas (días presentes × jornada del convenio, o jornal). */
  horasNormales: number
  he50: number
  he100: number
  fer: number
  comp: number
  noct: number
  /** Costo empresa (factor medido en Salario). */
  costoExtra: number
  costoFeriado: number
  costoComp: number
  diasVacaciones: number
  diasLicencia: number
  /** Horas y costo de horas pactadas incluidos arriba (solo en el año del último mes). */
  horasPactadas: number
  costoPactadas: number
}

/** Horas trabajadas por convenio y mes (solo meses cerrados). */
export interface FilaConvenio {
  mes: string
  convenio: Convenio
  personas: number
  horasNormales: number
  /** Horas extra al 50% y 100% más compensatorias. */
  horasExtra: number
  diasVacaciones: number
  diasLicencia: number
}

export interface EvolucionInforme {
  /** Convenios con nombre legible, en el orden en que se muestran. */
  convenios: { id: Convenio; nombre: string; horasMes: number; corte: 'ciclo26' | 'calendario' }[]
  porConvenio: FilaConvenio[]
  meses: string[]
  areas: { cc: number; nombre: string; unidad: UnidadNegocio }[]
  unidades: { id: UnidadNegocio; nombre: string }[]
  filas: FilaEvolucion[]
  /** Primer mes en que Salario liquida las horas en feriado con su propio concepto. */
  primerMesFeriados: string | null
  notas: string[]
}

function r1(x: number): number {
  return Math.round(x * 10) / 10
}

export function construirEvolucion(
  resultado: ResultadoResumen,
  areasInforme: AreaInforme[],
  factor: number,
  nombreArea: (cc: number) => string,
  pactado: (mes: string, cc: number) => { horas: number; monto: number },
): EvolucionInforme {
  // Personas con más de 30 h extra por mes y área.
  const mas30 = new Map<string, number>()
  for (const p of resultado.personas) {
    for (const [mes, m] of Object.entries(p.meses)) {
      if (m.horas.he50.hs + m.horas.he100.hs > 30) mas30.set(`${mes}|${m.cc}`, (mas30.get(`${mes}|${m.cc}`) ?? 0) + 1)
    }
  }

  const filas: FilaEvolucion[] = []
  const ccs = new Set<number>()
  for (const r of resultado.centrosCosto) {
    if (r.cc <= 0 || r.dotacion <= 0) continue
    ccs.add(r.cc)
    const aus = Object.entries(r.ausencias)
    const pac = pactado(r.mes, r.cc)
    filas.push({
      mes: r.mes,
      tipo: 'real',
      cc: r.cc,
      dotacion: r.dotacion,
      conHorasExtra: r.conHorasExtra,
      mas30: mas30.get(`${r.mes}|${r.cc}`) ?? 0,
      horasNormales: r1(r.horasNormales),
      he50: r1(r.horas.he50.hs),
      he100: r1(r.horas.he100.hs),
      fer: r1(r.horas.fer.hs),
      comp: r1(r.horas.comp.hs),
      noct: r1(r.horas.noct.hs),
      costoExtra: Math.round((r.horas.he50.monto + r.horas.he100.monto) * factor),
      costoFeriado: Math.round(r.horas.fer.monto * factor),
      costoComp: Math.round(r.horas.comp.monto * factor),
      diasVacaciones: r1(aus.filter(([t]) => t === 'Vacaciones').reduce((s, [, d]) => s + d, 0)),
      diasLicencia: r1(aus.filter(([t]) => t !== 'Vacaciones').reduce((s, [, d]) => s + d, 0)),
      horasPactadas: r1(pac.horas),
      costoPactadas: Math.round(pac.monto * factor),
    })
  }

  // Meses estimados: solo las áreas con modelo (las que tienen horas extra relevantes).
  const ultimoMes = resultado.ultimoMes ?? ''
  for (const a of areasInforme) {
    const pacUltimo = pactado(ultimoMes, a.cc)
    for (const m of a.meses) {
      if (m.tipo === 'real') continue
      const horasDia = CONVENIOS[a.convenio].horasMes / 30
      filas.push({
        mes: m.mes,
        tipo: m.tipo,
        cc: a.cc,
        dotacion: m.dotacion,
        conHorasExtra: null,
        mas30: null,
        horasNormales: r1(Math.max(0, m.dotacion * 30 - m.vacaciones - m.licencias) * horasDia),
        he50: r1(m.he50),
        he100: r1(m.he100),
        fer: r1(m.fer),
        comp: 0,
        noct: 0,
        costoExtra: Math.round((m.he50 + m.he100) * a.modelo.costoHoraExtra * factor),
        costoFeriado: Math.round(m.fer * a.modelo.costoHoraFeriado * factor),
        costoComp: 0,
        diasVacaciones: r1(m.vacaciones),
        diasLicencia: r1(m.licencias),
        horasPactadas: r1(pacUltimo.horas),
        costoPactadas: Math.round(pacUltimo.monto * factor),
      })
    }
  }

  // Por convenio: el convenio sale del esquema de liquidación de cada persona.
  const porConvenio = new Map<string, FilaConvenio>()
  for (const p of resultado.personas) {
    const convenio = convenioDeEsquema(resultado.catalogos.esquemasLiquidacion[p.esquemaLiquidacion])
    for (const [mes, m] of Object.entries(p.meses)) {
      const clave = `${mes}|${convenio}`
      const f = porConvenio.get(clave) ?? { mes, convenio, personas: 0, horasNormales: 0, horasExtra: 0, diasVacaciones: 0, diasLicencia: 0 }
      f.personas += 1
      f.horasNormales += m.horasNormales
      f.horasExtra += m.horas.he50.hs + m.horas.he100.hs + m.horas.comp.hs
      for (const [tipo, dias] of Object.entries(m.ausencias)) {
        if (tipo === 'Vacaciones') f.diasVacaciones += dias
        else f.diasLicencia += dias
      }
      porConvenio.set(clave, f)
    }
  }
  const ordenConvenios: Convenio[] = ['suvico', 'camioneros', 'bancarios', 'comercio', 'fuera']

  const primerMesFeriados =
    resultado.meses.find((mes) => resultado.centrosCosto.some((r) => r.mes === mes && r.horas.fer.hs > 0)) ?? null
  const areas = [...ccs]
    .map((cc) => ({ cc, nombre: nombreArea(cc), unidad: unidadDeArea(resultado.catalogos.centrosCosto[cc]) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  return {
    convenios: ordenConvenios
      .filter((c) => [...porConvenio.values()].some((f) => f.convenio === c))
      .map((c) => ({ id: c, nombre: CONVENIOS[c].nombre, horasMes: CONVENIOS[c].horasMes, corte: CONVENIOS[c].corte })),
    porConvenio: [...porConvenio.values()]
      .map((f) => ({
        ...f,
        horasNormales: r1(f.horasNormales),
        horasExtra: r1(f.horasExtra),
        diasVacaciones: r1(f.diasVacaciones),
        diasLicencia: r1(f.diasLicencia),
      }))
      .sort((a, b) => (a.mes === b.mes ? ordenConvenios.indexOf(a.convenio) - ordenConvenios.indexOf(b.convenio) : a.mes < b.mes ? -1 : 1)),
    meses: [...new Set(filas.map((f) => f.mes))].sort(),
    areas,
    unidades: UNIDADES_NEGOCIO.filter((u) => areas.some((a) => a.unidad === u.id)),
    filas,
    primerMesFeriados,
    notas: [
        ...excluidas(resultado),
      'Cada mes es el período que cubre su liquidación: SUVICO y Camioneros, del 26 del mes anterior al 25 (por ejemplo, septiembre = 26/08 al 25/09); Comercio, Bancarios y Fuera de convenio, del 1 a fin de mes.',
      'Horas normales trabajadas: días presentes (días liquidados menos vacaciones y licencias) por la jornada del convenio. Salario no tiene fichadas, así que es una estimación; para el personal por hora se usan las horas de jornal reales.',
      'Las horas trabajadas en feriado ya están dentro de los días presentes: se muestran aparte porque se pagan con recargo, pero no se suman a las horas trabajadas.',
      ...(primerMesFeriados && primerMesFeriados > resultado.meses[0]
        ? [`Hasta ${primerMesFeriados.slice(4, 6)}/${primerMesFeriados.slice(0, 4)} Salario no liquidaba las horas en feriado con su propio concepto: en los meses anteriores aparecen dentro de las horas extra.`]
        : []),
      'Costos a costo empresa (con contribuciones, provisiones y vacaciones), en pesos de cada mes, sin ajustar por inflación.',
      'Los meses estimados incluyen solo las áreas con horas extra relevantes.',
      'Unidades de negocio armadas con los centros de costo de Salario: Seguridad (seguridad privada, eventuales y planta), Transporte de caudales (Protección de Valores), Tesorería (Tesorería, servicios tercerizados y cajeros), Grúas, y Estructura (el resto).',
    ],
  }
}
