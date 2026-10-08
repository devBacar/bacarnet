import { CONVENIOS, convenioDeEsquema, ventanaLiquidacion, type Convenio } from './convenios.js'
import { excluidas, type LicenciaSalario, type ResultadoResumen } from './resumenMensual.js'

/**
 * Indicadores de personal mes a mes y por convenio: ausentismo, licencias largas, altas, bajas y rotación,
 * y el peso de las horas extra. Todo sale de Salario.
 *
 * Corte de cada mes: el período que cubre la liquidación. SUVICO y Camioneros, del 26 del mes anterior al 25;
 * el resto, del 1 a fin de mes. Los días de ausencia salen de la liquidación (ya respetan ese corte); las
 * licencias con fecha y las altas y bajas se cortan con la misma ventana.
 */

export type GrupoAusencia = 'enfermedad' | 'accidentes' | 'injustificadas' | 'suspensiones' | 'especiales'
export type MotivoBaja = 'renuncia' | 'despido' | 'finContrato' | 'acuerdo' | 'otras'
export type TipoLicenciaLarga = 'reserva' | 'art' | 'enfermedad' | 'maternidad'

export const GRUPOS_AUSENCIA: { id: GrupoAusencia; nombre: string; detalle: string }[] = [
  { id: 'enfermedad', nombre: 'Enfermedad', detalle: 'enfermedad inculpable (art. 208 LCT)' },
  { id: 'accidentes', nombre: 'Accidentes (ART y empresa)', detalle: 'accidentes de trabajo pagados por la ART o por la empresa' },
  { id: 'injustificadas', nombre: 'Faltas sin aviso', detalle: 'faltas injustificadas y días no trabajados (sin goce)' },
  { id: 'suspensiones', nombre: 'Suspensiones', detalle: 'suspensiones disciplinarias y por otras causas' },
  { id: 'especiales', nombre: 'Licencias especiales', detalle: 'maternidad, matrimonio, fallecimiento, estudio, gremial, mudanza, familiar enfermo y otras' },
]

export const MOTIVOS_BAJA: { id: MotivoBaja; nombre: string }[] = [
  { id: 'renuncia', nombre: 'Renuncia' },
  { id: 'despido', nombre: 'Despido' },
  { id: 'finContrato', nombre: 'Fin de contrato a plazo' },
  { id: 'acuerdo', nombre: 'Acuerdo entre las partes' },
  { id: 'otras', nombre: 'Otras (fallecimiento, abandono, otras causas)' },
]

/**
 * Días de ausencia que se cubren con horas extra: enfermedad, accidentes, faltas sin aviso y suspensiones.
 * Sin vacaciones ni licencias especiales.
 */
export function diasAusenciaCubribles(ausencias: Record<string, number>): number {
  let dias = 0
  for (const [tipo, n] of Object.entries(ausencias)) {
    const g = grupoAusencia(tipo)
    if (g && g !== 'especiales') dias += n
  }
  return dias
}

/** Grupo de un tipo de ausencia de la liquidación (los nombres de CONCEPTOS_AUSENCIA). */
export function grupoAusencia(tipo: string): GrupoAusencia | null {
  if (tipo === 'Vacaciones') return null
  if (tipo === 'Enfermedad') return 'enfermedad'
  if (tipo.startsWith('Accidente')) return 'accidentes'
  if (tipo === 'Falta injustificada' || tipo === 'No trabajados') return 'injustificadas'
  if (tipo === 'Suspensión') return 'suspensiones'
  return 'especiales'
}

/** Motivo de baja según el texto de la tabla de motivos de egreso de Salario. */
export function motivoBaja(nombre: string | undefined): MotivoBaja {
  const n = (nombre ?? '').toLowerCase()
  if (n.includes('renuncia')) return 'renuncia'
  if (n.includes('despido')) return 'despido'
  if (n.includes('plazo fijo') || n.includes('vencimiento de contrato')) return 'finContrato'
  if (n.includes('voluntad concurrente') || n.includes('241')) return 'acuerdo'
  return 'otras'
}

/** Licencia larga según el tipo de ausencia de la tabla `asist` (tabla de códigos 30). */
export function tipoLicenciaLarga(nombreTipo: string | undefined): TipoLicenciaLarga | null {
  const n = (nombreTipo ?? '').toLowerCase().trim()
  if (n.includes('reserva')) return 'reserva'
  if (n.startsWith('accidente')) return 'art'
  if (n.startsWith('maternidad')) return 'maternidad'
  if (n.startsWith('enfermedad')) return 'enfermedad'
  return null
}

/** Una enfermedad cuenta como licencia larga cuando el episodio supera estos días. */
export const DIAS_ENFERMEDAD_LARGA = 30
/** Baja temprana: se fue antes de cumplir estos días desde el alta. */
export const DIAS_BAJA_TEMPRANA = 90

export interface FilaIndicador {
  mes: string
  convenio: Convenio
  /** Personas liquidadas y días liquidados (incluyen los días de ausencia). */
  personas: number
  diasLiquidados: number
  /** Días de ausencia por grupo, según la liquidación. */
  dias: Record<GrupoAusencia, number>
  diasVacaciones: number
  /** Personas con al menos un día de enfermedad, de accidente o de falta sin aviso. */
  personasEnfermedad: number
  personasAccidente: number
  personasFaltas: number
  /** Avisos de enfermedad que empezaron en el período (tabla de licencias), por duración del episodio. */
  episodios: { corta: number; media: number; larga: number }
  /** Personas con licencia larga en curso el último día del período. */
  licenciasLargas: Record<TipoLicenciaLarga, number>
  altas: number
  bajas: number
  bajasTempranas: number
  /** De las bajas tempranas, las que fueron por fin de contrato a plazo (previstas, como los eventuales de temporada). */
  bajasTempranasFinContrato: number
  bajasPorMotivo: Record<MotivoBaja, number>
  /** Horas normales trabajadas y horas extra (50%, 100% y compensatorias, como en Evolución). */
  horasNormales: number
  horasExtra: number
  /** Importe de horas extra, feriados y compensatorias, y remunerativo total. */
  montoExtras: number
  rem: number
}

export interface IndicadoresInforme {
  meses: string[]
  convenios: { id: Convenio; nombre: string; corte: 'ciclo26' | 'calendario' }[]
  filas: FilaIndicador[]
  /** Primer mes con días de enfermedad cargados en la liquidación: antes, Salario no registraba las ausencias. */
  primerMesAusencias: string | null
  notas: string[]
}

export interface PersonaLicenciaLarga {
  legajo: number
  nombre: string
  area: string
  convenio: Convenio
  tipo: TipoLicenciaLarga
  desde: string
  hasta: string
  dias: number
}

export interface PersonaBaja {
  legajo: number
  nombre: string
  area: string
  convenio: Convenio
  ingreso: string
  egreso: string
  diasTrabajados: number
  motivo: MotivoBaja
}

export interface IndicadoresDetalle {
  /** Licencias largas en curso al cierre del último mes liquidado. */
  licenciasLargas: PersonaLicenciaLarga[]
  /** Bajas de los últimos 12 meses liquidados con menos de 90 días de antigüedad. */
  bajasTempranas: PersonaBaja[]
}

const DIA = 86_400_000
function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA)
}
function diaSiguiente(fecha: string): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + DIA).toISOString().slice(0, 10)
}

interface Episodio {
  legajo: number
  tipo: TipoLicenciaLarga
  desde: string
  hasta: string
}

/** Une los registros seguidos o superpuestos del mismo tipo (Salario carga una licencia larga mes por mes). */
export function episodiosDeLicencia(licencias: LicenciaSalario[], nombreTipo: (tipo: number) => string | undefined): Episodio[] {
  const porClave = new Map<string, Episodio[]>()
  const ordenadas = [...licencias].sort((a, b) => a.legajo - b.legajo || (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0))
  for (const l of ordenadas) {
    const tipo = tipoLicenciaLarga(nombreTipo(l.tipo))
    if (!tipo) continue
    const clave = `${l.legajo}|${tipo}`
    const lista = porClave.get(clave) ?? []
    const ultimo = lista[lista.length - 1]
    if (ultimo && l.desde <= diaSiguiente(ultimo.hasta)) {
      if (l.hasta > ultimo.hasta) ultimo.hasta = l.hasta
    } else {
      lista.push({ legajo: l.legajo, tipo, desde: l.desde, hasta: l.hasta })
    }
    porClave.set(clave, lista)
  }
  return [...porClave.values()].flat()
}

function vacia(mes: string, convenio: Convenio): FilaIndicador {
  return {
    mes,
    convenio,
    personas: 0,
    diasLiquidados: 0,
    dias: { enfermedad: 0, accidentes: 0, injustificadas: 0, suspensiones: 0, especiales: 0 },
    diasVacaciones: 0,
    personasEnfermedad: 0,
    personasAccidente: 0,
    personasFaltas: 0,
    episodios: { corta: 0, media: 0, larga: 0 },
    licenciasLargas: { reserva: 0, art: 0, enfermedad: 0, maternidad: 0 },
    altas: 0,
    bajas: 0,
    bajasTempranas: 0,
    bajasTempranasFinContrato: 0,
    bajasPorMotivo: { renuncia: 0, despido: 0, finContrato: 0, acuerdo: 0, otras: 0 },
    horasNormales: 0,
    horasExtra: 0,
    montoExtras: 0,
    rem: 0,
  }
}

const ORDEN_CONVENIOS: Convenio[] = ['suvico', 'camioneros', 'bancarios', 'comercio', 'fuera']

export function construirIndicadores(
  resultado: ResultadoResumen,
  nombreArea: (cc: number) => string,
): { indicadores: IndicadoresInforme; detalle: IndicadoresDetalle } {
  const esquemas = resultado.esquemaDeLegajo ?? {}
  const convenioDe = (legajo: number, esquema?: number): Convenio =>
    convenioDeEsquema(resultado.catalogos.esquemasLiquidacion[esquema ?? esquemas[legajo] ?? 0])
  const filas = new Map<string, FilaIndicador>()
  const fila = (mes: string, convenio: Convenio) => {
    const clave = `${mes}|${convenio}`
    let f = filas.get(clave)
    if (!f) {
      f = vacia(mes, convenio)
      filas.set(clave, f)
    }
    return f
  }
  const meses = resultado.meses

  // 1. Liquidación: personas, días, ausencias y horas (cada liquidación ya cubre el período de su convenio).
  for (const p of resultado.personas) {
    const convenio = convenioDe(p.legajo, p.esquemaLiquidacion)
    for (const [mes, m] of Object.entries(p.meses)) {
      const f = fila(mes, convenio)
      f.personas += 1
      f.diasLiquidados += m.dias ?? 30
      const porGrupo: Record<GrupoAusencia, number> = { enfermedad: 0, accidentes: 0, injustificadas: 0, suspensiones: 0, especiales: 0 }
      for (const [tipo, dias] of Object.entries(m.ausencias)) {
        if (tipo === 'Vacaciones') {
          f.diasVacaciones += dias
          continue
        }
        const g = grupoAusencia(tipo)
        if (g) porGrupo[g] += dias
      }
      for (const g of Object.keys(porGrupo) as GrupoAusencia[]) f.dias[g] += porGrupo[g]
      if (porGrupo.enfermedad > 0) f.personasEnfermedad += 1
      if (porGrupo.accidentes > 0) f.personasAccidente += 1
      if (porGrupo.injustificadas > 0) f.personasFaltas += 1
      f.horasNormales += m.horasNormales
      f.horasExtra += m.horas.he50.hs + m.horas.he100.hs + m.horas.comp.hs
      f.montoExtras += m.horas.he50.monto + m.horas.he100.monto + m.horas.fer.monto + m.horas.comp.monto
      f.rem += m.totales.rem
    }
  }

  // Ventana de cada mes y convenio.
  const ventanas = new Map<string, { desde: string; hasta: string }>()
  for (const mes of meses) for (const c of ORDEN_CONVENIOS) ventanas.set(`${mes}|${c}`, ventanaLiquidacion(mes, c))
  const mesDeFecha = (fecha: string, convenio: Convenio): string | null => {
    for (const mes of meses) {
      const v = ventanas.get(`${mes}|${convenio}`)!
      if (fecha >= v.desde && fecha <= v.hasta) return mes
    }
    return null
  }

  // 2. Licencias con fecha: avisos de enfermedad por duración y licencias largas al cierre.
  const nombreTipo = (t: number) => resultado.catalogos.tiposAusencia[t]
  const episodios = episodiosDeLicencia(resultado.licencias ?? [], nombreTipo)
  for (const e of episodios) {
    const convenio = convenioDe(e.legajo)
    const duracion = diasEntre(e.desde, e.hasta) + 1
    if (e.tipo === 'enfermedad') {
      const mes = mesDeFecha(e.desde, convenio)
      if (mes && filas.has(`${mes}|${convenio}`)) {
        const f = fila(mes, convenio)
        if (duracion <= 3) f.episodios.corta += 1
        else if (duracion <= DIAS_ENFERMEDAD_LARGA) f.episodios.media += 1
        else f.episodios.larga += 1
      }
    }
    if (e.tipo === 'enfermedad' && duracion <= DIAS_ENFERMEDAD_LARGA) continue
    for (const mes of meses) {
      const v = ventanas.get(`${mes}|${convenio}`)!
      if (e.desde <= v.hasta && e.hasta >= v.hasta) fila(mes, convenio).licenciasLargas[e.tipo] += 1
    }
  }

  // 3. Altas y bajas. Se ignoran los períodos con baja el mismo día del alta o antes (altas anuladas).
  const motivos = resultado.catalogos.motivosEgreso ?? {}
  const bajasDetalle: PersonaBaja[] = []
  for (const pl of resultado.periodosLaborales ?? []) {
    if (pl.egreso && pl.egreso <= pl.ingreso) continue
    const convenio = convenioDe(pl.legajo)
    const mesAlta = mesDeFecha(pl.ingreso, convenio)
    if (mesAlta) fila(mesAlta, convenio).altas += 1
    if (!pl.egreso) continue
    const mesBaja = mesDeFecha(pl.egreso, convenio)
    if (!mesBaja) continue
    const f = fila(mesBaja, convenio)
    const trabajados = diasEntre(pl.ingreso, pl.egreso) + 1
    const motivo = motivoBaja(motivos[pl.motivo])
    f.bajas += 1
    f.bajasPorMotivo[motivo] += 1
    if (trabajados < DIAS_BAJA_TEMPRANA) {
      f.bajasTempranas += 1
      if (motivo === 'finContrato') f.bajasTempranasFinContrato += 1
      const datos = resultado.legajos?.[pl.legajo]
      bajasDetalle.push({
        legajo: pl.legajo,
        nombre: (datos?.nombre ?? '').trim(),
        area: nombreArea(datos?.cc ?? 0),
        convenio,
        ingreso: pl.ingreso,
        egreso: pl.egreso,
        diasTrabajados: trabajados,
        motivo,
      })
    }
  }

  // Detalle para RRHH: licencias largas al cierre del último mes y bajas tempranas de los últimos 12 meses.
  const ultimo = resultado.ultimoMes
  const licenciasLargas: PersonaLicenciaLarga[] = []
  if (ultimo) {
    for (const e of episodios) {
      const convenio = convenioDe(e.legajo)
      const v = ventanas.get(`${ultimo}|${convenio}`)!
      const duracion = diasEntre(e.desde, e.hasta) + 1
      if (e.tipo === 'enfermedad' && duracion <= DIAS_ENFERMEDAD_LARGA) continue
      if (e.desde > v.hasta || e.hasta < v.hasta) continue
      const datos = resultado.legajos?.[e.legajo]
      licenciasLargas.push({
        legajo: e.legajo,
        nombre: (datos?.nombre ?? '').trim(),
        area: nombreArea(datos?.cc ?? 0),
        convenio,
        tipo: e.tipo,
        desde: e.desde,
        hasta: e.hasta,
        dias: duracion,
      })
    }
  }
  const desde12 = meses[Math.max(0, meses.length - 12)] ?? ''
  const r1 = (x: number) => Math.round(x * 10) / 10
  const r2 = (x: number) => Math.round(x * 100) / 100

  const lista = [...filas.values()]
    .filter((f) => meses.includes(f.mes))
    .map((f) => ({
      ...f,
      diasLiquidados: r1(f.diasLiquidados),
      dias: Object.fromEntries(Object.entries(f.dias).map(([k, v]) => [k, r1(v)])) as Record<GrupoAusencia, number>,
      diasVacaciones: r1(f.diasVacaciones),
      horasNormales: Math.round(f.horasNormales),
      horasExtra: r1(f.horasExtra),
      montoExtras: r2(f.montoExtras),
      rem: r2(f.rem),
    }))
    .sort((a, b) => (a.mes === b.mes ? ORDEN_CONVENIOS.indexOf(a.convenio) - ORDEN_CONVENIOS.indexOf(b.convenio) : a.mes < b.mes ? -1 : 1))

  const primerMesAusencias = meses.find((m) => lista.some((f) => f.mes === m && f.dias.enfermedad > 0)) ?? null
  const mesTexto = (m: string) => `${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][Number(m.slice(4, 6)) - 1]} de ${m.slice(0, 4)}`
  return {
    indicadores: {
      meses,
      primerMesAusencias,
      convenios: ORDEN_CONVENIOS.filter((c) => lista.some((f) => f.convenio === c && f.personas > 0)).map((c) => ({
        id: c,
        nombre: CONVENIOS[c].nombre,
        corte: CONVENIOS[c].corte,
      })),
      filas: lista,
      notas: [
        ...excluidas(resultado),
        'Cada mes es el período que cubre su liquidación: SUVICO y Camioneros, del 26 del mes anterior al 25; Comercio, Bancarios y Fuera de convenio, del 1 a fin de mes.',
        'Ausentismo = días de ausencia (sin vacaciones) sobre días liquidados, según los conceptos de días de la liquidación de Salario.',
        ...(primerMesAusencias && primerMesAusencias > meses[0]
          ? [`Salario registra los días de enfermedad y licencias desde ${mesTexto(primerMesAusencias)}: el ausentismo se muestra desde ese mes.`]
          : []),
        'Desde mayo de 2026 las faltas sin aviso se cargan como "días no trabajados": se suman juntas.',
        `Avisos de enfermedad: episodios cargados en Licencias de Salario, por la fecha en que empezaron. Corto: hasta 3 días; medio: 4 a ${DIAS_ENFERMEDAD_LARGA}; largo: más de ${DIAS_ENFERMEDAD_LARGA}. Los registros seguidos de una misma licencia se cuentan como un solo episodio.`,
        `Licencias largas: personas con reserva de puesto, accidente (ART), maternidad o enfermedad de más de ${DIAS_ENFERMEDAD_LARGA} días en curso el último día del período.`,
        `Rotación = bajas sobre personas liquidadas. Baja temprana: se fue antes de los ${DIAS_BAJA_TEMPRANA} días del alta. Se descartan las altas anuladas (baja el mismo día del alta).`,
        'El convenio de cada persona es el de su esquema de liquidación actual en Salario.',
      ],
    },
    detalle: {
      licenciasLargas: licenciasLargas.sort((a, b) => a.tipo.localeCompare(b.tipo) || b.dias - a.dias),
      bajasTempranas: bajasDetalle.filter((b) => (mesDeFecha(b.egreso, b.convenio) ?? '') >= desde12).sort((a, b) => (a.egreso < b.egreso ? 1 : -1)),
    },
  }
}
