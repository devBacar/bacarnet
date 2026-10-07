import { feriadosDelMes } from './calendarioFeriados.js'
import {
  CONVENIOS,
  LIMITE_HE_ANUAL,
  LIMITE_HE_MENSUAL,
  convenioDeEsquema,
  diasVacacionesLct,
  type Convenio,
} from './convenios.js'
import { calcularFactores, costoHoraEventual, costoPersonaArea, type FactoresCosto } from './costosEmpresa.js'
import {
  CONFIG_PACTADAS_VACIA,
  detectarPactadas,
  pactadoDelMes,
  type ConfigPactadas,
  type PersonaPactada,
} from './horasPactadas.js'
import { construirCostosNomina, type CostosNomina, type PersonaCosto } from './costosNomina.js'
import { construirEvolucion, type EvolucionInforme } from './evolucion.js'
import { construirIndicadores, type IndicadoresDetalle, type IndicadoresInforme } from './indicadores.js'
import { ajustarUmbral } from './modeloArea.js'
import { construirPlanes, type InsumoPlanArea, type PlanesReduccion } from './planesReduccion.js'
import { generarFocos, generarRecomendaciones, type Foco, type Recomendacion } from './recomendaciones.js'
import { construirReporte, type PersonaMes, type ReporteMensual } from './reportePeriodos.js'
import { sumarMeses, type ResultadoResumen, type ResumenCentroCostoMes } from './resumenMensual.js'

/** Horas laborables que representa un día corrido de ausencia (5 de cada 7 días, 8 h). */
export const HORAS_POR_DIA_AUSENCIA = (5 / 7) * 8
/** Desde este mes Salario liquida las horas en feriado con su propio concepto: antes no sirven para el modelo. */
export const MES_INICIO_MODELO = '202503'
/** Meses de previsión después del mes actual. */
export const MESES_PREVISION = 3

export type TipoArea = 'ausencias' | 'estructural'
export type TipoMes = 'real' | 'actual' | 'prevision'

export interface MesArea {
  mes: string
  tipo: TipoMes
  feriados: number
  feriadosDetalle: string[]
  he50: number
  he100: number
  fer: number
  /** Costo de horas extra y feriado, sin cargas. */
  costo: number
  vacaciones: number
  licencias: number
  dotacion: number
  /** Solo meses proyectados: días de vacaciones ya cargados en Salario para ese mes. */
  vacacionesProgramadas?: number
  /** Solo meses proyectados: días de vacaciones del mismo mes del año anterior (ajustado por dotación). */
  vacacionesAnioAnterior?: number
  /** Solo áreas con umbral: días de vacaciones que el área absorbe sin horas extra adicionales. */
  cupoVacaciones?: number
  /** cupoVacaciones − vacacionesProgramadas. */
  vacacionesLibres?: number
}

export interface ModeloArea {
  tipo: TipoArea
  /** Horas de ausencia por mes que se absorben sin horas extra adicionales. */
  umbralHoras: number
  /** Horas extra por cada hora de ausencia por encima del umbral. */
  horasExtraPorHoraAusencia: number
  r2: number
  correlacion: number
  /** Horas extra 50% + 100% promedio de los últimos 3 meses. */
  base3: number
  /** Proporción de horas extra pagadas al 100%. */
  proporcion100: number
  horasFeriadoPorFeriado: number
  /** Costo de una hora extra (sin cargas). */
  costoHoraExtra: number
  costoHoraFeriado: number
}

export interface VacacionesArea {
  anio: number
  derecho: number
  otorgado: number
  pendiente: number
  /** Solo SUVICO: no tuvieron verano la temporada anterior, así que esta les corresponde. */
  debenVerano: number
  /** Solo SUVICO: ya tuvieron verano, pueden salir fuera de verano. */
  libresDeVerano: number
}

export interface LimiteArea {
  superaron: number
  vanASuperar: number
  masDe30EnElMes: number
}

/** Costos reales del área, a costo empresa (ver costosEmpresa.ts). */
export interface CostoEmpresaArea {
  /** Costo total por mes de una persona más (sin horas extra). */
  costoPersonaMes: number
  noRemunerativo: number
  productividad: number
  /** Costo empresa de una hora extra promedio y de una hora en feriado. */
  horaExtra: number
  horaFeriado: number
  /** Valor liquidado (sin cargas) de una hora al 50% y al 100%. */
  valor50: number
  valor100: number
}

export interface AreaInforme {
  cc: number
  nombre: string
  convenio: Convenio
  convenioNombre: string
  horasMes: number
  modelo: ModeloArea
  /** Costo mensual de una persona del área sin horas extra, con cargas y aguinaldo. */
  costoPersonaMes: number
  vacaciones: VacacionesArea
  limite: LimiteArea
  meses: MesArea[]
  costoEmpresa: CostoEmpresaArea
  /** Horas extra pactadas por mes en el área (promedio de los 3 meses cerrados). */
  horasPactadasMes: number
}

/** Horas pactadas para el Directorio: solo totales, sin nombres. */
export interface PactadasAgregado {
  personas: number
  horasMes: number
  /** Costo empresa por mes (último mes cerrado). */
  costoMes: number
  porArea: { cc: number; nombre: string; personas: number; horasMes: number; costoMes: number }[]
  /** Costo empresa de las horas pactadas en cada mes cerrado del año (AAAAMM → $). */
  porMes: Record<string, number>
}

export interface PersonaPactadaDetalle extends PersonaPactada {
  area: string
  /** Costo empresa por mes, último mes cerrado. */
  costoMes: number
}

export interface EventualesInforme {
  personas: number
  horas: number
  /** Costo de una hora de eventual con cargas y aguinaldo. */
  costoHora: number
  /** Horas que podrían trabajar en el mes si se los usara a jornada completa. */
  horasLibres: number
}

/** Lo que puede ver el perfil Directorio: solo agregados, sin nombres ni legajos. */
export interface InformeAgregado {
  ultimoMes: string
  reales: string[]
  actual: string
  prevision: string[]
  areas: AreaInforme[]
  eventuales: EventualesInforme
  limiteTotal: LimiteArea
  focos: Foco[]
  recomendaciones: Recomendacion[]
  factores: FactoresCosto
  pactadas: PactadasAgregado
  planes: PlanesReduccion
  /** Evolución mes a mes por área (24 meses + estimados), para el gráfico con filtros. */
  evolucion: EvolucionInforme
  /** Costos de personal mes a mes (lo pagado y lo que le cuesta a la empresa), por área, empresa y convenio. */
  costos: CostosNomina
  /** Ausentismo, licencias largas, altas, bajas y rotación por convenio y mes. */
  indicadores: IndicadoresInforme
  /** Un bloque por mes cerrado, el mes en curso, la previsión y, aparte, la visión anual. */
  reporte: ReporteMensual
}

export interface PersonaLimite {
  legajo: number
  nombre: string
  cc: number
  area: string
  puesto: string
  acumuladoAnio: number
  ultimoMes: number
  promedio3: number
  proyeccionAnio: number
  mesesSobre30: number
}

/** Solo para el perfil RRHH (rrhh_detalle): datos por persona. */
export interface InformeDetalle {
  anio: number
  limite: PersonaLimite[]
  /** Personas con más horas extra en cada mes cerrado (AAAAMM → lista). */
  porMes: Record<string, PersonaMes[]>
  /** Horas pactadas con nombre (solo RRHH). */
  pactadas: PersonaPactadaDetalle[]
  /** Personas que RRHH sacó de la lista de pactadas (para poder volver a agregarlas). */
  pactadasDescartadas: { legajo: number; nombre: string; area: string }[]
  /** Licencias largas en curso y bajas tempranas, con nombre (solo RRHH). */
  indicadores: IndicadoresDetalle
}

export interface Informe {
  agregado: InformeAgregado
  detalle: InformeDetalle
  /** Personas con sus importes, por mes (AAAAMM): solo RRHH, un documento por mes. */
  personasCostos: Record<string, PersonaCosto[]>
}

const HORAS_EXTRA_MINIMAS_AREA = 50

/** Nombre legible del centro de costo ("SERVICIO DE SEGURIDAD PRIVADA - Personal Permanente" → "Seguridad Privada"). */
export function nombreArea(nombreSalario: string | undefined, cc: number): string {
  if (!nombreSalario) return `Centro de costo ${cc} (sin nombre en Salario)`
  const limpio = nombreSalario
    .toLowerCase()
    .replace(/servicio de seguridad privada - personal permanente/, 'seguridad privada')
    .replace(/servicio de seguridad privada - /, 'seguridad privada · ')
    .replace(/servicios de tesoreria tercerizados/, 'servicios de tesorería tercerizados')
    .replace(/proteccion/, 'protección')
    .replace(/^tesoreria$/, 'tesorería')
    .replace(/gruas/, 'grúas')
    .split(' ')
    .map((p, i) => (i > 0 && ['de', 'y', 'del'].includes(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ')
  return limpio
}

function mesesEntre(desde: string, hasta: string): string[] {
  const out: string[] = []
  for (let m = desde; m <= hasta; m = sumarMeses(m, 1)) out.push(m)
  return out
}

function diasPorMes(desde: string, hasta: string, meses: Set<string>): Map<string, number> {
  const out = new Map<string, number>()
  const fin = Date.parse(`${hasta}T00:00:00Z`)
  for (let t = Date.parse(`${desde}T00:00:00Z`); t <= fin; t += 86_400_000) {
    const d = new Date(t)
    const mes = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    if (meses.has(mes)) out.set(mes, (out.get(mes) ?? 0) + 1)
  }
  return out
}

function horasCore(r: ResumenCentroCostoMes | undefined): number {
  return r ? r.horas.he50.hs + r.horas.he100.hs : 0
}

function diasAusencia(r: ResumenCentroCostoMes | undefined): number {
  if (!r) return 0
  return Object.values(r.ausencias).reduce((s, d) => s + d, 0)
}

function diasLicencia(r: ResumenCentroCostoMes | undefined): number {
  return r ? diasAusencia(r) - (r.ausencias.Vacaciones ?? 0) : 0
}

/**
 * Arma el informe mensual: últimos 3 meses liquidados, mes actual proyectado y 3 de previsión,
 * con el modelo de cada área, vacaciones, límite legal, focos y recomendaciones.
 * Reproduce `modelo_mensual.py`, validado con el backup del 05/10/2026.
 */
export function construirInforme(
  resultado: ResultadoResumen,
  opciones: { pactadas?: ConfigPactadas } = {},
): Informe {
  const ultimoMes = resultado.ultimoMes
  if (!ultimoMes) throw new Error('No hay meses liquidados para armar el informe')
  const reales = [sumarMeses(ultimoMes, -2), sumarMeses(ultimoMes, -1), ultimoMes]
  const actual = sumarMeses(ultimoMes, 1)
  const prevision = Array.from({ length: MESES_PREVISION }, (_, i) => sumarMeses(actual, i + 1))
  const proyectados = [actual, ...prevision]
  const horizonte = [...reales, ...proyectados]

  const porCc = new Map<number, Map<string, ResumenCentroCostoMes>>()
  for (const r of resultado.centrosCosto) {
    let m = porCc.get(r.cc)
    if (!m) porCc.set(r.cc, (m = new Map()))
    m.set(r.mes, r)
  }
  const g = (cc: number, mes: string) => porCc.get(cc)?.get(mes)

  const feriados = new Map<string, { cantidad: number; detalle: string[] }>()
  for (const mes of resultado.meses) feriados.set(mes, { cantidad: resultado.feriadosPorMes[mes] ?? 0, detalle: [] })
  for (const mes of proyectados) {
    const f = feriadosDelMes(mes)
    feriados.set(mes, { cantidad: f.cantidad, detalle: f.detalle })
  }

  // Convenio de cada área: el esquema de liquidación más común entre sus personas del último mes.
  const esquemasPorCc = new Map<number, Map<number, number>>()
  const activos = resultado.personas.filter((p) => p.meses[ultimoMes])
  for (const p of activos) {
    const cc = p.meses[ultimoMes].cc
    let m = esquemasPorCc.get(cc)
    if (!m) esquemasPorCc.set(cc, (m = new Map()))
    m.set(p.esquemaLiquidacion, (m.get(p.esquemaLiquidacion) ?? 0) + 1)
  }
  const convenioDe = (cc: number): Convenio => {
    const m = esquemasPorCc.get(cc)
    if (!m) return 'fuera'
    const [esquema] = [...m.entries()].sort((a, b) => b[1] - a[1])[0]
    return convenioDeEsquema(resultado.catalogos.esquemasLiquidacion[esquema])
  }

  const mesesModelo = resultado.meses.filter((m) => m >= MES_INICIO_MODELO && m <= ultimoMes)
  const ultimos6 = resultado.meses.slice(-6)

  // Meses que quedan de la temporada de vacaciones (1/10 al 30/4), desde el mes actual.
  const mesesTemporada: string[] = []
  for (let m = actual; mesesTemporada.length < 7; m = sumarMeses(m, 1)) {
    const n = Number(m.slice(4, 6))
    if (n >= 5 && n <= 9) break
    mesesTemporada.push(m)
  }

  // Vacaciones programadas por área y mes (días corridos que caen en cada mes).
  const programadas = new Map<number, Map<string, number>>()
  const setProyectados = new Set([...proyectados, ...mesesTemporada])
  for (const p of activos) {
    const cc = p.meses[ultimoMes].cc
    for (const v of p.vacaciones) {
      for (const [mes, dias] of diasPorMes(v.desde, v.hasta, setProyectados)) {
        let m = programadas.get(cc)
        if (!m) programadas.set(cc, (m = new Map()))
        m.set(mes, (m.get(mes) ?? 0) + dias)
      }
    }
  }

  // Año de vacaciones en curso: la temporada va del 1/10 al 30/4 (LCT art. 154).
  const mesActualNum = Number(actual.slice(4, 6))
  const anioVac = mesActualNum >= 10 ? Number(actual.slice(0, 4)) : Number(actual.slice(0, 4)) - 1
  const inicioVerano = `${anioVac - 1}-12-21`
  const finVerano = `${anioVac}-03-20`
  const inicioTemporada = `${anioVac}-10-01`

  const vacacionesPorCc = new Map<number, VacacionesArea>()
  for (const p of activos) {
    const cc = p.meses[ultimoMes].cc
    let v = vacacionesPorCc.get(cc)
    if (!v) {
      v = { anio: anioVac, derecho: 0, otorgado: 0, pendiente: 0, debenVerano: 0, libresDeVerano: 0 }
      vacacionesPorCc.set(cc, v)
    }
    const derecho = diasVacacionesLct(p.fechaIngreso, anioVac)
    const yaDadas = p.vacaciones
      .filter((x) => x.desde >= inicioTemporada || x.anio === anioVac)
      .reduce((s, x) => s + x.dias, 0)
    const otorgado = Math.min(derecho, yaDadas)
    v.derecho += derecho
    v.otorgado += otorgado
    v.pendiente += derecho - otorgado
    if (convenioDe(cc) === 'suvico') {
      const tuvoVerano = p.vacaciones.some((x) => x.desde <= finVerano && x.hasta >= inicioVerano)
      if (tuvoVerano) v.libresDeVerano += 1
      else v.debenVerano += 1
    }
  }

  // Límite legal por persona (Decreto 484/2000): año calendario del último mes liquidado.
  const anioLimite = Number(ultimoMes.slice(0, 4))
  const mesesRestantes = 12 - Number(ultimoMes.slice(4, 6))
  const limite: PersonaLimite[] = []
  for (const p of resultado.personas) {
    const delAnio = Object.entries(p.meses).filter(([m]) => m.startsWith(String(anioLimite)))
    if (delAnio.length === 0) continue
    const horasMes = (mes: string) => {
      const x = p.meses[mes]
      return x ? x.horas.he50.hs + x.horas.he100.hs : 0
    }
    const acumulado = delAnio.reduce((s, [m]) => s + horasMes(m), 0)
    const ultimo = horasMes(ultimoMes)
    const promedio3 = reales.reduce((s, m) => s + horasMes(m), 0) / 3
    const proyeccion = acumulado + promedio3 * mesesRestantes
    const sobre30 = delAnio.filter(([m]) => horasMes(m) > LIMITE_HE_MENSUAL).length
    if (acumulado > 150 || ultimo > LIMITE_HE_MENSUAL || proyeccion > LIMITE_HE_ANUAL) {
      limite.push({
        legajo: p.legajo,
        nombre: p.nombre,
        cc: p.cc,
        area: nombreArea(resultado.catalogos.centrosCosto[p.cc], p.cc),
        puesto: resultado.catalogos.puestos[p.puesto] ?? '',
        acumuladoAnio: Math.round(acumulado * 10) / 10,
        ultimoMes: Math.round(ultimo * 10) / 10,
        promedio3: Math.round(promedio3 * 10) / 10,
        proyeccionAnio: Math.round(proyeccion),
        mesesSobre30: sobre30,
      })
    }
  }
  limite.sort((a, b) => b.acumuladoAnio - a.acumuladoAnio)
  const limitePorCc = new Map<number, LimiteArea>()
  const totalLimite: LimiteArea = { superaron: 0, vanASuperar: 0, masDe30EnElMes: 0 }
  for (const x of limite) {
    let l = limitePorCc.get(x.cc)
    if (!l) limitePorCc.set(x.cc, (l = { superaron: 0, vanASuperar: 0, masDe30EnElMes: 0 }))
    for (const dest of [l, totalLimite]) {
      if (x.acumuladoAnio > LIMITE_HE_ANUAL) dest.superaron += 1
      else if (x.proyeccionAnio > LIMITE_HE_ANUAL) dest.vanASuperar += 1
      if (x.ultimoMes > LIMITE_HE_MENSUAL) dest.masDe30EnElMes += 1
    }
  }

  // Costos reales (costosEmpresa.ts) y horas pactadas (horasPactadas.ts).
  const diasVacacionesPromedio = activos.length
    ? activos.reduce((s, p) => s + diasVacacionesLct(p.fechaIngreso, anioVac), 0) / activos.length
    : 14
  const factores = calcularFactores(resultado, diasVacacionesPromedio)
  const mesCostos = factores.mesBase || ultimoMes
  const pactadas = detectarPactadas(
    resultado,
    opciones.pactadas ?? CONFIG_PACTADAS_VACIA,
    (puesto) => resultado.catalogos.puestos[puesto] ?? '',
  )
  const legajosPactados = new Set(pactadas.map((p) => p.legajo))
  const pactado = new Map<string, { horas: number; monto: number }>()
  const mesesAnio = resultado.meses.filter((m) => m.startsWith(ultimoMes.slice(0, 4)) && m <= ultimoMes)
  for (const pp of pactadas) {
    for (const mes of new Set([...mesesAnio, ...reales])) {
      const x = pactadoDelMes(resultado, pp, mes)
      if (!x) continue
      const clave = `${mes}|${x.cc}`
      const acc = pactado.get(clave) ?? { horas: 0, monto: 0 }
      acc.horas += x.horas
      acc.monto += x.monto
      pactado.set(clave, acc)
    }
  }
  const pactadoMes = (mes: string, cc?: number) => {
    let horas = 0
    let monto = 0
    for (const [clave, v] of pactado) {
      const [m, c] = clave.split('|')
      if (m === mes && (cc === undefined || Number(c) === cc)) {
        horas += v.horas
        monto += v.monto
      }
    }
    return { horas, monto }
  }
  const insumosPlan: InsumoPlanArea[] = []

  // Áreas del informe: con dotación o con horas extra relevantes en los últimos 3 meses.
  const ccsUltimo = [...porCc.keys()].filter((cc) => g(cc, ultimoMes))
  const areas: AreaInforme[] = []
  for (const cc of ccsUltimo) {
    const core3 = reales.map((m) => horasCore(g(cc, m)))
    const base3 = core3.reduce((s, x) => s + x, 0) / 3
    const dotacion = g(cc, ultimoMes)?.dotacion ?? 0
    // Áreas sin horas extra relevantes no entran al informe, aunque tengan mucha dotación.
    if (cc <= 0 || base3 < HORAS_EXTRA_MINIMAS_AREA) continue

    const X = mesesModelo.map((m) => diasAusencia(g(cc, m)) * HORAS_POR_DIA_AUSENCIA)
    const Y = mesesModelo.map((m) => horasCore(g(cc, m)))
    const ajuste = ajustarUmbral(X, Y)
    const tipo: TipoArea = ajuste.r2 >= 0.25 && ajuste.correlacion >= 0.4 ? 'ausencias' : 'estructural'
    let he50 = 0
    let he100 = 0
    let ferHs = 0
    let ferMonto = 0
    let nFer = 0
    for (const m of mesesModelo) {
      const r = g(cc, m)
      he50 += r?.horas.he50.hs ?? 0
      he100 += r?.horas.he100.hs ?? 0
      ferHs += r?.horas.fer.hs ?? 0
      ferMonto += r?.horas.fer.monto ?? 0
      nFer += feriados.get(m)?.cantidad ?? 0
    }
    const montoCore3 = reales.reduce((s, m) => s + (g(cc, m)?.horas.he50.monto ?? 0) + (g(cc, m)?.horas.he100.monto ?? 0), 0)
    const modelo: ModeloArea = {
      tipo,
      umbralHoras: ajuste.k,
      horasExtraPorHoraAusencia: ajuste.b,
      r2: ajuste.r2,
      correlacion: ajuste.correlacion,
      base3,
      proporcion100: he100 / Math.max(1, he50 + he100),
      horasFeriadoPorFeriado: nFer ? ferHs / nFer : 0,
      costoHoraExtra: montoCore3 / Math.max(1, core3.reduce((s, x) => s + x, 0)),
      costoHoraFeriado: ferMonto / Math.max(1, ferHs),
    }
    const predecir = (horasAusencia: number) =>
      tipo === 'estructural' ? base3 : ajuste.a + ajuste.b * Math.max(0, horasAusencia - ajuste.k)

    const licencias6 = ultimos6.reduce((s, m) => s + diasLicencia(g(cc, m)), 0) / Math.max(1, ultimos6.length)

    const meses: MesArea[] = horizonte.map((mes) => {
      const f = feriados.get(mes) ?? { cantidad: 0, detalle: [] }
      if (reales.includes(mes)) {
        const r = g(cc, mes)
        return {
          mes,
          tipo: 'real',
          feriados: f.cantidad,
          feriadosDetalle: f.detalle,
          he50: r?.horas.he50.hs ?? 0,
          he100: r?.horas.he100.hs ?? 0,
          fer: r?.horas.fer.hs ?? 0,
          costo: (r?.horas.he50.monto ?? 0) + (r?.horas.he100.monto ?? 0) + (r?.horas.fer.monto ?? 0),
          vacaciones: r?.ausencias.Vacaciones ?? 0,
          licencias: diasLicencia(r),
          dotacion: r?.dotacion ?? 0,
        }
      }
      const anioAnterior = sumarMeses(mes, -12)
      const ratio = dotacion / Math.max(1, g(cc, anioAnterior)?.dotacion ?? 0)
      const vacHist = (g(cc, anioAnterior)?.ausencias.Vacaciones ?? 0) * ratio
      const vacProg = programadas.get(cc)?.get(mes) ?? 0
      const vac = Math.max(vacHist, vacProg)
      const core = predecir((vac + licencias6) * HORAS_POR_DIA_AUSENCIA)
      const fer = modelo.horasFeriadoPorFeriado * f.cantidad
      const fila: MesArea = {
        mes,
        tipo: mes === actual ? 'actual' : 'prevision',
        feriados: f.cantidad,
        feriadosDetalle: f.detalle,
        he50: core * (1 - modelo.proporcion100),
        he100: core * modelo.proporcion100,
        fer,
        costo: core * modelo.costoHoraExtra + fer * modelo.costoHoraFeriado,
        vacaciones: vac,
        licencias: licencias6,
        dotacion,
        vacacionesProgramadas: vacProg,
        vacacionesAnioAnterior: vacHist,
      }
      if (tipo === 'ausencias') {
        const cupo = Math.max(0, ajuste.k / HORAS_POR_DIA_AUSENCIA - licencias6)
        fila.cupoVacaciones = cupo
        fila.vacacionesLibres = cupo - vacProg
      }
      return fila
    })

    const convenio = convenioDe(cc)
    const suma = (f: (r: ResumenCentroCostoMes) => number) => reales.reduce((s, m) => s + (g(cc, m) ? f(g(cc, m)!) : 0), 0)
    const valor50 = suma((r) => r.horas.he50.monto) / Math.max(1, suma((r) => r.horas.he50.hs))
    const valor100 = suma((r) => r.horas.he100.monto) / Math.max(1, suma((r) => r.horas.he100.hs))
    const persona = costoPersonaArea(resultado, cc, mesCostos, factores, legajosPactados)
    const costoEmpresa: CostoEmpresaArea = {
      costoPersonaMes: Math.round(persona.costoMes),
      noRemunerativo: Math.round(persona.noRemunerativo),
      productividad: Math.round(persona.productividad * 1000) / 1000,
      horaExtra: Math.round(modelo.costoHoraExtra * factores.total),
      horaFeriado: Math.round(modelo.costoHoraFeriado * factores.total),
      valor50: Math.round(valor50),
      valor100: Math.round(valor100),
    }
    const horasPactadasMes = reales.reduce((s, m) => s + pactadoMes(m, cc).horas, 0) / 3
    const sinPactadas = Math.max(0, base3 - horasPactadasMes)
    const cupoMes = tipo === 'ausencias' ? Math.max(0, ajuste.k / HORAS_POR_DIA_AUSENCIA - licencias6) : 0
    const nombre = nombreArea(resultado.catalogos.centrosCosto[cc], cc)
    insumosPlan.push({
      cc,
      nombre,
      tipo,
      convenio,
      horasMes: CONVENIOS[convenio].horasMes,
      horasExtraMes: sinPactadas,
      horasHabituales: tipo === 'estructural' ? sinPactadas : Math.min(sinPactadas, Math.max(0, ajuste.a)),
      proporcion100: modelo.proporcion100,
      valor50,
      valor100,
      horaExtraEmpresa: modelo.costoHoraExtra * factores.total,
      horaFeriadoEmpresa: modelo.costoHoraFeriado * factores.total,
      horasFeriadoPorFeriado: modelo.horasFeriadoPorFeriado,
      costoPersonaMes: persona.costoMes,
      productividad: persona.productividad,
      horasExtraPorHoraAusencia: ajuste.b,
      temporada: mesesTemporada.map((mes) => {
        const anterior = sumarMeses(mes, -12)
        const ratio = dotacion / Math.max(1, g(cc, anterior)?.dotacion ?? 0)
        const historico = (g(cc, anterior)?.ausencias.Vacaciones ?? 0) * ratio
        return { mes, vacaciones: Math.max(historico, programadas.get(cc)?.get(mes) ?? 0), cupo: cupoMes }
      }),
    })
    areas.push({
      cc,
      nombre,
      convenio,
      convenioNombre: CONVENIOS[convenio].nombre,
      horasMes: CONVENIOS[convenio].horasMes,
      modelo,
      costoPersonaMes: costoEmpresa.costoPersonaMes,
      vacaciones: vacacionesPorCc.get(cc) ?? {
        anio: anioVac,
        derecho: 0,
        otorgado: 0,
        pendiente: 0,
        debenVerano: 0,
        libresDeVerano: 0,
      },
      limite: limitePorCc.get(cc) ?? { superaron: 0, vanASuperar: 0, masDe30EnElMes: 0 },
      meses: meses.map(redondearMes),
      costoEmpresa,
      horasPactadasMes: Math.round(horasPactadasMes * 10) / 10,
    })
  }
  areas.sort((a, b) => b.modelo.base3 * b.modelo.costoHoraExtra - a.modelo.base3 * a.modelo.costoHoraExtra)

  // Eventuales: áreas de seguridad privada eventual, liquidadas por hora (jornal).
  const eventuales: EventualesInforme = { personas: 0, horas: 0, costoHora: 0, horasLibres: 0 }
  let remEventuales = 0
  const ccsEventuales: number[] = []
  for (const cc of ccsUltimo) {
    const nombre = (resultado.catalogos.centrosCosto[cc] ?? '').toLowerCase()
    if (!nombre.includes('eventual')) continue
    const r = g(cc, ultimoMes)!
    ccsEventuales.push(cc)
    eventuales.personas += r.dotacion
    eventuales.horas += r.horas.jornal.hs
    remEventuales += r.totales.rem
  }
  if (eventuales.horas > 0) {
    // Costo real del recibo completo; si el mes no trae costo laboral, el remunerativo con las tasas medidas.
    eventuales.costoHora =
      costoHoraEventual(resultado, ccsEventuales, mesCostos, factores) ||
      (remEventuales / eventuales.horas) * factores.total
  }
  eventuales.horasLibres = Math.max(0, eventuales.personas * CONVENIOS.suvico.horasMes - eventuales.horas)

  const { personasPorMes: personasCostos, ...costos } = construirCostosNomina(resultado, (cc) => nombreArea(resultado.catalogos.centrosCosto[cc], cc))
  const indicadores = construirIndicadores(resultado, (cc) => nombreArea(resultado.catalogos.centrosCosto[cc], cc))
  const base: Omit<InformeAgregado, 'reporte'> = {
    ultimoMes,
    reales,
    actual,
    prevision,
    areas,
    eventuales: {
      ...eventuales,
      horas: Math.round(eventuales.horas),
      costoHora: Math.round(eventuales.costoHora),
      horasLibres: Math.round(eventuales.horasLibres),
    },
    limiteTotal: totalLimite,
    focos: [],
    recomendaciones: [],
    factores,
    pactadas: pactadasAgregado(ultimoMes),
    costos,
    indicadores: indicadores.indicadores,
    evolucion: construirEvolucion(
      resultado,
      areas,
      factores.total,
      (cc) => nombreArea(resultado.catalogos.centrosCosto[cc], cc),
      pactadoMes,
    ),
    planes: construirPlanes({
      areas: insumosPlan,
      factores,
      feriadosAnio: Array.from({ length: 12 }, (_, i) => feriadosDelMes(sumarMeses(actual, i)).cantidad).reduce((s, x) => s + x, 0),
      eventuales: { personas: eventuales.personas, horasLibresMes: eventuales.horasLibres, costoHora: eventuales.costoHora },
      gastoMensual:
        reales.reduce(
          (s, m) =>
            s +
            resultado.centrosCosto
              .filter((r) => r.mes === m)
              .reduce((t, r) => t + r.horas.he50.monto + r.horas.he100.monto + r.horas.fer.monto, 0),
          0,
        ) /
        3 *
        factores.total,
      pactadasMensual: (reales.reduce((s, m) => s + pactadoMes(m).monto, 0) / 3) * factores.total,
    }),
  }
  base.recomendaciones = generarRecomendaciones(base)
  base.focos = generarFocos(base)
  const { reporte, porMes } = construirReporte(
    resultado,
    areas,
    { reales, actual, prevision },
    (mes) => feriados.get(mes) ?? { cantidad: 0, detalle: [] },
    totalLimite,
    factores.total,
    base.pactadas.porMes,
    Object.fromEntries([...pactado.entries()].map(([clave, v]) => [clave, v.monto * factores.total])),
  )
  const agregado: InformeAgregado = { ...base, reporte }
  const pactadasDetalle: PersonaPactadaDetalle[] = pactadas.map((pp) => ({
    ...pp,
    area: nombreArea(resultado.catalogos.centrosCosto[pp.cc], pp.cc),
    costoMes: Math.round((pactadoDelMes(resultado, pp, ultimoMes)?.monto ?? 0) * factores.total),
  }))
  const pactadasDescartadas = (opciones.pactadas?.descartadas ?? []).flatMap((legajo) => {
    const p = resultado.personas.find((x) => x.legajo === legajo)
    return p ? [{ legajo, nombre: p.nombre.trim(), area: nombreArea(resultado.catalogos.centrosCosto[p.cc], p.cc) }] : []
  })
  return { agregado, personasCostos, detalle: { anio: anioLimite, limite, porMes, pactadas: pactadasDetalle, pactadasDescartadas, indicadores: indicadores.detalle } }

  function pactadasAgregado(ultimo: string): PactadasAgregado {
    const porArea = new Map<number, { personas: number; horasMes: number; costoMes: number }>()
    for (const pp of pactadas) {
      const x = porArea.get(pp.cc) ?? { personas: 0, horasMes: 0, costoMes: 0 }
      x.personas += 1
      porArea.set(pp.cc, x)
    }
    for (const [cc, x] of porArea) {
      const v = pactadoMes(ultimo, cc)
      x.horasMes = Math.round(v.horas * 10) / 10
      x.costoMes = Math.round(v.monto * factores.total)
    }
    const total = pactadoMes(ultimo)
    const porMesPactado: Record<string, number> = {}
    for (const m of new Set([...mesesAnio, ...reales])) porMesPactado[m] = Math.round(pactadoMes(m).monto * factores.total)
    return {
      personas: pactadas.length,
      horasMes: Math.round(total.horas * 10) / 10,
      costoMes: Math.round(total.monto * factores.total),
      porArea: [...porArea.entries()]
        .map(([cc, x]) => ({ cc, nombre: nombreArea(resultado.catalogos.centrosCosto[cc], cc), ...x }))
        .sort((a, b) => b.costoMes - a.costoMes),
      porMes: porMesPactado,
    }
  }
}

function redondearMes(m: MesArea): MesArea {
  const r1 = (x: number) => Math.round(x * 10) / 10
  const out: MesArea = {
    ...m,
    he50: r1(m.he50),
    he100: r1(m.he100),
    fer: r1(m.fer),
    costo: Math.round(m.costo),
    vacaciones: r1(m.vacaciones),
    licencias: r1(m.licencias),
  }
  if (m.vacacionesProgramadas !== undefined) out.vacacionesProgramadas = r1(m.vacacionesProgramadas)
  if (m.vacacionesAnioAnterior !== undefined) out.vacacionesAnioAnterior = r1(m.vacacionesAnioAnterior)
  if (m.cupoVacaciones !== undefined) out.cupoVacaciones = r1(m.cupoVacaciones)
  if (m.vacacionesLibres !== undefined) out.vacacionesLibres = r1(m.vacacionesLibres)
  return out
}

export { mesesEntre }
