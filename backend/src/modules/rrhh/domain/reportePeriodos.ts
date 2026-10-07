import { LIMITE_HE_ANUAL, LIMITE_HE_MENSUAL } from './convenios.js'
import type { AreaInforme, LimiteArea, TipoMes } from './informeMensual.js'
import { nombreMes, pesos } from './recomendaciones.js'
import { sumarMeses, type ResultadoResumen, type ResumenCentroCostoMes } from './resumenMensual.js'

/**
 * Reporte por período, pensado para leerse sin conocer el tema:
 * un bloque por cada mes cerrado (hasta 3 atrás), uno del mes en curso, uno de previsión
 * y, aparte, una visión anual. Todo el texto sale armado acá para que sea igual en todas las pantallas.
 */

const HORAS_POR_DIA = (5 / 7) * 8

export interface CausasHoras {
  /** Horas extra para cubrir a quienes estaban de vacaciones o de licencia. */
  ausencias: number
  /** Horas extra que se repiten todos los meses (turnos, falta de personal fijo). */
  habituales: number
  /** Horas trabajadas en feriado. */
  feriados: number
}

export interface CifrasPeriodo {
  horas50: number
  horas100: number
  horasFeriado: number
  horasTotal: number
  /** Costo para la empresa: horas extra y feriados con cargas sociales y aguinaldo. */
  costo: number
  dotacion: number
  /** Solo meses cerrados. */
  personasConHorasExtra: number | null
  /** Solo meses cerrados: personas con más de 30 h extra en el mes (Decreto 484/2000). */
  personasMas30: number | null
  diasVacaciones: number
  diasLicencia: number
  /** Solo meses cerrados, de mayor a menor. */
  licenciasPorTipo: { tipo: string; dias: number }[]
  causas: CausasHoras
  anterior: { mes: string; horasTotal: number; costo: number } | null
  /** Solo meses proyectados: días de vacaciones ya cargados en Salario. */
  vacacionesCargadas?: number
  /** Solo meses proyectados: días de vacaciones que se pueden sumar sin generar horas extra. */
  vacacionesPosibles?: number
}

export interface AreaPeriodo extends CifrasPeriodo {
  cc: number
  nombre: string
  /** Costo empresa de horas pactadas incluido en el costo del área. */
  costoPactadas: number
  claves: string[]
}

export interface PeriodoReporte {
  mes: string
  /** Costo empresa de las horas pactadas incluido en el total (en los meses estimados, el del último mes cerrado). */
  costoPactadas: number
  tipo: TipoMes
  feriados: number
  feriadosDetalle: string[]
  total: CifrasPeriodo
  claves: string[]
  areas: AreaPeriodo[]
}

export interface AreaAnual {
  cc: number
  nombre: string
  horasTotal: number
  costo: number
  superaron: number
  vanASuperar: number
  vacacionesPendientes: number
  vacacionesDerecho: number
  claves: string[]
}

export interface VisionAnual {
  /** Costo empresa de las horas pactadas en el año, incluido en el costo. */
  costoPactadas: number
  anio: number
  desde: string
  hasta: string
  horas50: number
  horas100: number
  horasFeriado: number
  horasTotal: number
  costo: number
  costoPromedioMes: number
  mesMasAlto: { mes: string; horasTotal: number; costo: number } | null
  superaron: number
  vanASuperar: number
  vacaciones: { temporada: number; derecho: number; otorgado: number; pendiente: number }
  areas: AreaAnual[]
  claves: string[]
}

export interface ReporteMensual {
  periodos: PeriodoReporte[]
  anual: VisionAnual
}

/** Solo para el perfil RRHH: todas las personas que cobraron horas extra en cada mes cerrado. */
export interface PersonaMes {
  legajo: number
  nombre: string
  /** Centro de costo del recibo y el área del reporte en la que se suma (-1 = "Otras áreas"). */
  cc: number
  ccReporte: number
  area: string
  puesto: string
  horas50: number
  horas100: number
  horasFeriado: number
  horasTotal: number
  superaLimiteMes: boolean
}

export const OTRAS_AREAS_CC = -1
const NOMBRE_OTRAS = 'Otras áreas'

const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

function capital(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function r1(x: number): number {
  return Math.round(x * 10) / 10
}

function plural(n: number, uno: string, varios: string): string {
  return `${nf.format(n)} ${n === 1 ? uno : varios}`
}

function porcentaje(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0
}

function cifrasVacias(): CifrasPeriodo {
  return {
    horas50: 0,
    horas100: 0,
    horasFeriado: 0,
    horasTotal: 0,
    costo: 0,
    dotacion: 0,
    personasConHorasExtra: null,
    personasMas30: null,
    diasVacaciones: 0,
    diasLicencia: 0,
    licenciasPorTipo: [],
    causas: { ausencias: 0, habituales: 0, feriados: 0 },
    anterior: null,
  }
}

function sumar(destino: CifrasPeriodo, c: CifrasPeriodo): void {
  destino.horas50 += c.horas50
  destino.horas100 += c.horas100
  destino.horasFeriado += c.horasFeriado
  destino.horasTotal += c.horasTotal
  destino.costo += c.costo
  destino.dotacion += c.dotacion
  if (c.personasConHorasExtra !== null) destino.personasConHorasExtra = (destino.personasConHorasExtra ?? 0) + c.personasConHorasExtra
  if (c.personasMas30 !== null) destino.personasMas30 = (destino.personasMas30 ?? 0) + c.personasMas30
  destino.diasVacaciones += c.diasVacaciones
  destino.diasLicencia += c.diasLicencia
  destino.causas.ausencias += c.causas.ausencias
  destino.causas.habituales += c.causas.habituales
  destino.causas.feriados += c.causas.feriados
  if (c.vacacionesCargadas !== undefined) destino.vacacionesCargadas = (destino.vacacionesCargadas ?? 0) + c.vacacionesCargadas
  if (c.vacacionesPosibles !== undefined) destino.vacacionesPosibles = (destino.vacacionesPosibles ?? 0) + c.vacacionesPosibles
  const tipos = new Map(destino.licenciasPorTipo.map((l) => [l.tipo, l.dias]))
  for (const l of c.licenciasPorTipo) tipos.set(l.tipo, (tipos.get(l.tipo) ?? 0) + l.dias)
  destino.licenciasPorTipo = [...tipos.entries()].map(([tipo, dias]) => ({ tipo, dias })).sort((a, b) => b.dias - a.dias)
}

function restar(total: CifrasPeriodo, partes: CifrasPeriodo[]): CifrasPeriodo {
  const suma = cifrasVacias()
  for (const p of partes) sumar(suma, p)
  const tipos = new Map(total.licenciasPorTipo.map((l) => [l.tipo, l.dias]))
  for (const l of suma.licenciasPorTipo) tipos.set(l.tipo, (tipos.get(l.tipo) ?? 0) - l.dias)
  return {
    horas50: total.horas50 - suma.horas50,
    horas100: total.horas100 - suma.horas100,
    horasFeriado: total.horasFeriado - suma.horasFeriado,
    horasTotal: total.horasTotal - suma.horasTotal,
    costo: total.costo - suma.costo,
    dotacion: total.dotacion - suma.dotacion,
    personasConHorasExtra:
      total.personasConHorasExtra === null ? null : total.personasConHorasExtra - (suma.personasConHorasExtra ?? 0),
    personasMas30: total.personasMas30 === null ? null : total.personasMas30 - (suma.personasMas30 ?? 0),
    diasVacaciones: total.diasVacaciones - suma.diasVacaciones,
    diasLicencia: total.diasLicencia - suma.diasLicencia,
    licenciasPorTipo: [...tipos.entries()]
      .filter(([, d]) => d > 0)
      .map(([tipo, dias]) => ({ tipo, dias }))
      .sort((a, b) => b.dias - a.dias),
    causas: {
      ausencias: total.causas.ausencias - suma.causas.ausencias,
      habituales: total.causas.habituales - suma.causas.habituales,
      feriados: total.causas.feriados - suma.causas.feriados,
    },
    anterior: null,
  }
}

function redondear<T extends CifrasPeriodo>(c: T): T {
  return {
    ...c,
    horas50: r1(c.horas50),
    horas100: r1(c.horas100),
    horasFeriado: r1(c.horasFeriado),
    horasTotal: r1(c.horasTotal),
    costo: Math.round(c.costo),
    diasVacaciones: r1(c.diasVacaciones),
    diasLicencia: r1(c.diasLicencia),
    causas: { ausencias: r1(c.causas.ausencias), habituales: r1(c.causas.habituales), feriados: r1(c.causas.feriados) },
    ...(c.vacacionesCargadas !== undefined ? { vacacionesCargadas: r1(c.vacacionesCargadas) } : {}),
    ...(c.vacacionesPosibles !== undefined ? { vacacionesPosibles: r1(c.vacacionesPosibles) } : {}),
  }
}

/** Reparte las horas extra comunes entre "cubrir ausencias" y "habituales" según el modelo del área. */
function causas(core: number, fer: number, horasAusencia: number, area: AreaInforme | undefined): CausasHoras {
  if (!area || area.modelo.tipo !== 'ausencias') return { ausencias: 0, habituales: core, feriados: fer }
  const porAusencias = Math.min(
    core,
    area.modelo.horasExtraPorHoraAusencia * Math.max(0, horasAusencia - area.modelo.umbralHoras),
  )
  return { ausencias: porAusencias, habituales: core - porAusencias, feriados: fer }
}

function cifrasReales(
  r: ResumenCentroCostoMes | undefined,
  area: AreaInforme | undefined,
  mas30: number,
  carga: number,
): CifrasPeriodo {
  const c = cifrasVacias()
  c.personasConHorasExtra = 0
  c.personasMas30 = mas30
  if (!r) return c
  const he50 = r.horas.he50.hs
  const he100 = r.horas.he100.hs
  const fer = r.horas.fer.hs
  const vac = r.ausencias.Vacaciones ?? 0
  const licencias = Object.entries(r.ausencias)
    .filter(([tipo]) => tipo !== 'Vacaciones')
    .map(([tipo, dias]) => ({ tipo, dias }))
    .filter((l) => l.dias > 0)
    .sort((a, b) => b.dias - a.dias)
  const lic = licencias.reduce((s, l) => s + l.dias, 0)
  return {
    ...c,
    horas50: he50,
    horas100: he100,
    horasFeriado: fer,
    horasTotal: he50 + he100 + fer,
    costo: (r.horas.he50.monto + r.horas.he100.monto + r.horas.fer.monto) * carga,
    dotacion: r.dotacion,
    personasConHorasExtra: r.conHorasExtra,
    diasVacaciones: vac,
    diasLicencia: lic,
    licenciasPorTipo: licencias,
    causas: causas(he50 + he100, fer, (vac + lic) * HORAS_POR_DIA, area),
  }
}

function cifrasProyectadas(area: AreaInforme, mes: string, carga: number): CifrasPeriodo {
  const f = area.meses.find((m) => m.mes === mes)
  const c = cifrasVacias()
  if (!f) return c
  const core = f.he50 + f.he100
  return {
    ...c,
    horas50: f.he50,
    horas100: f.he100,
    horasFeriado: f.fer,
    horasTotal: core + f.fer,
    costo: f.costo * carga,
    dotacion: f.dotacion,
    diasVacaciones: f.vacaciones,
    diasLicencia: f.licencias,
    causas: causas(core, f.fer, (f.vacaciones + f.licencias) * HORAS_POR_DIA, area),
    vacacionesCargadas: f.vacacionesProgramadas ?? 0,
    // Lugar que queda si salen de vacaciones como el año pasado (o lo cargado, si es más).
    ...(f.cupoVacaciones !== undefined ? { vacacionesPosibles: Math.max(0, f.cupoVacaciones - f.vacaciones) } : {}),
  }
}

function promedio(cs: CifrasPeriodo[]): CifrasPeriodo {
  const s = cifrasVacias()
  for (const c of cs) sumar(s, c)
  const n = Math.max(1, cs.length)
  return {
    ...cifrasVacias(),
    horas50: s.horas50 / n,
    horas100: s.horas100 / n,
    horasFeriado: s.horasFeriado / n,
    horasTotal: s.horasTotal / n,
    costo: s.costo / n,
    dotacion: Math.round(s.dotacion / n),
    diasVacaciones: s.diasVacaciones / n,
    diasLicencia: s.diasLicencia / n,
    causas: { ausencias: 0, habituales: s.causas.ausencias / n + s.causas.habituales / n, feriados: s.causas.feriados / n },
  }
}

// ---------- Textos ----------

function variacion(c: CifrasPeriodo, verbo: 'fue' | 'sería'): string {
  if (!c.anterior || c.anterior.costo <= 0) return ''
  const pct = Math.round(((c.costo - c.anterior.costo) / c.anterior.costo) * 100)
  const mes = nombreMes(c.anterior.mes)
  if (Math.abs(pct) < 3) return ` El costo ${verbo} parecido al de ${mes}.`
  return ` El costo ${verbo} un ${nf.format(Math.abs(pct))}% ${pct > 0 ? 'más alto' : 'más bajo'} que en ${mes}.`
}

function textoCausas(c: CifrasPeriodo, proyectado: boolean): string | null {
  const total = c.causas.ausencias + c.causas.habituales + c.causas.feriados
  if (total <= 0) return null
  const partes: string[] = []
  const a = porcentaje(c.causas.ausencias, total)
  const h = porcentaje(c.causas.habituales, total)
  const f = Math.max(0, 100 - a - h)
  if (a > 0) partes.push(`${a}% para cubrir a quienes ${proyectado ? 'estén' : 'estaban'} de vacaciones o de licencia`)
  if (h > 0) partes.push(`${h}% son horas que se repiten todos los meses, por cómo están armados los turnos o porque falta personal fijo`)
  if (f > 0 && c.causas.feriados > 0) partes.push(`${f}% por trabajar en feriados`)
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : partes[0]
  return `${proyectado ? '¿De dónde vendrían?' : '¿Por qué se generaron?'} ${capital(lista)}.`
}

function textoDoble(c: CifrasPeriodo, proyectado: boolean): string | null {
  if (c.horasTotal <= 0) return null
  const pct = porcentaje(c.horas100 + c.horasFeriado, c.horasTotal)
  if (pct <= 0) return null
  return `${pct}% de esas horas ${proyectado ? 'se pagarían' : 'se pagaron'} al doble: son horas de noche, de sábado a la tarde, de domingo o de feriado. El resto se paga con un 50% de recargo.`
}

function clavesReal(mes: string, c: CifrasPeriodo, mayor?: { nombre: string; costo: number }): string[] {
  const out: string[] = []
  if (c.horasTotal <= 0) return [`En ${nombreMes(mes)} no se pagaron horas extra.`]
  out.push(
    `En ${nombreMes(mes)} se pagaron ${nf.format(c.horasTotal)} horas extra (incluye las trabajadas en feriados), con un costo para la empresa de ${pesos(c.costo)} contando cargas sociales y aguinaldo.${variacion(c, 'fue')}`,
  )
  if (mayor && c.costo > 0) {
    out.push(`${mayor.nombre} es el área que más gastó: ${porcentaje(mayor.costo, c.costo)}% del total (${pesos(mayor.costo)}).`)
  }
  const causasTxt = textoCausas(c, false)
  if (causasTxt) out.push(causasTxt)
  const doble = textoDoble(c, false)
  if (doble) out.push(doble)
  if (c.personasConHorasExtra !== null) {
    const mas30 = c.personasMas30 ?? 0
    out.push(
      `${plural(c.personasConHorasExtra, 'persona cobró', 'personas cobraron')} horas extra, de ${nf.format(c.dotacion)} liquidadas.${
        mas30 > 0
          ? ` ${plural(mas30, 'hizo', 'hicieron')} más de ${LIMITE_HE_MENSUAL} horas extra en el mes, que es el máximo que permite la ley.`
          : ''
      }`,
    )
  }
  const lic = c.licenciasPorTipo[0]
  out.push(
    `Hubo ${plural(Math.round(c.diasVacaciones), 'día', 'días')} de vacaciones y ${plural(Math.round(c.diasLicencia), 'día', 'días')} de licencia${
      lic ? ` (la más común: ${lic.tipo.toLowerCase()}, ${plural(Math.round(lic.dias), 'día', 'días')})` : ''
    }.`,
  )
  return out
}

function clavesProyectado(
  mes: string,
  c: CifrasPeriodo,
  feriados: number,
  feriadosDetalle: string[],
  mayor?: { nombre: string; costo: number },
): string[] {
  const out: string[] = []
  out.push(
    `Se estiman unas ${nf.format(c.horasTotal)} horas extra (incluye feriados), con un costo de ${pesos(c.costo)} contando cargas sociales y aguinaldo.${variacion(c, 'sería')}`,
  )
  if (mayor && c.costo > 0) {
    out.push(`${mayor.nombre} sería el área con más gasto: ${porcentaje(mayor.costo, c.costo)}% del total.`)
  }
  if (feriados > 0) {
    out.push(
      `${capital(nombreMes(mes))} tiene ${plural(feriados, 'feriado', 'feriados')}${feriadosDetalle.length ? ` (${feriadosDetalle.join(', ')})` : ''}: se estiman ${nf.format(c.horasFeriado)} horas trabajadas en feriado, que se pagan al doble.`,
    )
  } else {
    out.push(`${capital(nombreMes(mes))} no tiene feriados.`)
  }
  const causasTxt = textoCausas(c, true)
  if (causasTxt) out.push(causasTxt)
  if (c.vacacionesCargadas !== undefined) {
    let t = `Hay ${plural(Math.round(c.vacacionesCargadas), 'día', 'días')} de vacaciones cargados en Salario para ${nombreMes(mes)}.`
    if (c.diasVacaciones > (c.vacacionesCargadas ?? 0) + 10) {
      t += ` La estimación supone ${nf.format(c.diasVacaciones)} días, como en el mismo mes del año pasado.`
    }
    if ((c.vacacionesPosibles ?? 0) >= 7) {
      t += ` Se podrían otorgar hasta ${nf.format(c.vacacionesPosibles ?? 0)} días más sin que suban las horas extra.`
    }
    out.push(t)
  }
  return out
}

// ---------- Armado ----------

export function construirReporte(
  resultado: ResultadoResumen,
  areas: AreaInforme[],
  meses: { reales: string[]; actual: string; prevision: string[] },
  feriados: (mes: string) => { cantidad: number; detalle: string[] },
  limiteTotal: LimiteArea,
  carga: number,
  pactadasPorMes: Record<string, number>,
  pactadasPorMesCc: Record<string, number> = {},
): { reporte: ReporteMensual; porMes: Record<string, PersonaMes[]> } {
  const ultimoMes = meses.reales[meses.reales.length - 1]
  const porCc = new Map<string, ResumenCentroCostoMes>()
  const ccsPorMes = new Map<string, Set<number>>()
  for (const r of resultado.centrosCosto) {
    porCc.set(`${r.mes}|${r.cc}`, r)
    let s = ccsPorMes.get(r.mes)
    if (!s) ccsPorMes.set(r.mes, (s = new Set()))
    s.add(r.cc)
  }
  const areaPorCc = new Map(areas.map((a) => [a.cc, a]))
  const nombreCc = (cc: number) => areaPorCc.get(cc)?.nombre ?? NOMBRE_OTRAS

  // Personas con más de 30 h extra en el mes, por centro de costo; y el top del mes para RRHH.
  const mesAnteriorPrimero = sumarMeses(meses.reales[0], -1)
  const mesesReales = [mesAnteriorPrimero, ...meses.reales]
  const mas30 = new Map<string, number>()
  const porMes: Record<string, PersonaMes[]> = {}
  for (const mes of meses.reales) porMes[mes] = []
  for (const p of resultado.personas) {
    for (const mes of mesesReales) {
      const x = p.meses[mes]
      if (!x) continue
      const core = x.horas.he50.hs + x.horas.he100.hs
      if (core > LIMITE_HE_MENSUAL) mas30.set(`${mes}|${x.cc}`, (mas30.get(`${mes}|${x.cc}`) ?? 0) + 1)
      const total = core + x.horas.fer.hs
      if (porMes[mes] && total > 0) {
        porMes[mes].push({
          legajo: p.legajo,
          nombre: p.nombre,
          cc: x.cc,
          ccReporte: areaPorCc.has(x.cc) ? x.cc : OTRAS_AREAS_CC,
          area: areaPorCc.get(x.cc)?.nombre ?? (resultado.catalogos.centrosCosto[x.cc] ?? NOMBRE_OTRAS),
          puesto: resultado.catalogos.puestos[p.puesto] ?? '',
          horas50: r1(x.horas.he50.hs),
          horas100: r1(x.horas.he100.hs),
          horasFeriado: r1(x.horas.fer.hs),
          horasTotal: r1(total),
          superaLimiteMes: core > LIMITE_HE_MENSUAL,
        })
      }
    }
  }
  for (const mes of Object.keys(porMes)) {
    // Todas las personas (no solo las que más hicieron): la suma da el total de horas del mes.
    porMes[mes] = porMes[mes].sort((a, b) => b.horasTotal - a.horasTotal)
  }

  // Cifras por mes: total de la empresa, cada área del informe y "otras áreas".
  type CifrasMes = { total: CifrasPeriodo; porArea: Map<number, CifrasPeriodo> }
  const cifras = new Map<string, CifrasMes>()

  for (const mes of mesesReales) {
    const total = cifrasVacias()
    total.personasConHorasExtra = 0
    total.personasMas30 = 0
    for (const cc of ccsPorMes.get(mes) ?? []) {
      sumar(total, cifrasReales(porCc.get(`${mes}|${cc}`), areaPorCc.get(cc), mas30.get(`${mes}|${cc}`) ?? 0, carga))
    }
    const porArea = new Map<number, CifrasPeriodo>()
    for (const a of areas) porArea.set(a.cc, cifrasReales(porCc.get(`${mes}|${a.cc}`), a, mas30.get(`${mes}|${a.cc}`) ?? 0, carga))
    const otras = restar(total, [...porArea.values()])
    if (otras.horasTotal > 0.5) porArea.set(OTRAS_AREAS_CC, otras)
    cifras.set(mes, { total, porArea })
  }

  // Áreas sin modelo ("otras"): se proyectan con el promedio de los 3 meses cerrados.
  const otrasPromedio = promedio(meses.reales.map((m) => cifras.get(m)?.porArea.get(OTRAS_AREAS_CC) ?? cifrasVacias()))
  const proyectados = [meses.actual, ...meses.prevision]
  for (const mes of proyectados) {
    const total = cifrasVacias()
    const porArea = new Map<number, CifrasPeriodo>()
    for (const a of areas) {
      const c = cifrasProyectadas(a, mes, carga)
      porArea.set(a.cc, c)
      sumar(total, c)
    }
    if (otrasPromedio.horasTotal > 0.5) {
      porArea.set(OTRAS_AREAS_CC, { ...otrasPromedio })
      sumar(total, otrasPromedio)
    }
    total.personasConHorasExtra = null
    total.personasMas30 = null
    cifras.set(mes, { total, porArea })
  }

  // Comparación con el mes anterior.
  const secuencia = [...mesesReales, ...proyectados]
  for (let i = 1; i < secuencia.length; i++) {
    const prev = cifras.get(secuencia[i - 1])!
    const cur = cifras.get(secuencia[i])!
    cur.total.anterior = { mes: secuencia[i - 1], horasTotal: r1(prev.total.horasTotal), costo: Math.round(prev.total.costo) }
    for (const [cc, c] of cur.porArea) {
      const p = prev.porArea.get(cc)
      if (p) c.anterior = { mes: secuencia[i - 1], horasTotal: r1(p.horasTotal), costo: Math.round(p.costo) }
    }
  }

  const ccsDelInforme = new Set(areas.map((a) => a.cc))
  const pactadoArea = (mes: string, cc: number) => {
    let total = 0
    for (const [clave, v] of Object.entries(pactadasPorMesCc)) {
      const [m, c] = clave.split('|')
      if (m !== mes) continue
      const n = Number(c)
      if (cc === OTRAS_AREAS_CC ? !ccsDelInforme.has(n) : n === cc) total += v
    }
    return total
  }
  const periodos: PeriodoReporte[] = []
  for (const mes of [...meses.reales].reverse().concat(proyectados)) {
    const { total, porArea } = cifras.get(mes)!
    const tipo: TipoMes = meses.reales.includes(mes) ? 'real' : mes === meses.actual ? 'actual' : 'prevision'
    const f = feriados(mes)
    const listaAreas = [...porArea.entries()]
      .map(([cc, c]) => ({ cc, c }))
      .sort((x, y) => (x.cc === OTRAS_AREAS_CC ? 1 : y.cc === OTRAS_AREAS_CC ? -1 : y.c.costo - x.c.costo))
    const mayor = listaAreas.find((x) => x.cc !== OTRAS_AREAS_CC)
    const mayorTxt = mayor ? { nombre: nombreCc(mayor.cc), costo: mayor.c.costo } : undefined
    const claves =
      tipo === 'real' ? clavesReal(mes, total, mayorTxt) : clavesProyectado(mes, total, f.cantidad, f.detalle, mayorTxt)
    const costoPactadas = pactadasPorMes[tipo === 'real' ? mes : ultimoMes] ?? 0
    if (costoPactadas > 0 && claves.length > 0) {
      claves.splice(
        1,
        0,
        `De ese costo, ${pesos(costoPactadas)} ${tipo === 'real' ? 'son' : 'serían'} horas pactadas (acuerdos individuales), que no se pueden reducir.`,
      )
    }
    periodos.push({
      mes,
      costoPactadas: Math.round(costoPactadas),
      tipo,
      feriados: f.cantidad,
      feriadosDetalle: f.detalle,
      total: redondear(total),
      claves,
      areas: listaAreas.map(({ cc, c }) =>
        redondear({
          ...c,
          cc,
          nombre: nombreCc(cc),
          costoPactadas: Math.round(pactadoArea(tipo === 'real' ? mes : ultimoMes, cc)),
          claves: tipo === 'real' ? clavesReal(mes, c) : clavesProyectado(mes, c, f.cantidad, f.detalle),
        }),
      ),
    })
  }

  return { reporte: { periodos, anual: visionAnual(resultado, areas, ultimoMes, limiteTotal, carga, pactadasPorMes) }, porMes }
}

function visionAnual(
  resultado: ResultadoResumen,
  areas: AreaInforme[],
  ultimoMes: string,
  limiteTotal: LimiteArea,
  carga: number,
  pactadasPorMes: Record<string, number>,
): VisionAnual {
  const anio = Number(ultimoMes.slice(0, 4))
  const mesesAnio = resultado.meses.filter((m) => m.startsWith(String(anio)) && m <= ultimoMes)
  const enAreas = new Set(areas.map((a) => a.cc))
  const porArea = new Map<number, { horas: number; costo: number }>()
  let h50 = 0
  let h100 = 0
  let fer = 0
  let costo = 0
  const porMes = new Map<string, { horas: number; costo: number }>()
  for (const r of resultado.centrosCosto) {
    if (!mesesAnio.includes(r.mes)) continue
    const horas = r.horas.he50.hs + r.horas.he100.hs + r.horas.fer.hs
    const monto = (r.horas.he50.monto + r.horas.he100.monto + r.horas.fer.monto) * carga
    h50 += r.horas.he50.hs
    h100 += r.horas.he100.hs
    fer += r.horas.fer.hs
    costo += monto
    const m = porMes.get(r.mes) ?? { horas: 0, costo: 0 }
    m.horas += horas
    m.costo += monto
    porMes.set(r.mes, m)
    const cc = enAreas.has(r.cc) ? r.cc : OTRAS_AREAS_CC
    const a = porArea.get(cc) ?? { horas: 0, costo: 0 }
    a.horas += horas
    a.costo += monto
    porArea.set(cc, a)
  }
  const horasTotal = h50 + h100 + fer
  const masAlto = [...porMes.entries()].sort((x, y) => y[1].horas - x[1].horas)[0]
  const vac = { temporada: areas[0]?.vacaciones.anio ?? anio, derecho: 0, otorgado: 0, pendiente: 0 }
  for (const a of areas) {
    vac.derecho += a.vacaciones.derecho
    vac.otorgado += a.vacaciones.otorgado
    vac.pendiente += a.vacaciones.pendiente
  }
  const desde = mesesAnio[0] ?? ultimoMes
  const rango = `De ${nombreMes(desde)} a ${nombreMes(ultimoMes)} de ${anio}`
  const nMeses = Math.max(1, mesesAnio.length)

  const clavesDe = (x: {
    horas: number
    costo: number
    superaron: number
    vanASuperar: number
    pendiente: number
    derecho: number
    masAlto?: { mes: string; horas: number }
  }): string[] => {
    const out = [
      `${rango} se pagaron ${nf.format(x.horas)} horas extra, con un costo de ${pesos(x.costo)} contando cargas sociales y aguinaldo (en pesos de cada mes). En promedio, ${pesos(x.costo / nMeses)} por mes.`,
    ]
    if (x.masAlto) out.push(`El mes con más horas extra fue ${nombreMes(x.masAlto.mes)}, con ${nf.format(x.masAlto.horas)} horas.`)
    if (x.superaron + x.vanASuperar > 0) {
      out.push(
        `${plural(x.superaron, 'persona ya hizo', 'personas ya hicieron')} más de ${LIMITE_HE_ANUAL} horas extra en el año, que es el máximo que permite la ley${
          x.vanASuperar > 0 ? `, y ${plural(x.vanASuperar, 'persona más lo va', 'personas más lo van')} a pasar antes de diciembre si sigue el mismo ritmo` : ''
        }.`,
      )
    } else {
      out.push(`Nadie superó las ${LIMITE_HE_ANUAL} horas extra anuales que permite la ley.`)
    }
    if (x.derecho > 0) {
      out.push(
        `Vacaciones de la temporada ${vac.temporada} (se toman de octubre a abril): falta otorgar ${nf.format(x.pendiente)} de los ${nf.format(x.derecho)} días que corresponden.`,
      )
    }
    return out
  }

  const areasAnual: AreaAnual[] = [...porArea.entries()]
    .map(([cc, v]) => {
      const a = areas.find((x) => x.cc === cc)
      const lim = a?.limite ?? { superaron: 0, vanASuperar: 0, masDe30EnElMes: 0 }
      const base = {
        cc,
        nombre: a?.nombre ?? NOMBRE_OTRAS,
        horasTotal: r1(v.horas),
        costo: Math.round(v.costo),
        superaron: a ? lim.superaron : 0,
        vanASuperar: a ? lim.vanASuperar : 0,
        vacacionesPendientes: a?.vacaciones.pendiente ?? 0,
        vacacionesDerecho: a?.vacaciones.derecho ?? 0,
      }
      return {
        ...base,
        claves: clavesDe({
          horas: v.horas,
          costo: v.costo,
          superaron: base.superaron,
          vanASuperar: base.vanASuperar,
          pendiente: base.vacacionesPendientes,
          derecho: base.vacacionesDerecho,
        }),
      }
    })
    .sort((x, y) => (x.cc === OTRAS_AREAS_CC ? 1 : y.cc === OTRAS_AREAS_CC ? -1 : y.costo - x.costo))

  const costoPactadas = mesesAnio.reduce((t, m) => t + (pactadasPorMes[m] ?? 0), 0)
  const clavesTotal = clavesDe({
    horas: horasTotal,
    costo,
    superaron: limiteTotal.superaron,
    vanASuperar: limiteTotal.vanASuperar,
    pendiente: vac.pendiente,
    derecho: vac.derecho,
    masAlto: masAlto ? { mes: masAlto[0], horas: masAlto[1].horas } : undefined,
  })
  if (costoPactadas > 0) {
    clavesTotal.splice(1, 0, `De ese costo, ${pesos(costoPactadas)} fueron horas pactadas (acuerdos individuales).`)
  }
  return {
    costoPactadas: Math.round(costoPactadas),
    anio,
    desde,
    hasta: ultimoMes,
    horas50: r1(h50),
    horas100: r1(h100),
    horasFeriado: r1(fer),
    horasTotal: r1(horasTotal),
    costo: Math.round(costo),
    costoPromedioMes: Math.round(costo / nMeses),
    mesMasAlto: masAlto ? { mes: masAlto[0], horasTotal: r1(masAlto[1].horas), costo: Math.round(masAlto[1].costo) } : null,
    superaron: limiteTotal.superaron,
    vanASuperar: limiteTotal.vanASuperar,
    vacaciones: vac,
    areas: areasAnual,
    claves: clavesTotal,
  }
}
