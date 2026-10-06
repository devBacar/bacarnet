import type { FilaDump } from './sqlDumpParser.js'
import {
  CONCEPTO_FERIADOS_MES,
  CONCEPTOS_RELEVANTES,
  TABLAS_CODIGOS,
  TIPO_LIQUIDACION_MENSUAL,
  grupoHorasDe,
  horasInvalidas,
  tipoAusenciaDe,
  totalDe,
  type GrupoHoras,
  type TotalLiquidacion,
} from './conceptosSalario.js'

export interface HorasYMonto {
  hs: number
  monto: number
}

export type HorasPorGrupo = Record<GrupoHoras, HorasYMonto>
export type Totales = Record<TotalLiquidacion, number>

/** Resumen de un centro de costo en un mes liquidado. */
export interface ResumenCentroCostoMes {
  /** AAAAMM */
  mes: string
  cc: number
  /** Personas liquidadas en el mes. */
  dotacion: number
  /** Personas con horas extra al 50%, 100% o en feriado. */
  conHorasExtra: number
  horas: HorasPorGrupo
  totales: Totales
  /** Días liquidados por tipo de ausencia (incluye "Vacaciones"). */
  ausencias: Record<string, number>
}

export interface MesPersona {
  cc: number
  horas: HorasPorGrupo
  totales: Totales
  ausencias: Record<string, number>
}

export interface PeriodoVacaciones {
  desde: string
  hasta: string
  dias: number
}

export interface ResumenPersona {
  legajo: number
  nombre: string
  /** Centro de costo del último mes liquidado (o el del legajo si no tuvo liquidación). */
  cc: number
  seccion: number
  puesto: number
  esquemaLiquidacion: number
  fechaIngreso: string | null
  fechaEgreso: string | null
  meses: Record<string, MesPersona>
  vacaciones: PeriodoVacaciones[]
}

export interface AnomaliaHoras {
  mes: string
  legajo: number
  concepto: string
  horas: number
  monto: number
}

export interface Catalogos {
  centrosCosto: Record<number, string>
  secciones: Record<number, string>
  puestos: Record<number, string>
  esquemasLiquidacion: Record<number, string>
  tiposAusencia: Record<number, string>
}

export interface ResultadoResumen {
  /** Meses incluidos (AAAAMM), de más viejo a más nuevo. */
  meses: string[]
  ultimoMes: string | null
  centrosCosto: ResumenCentroCostoMes[]
  personas: ResumenPersona[]
  /** Cantidad de feriados de cada mes, según el concepto FERIAD (Art. 169 LCT). */
  feriadosPorMes: Record<string, number>
  catalogos: Catalogos
  anomalias: AnomaliaHoras[]
}

export interface OpcionesResumen {
  /** Meses de historia hacia atrás desde el último mes liquidado. */
  mesesHistoria: number
  /** Primer día (AAAA-MM-DD) desde el que se guardan los períodos de vacaciones. */
  vacacionesDesde?: string
}

const GRUPOS: GrupoHoras[] = ['he50', 'he100', 'fer', 'noct', 'comp']

function horasVacias(): HorasPorGrupo {
  return {
    he50: { hs: 0, monto: 0 },
    he100: { hs: 0, monto: 0 },
    fer: { hs: 0, monto: 0 },
    noct: { hs: 0, monto: 0 },
    comp: { hs: 0, monto: 0 },
  }
}

function totalesVacios(): Totales {
  return { rem: 0, contrib: 0, costo: 0 }
}

function num(v: string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function entero(v: string | null | undefined): number {
  return Math.trunc(num(v))
}

function fecha(v: string | null | undefined): string | null {
  if (!v || v.startsWith('0000') || v < '1901') return null
  return v.slice(0, 10)
}

function redondear(n: number, decimales = 2): number {
  const f = 10 ** decimales
  return Math.round(n * f) / f
}

/** Mes AAAAMM desplazado `delta` meses. */
export function sumarMeses(mes: string, delta: number): string {
  const anio = Number(mes.slice(0, 4))
  const m = Number(mes.slice(4, 6)) - 1 + delta
  const a = anio + Math.floor(m / 12)
  const mm = ((m % 12) + 12) % 12
  return `${a}${String(mm + 1).padStart(2, '0')}`
}

interface AcumuladoConcepto {
  cant: number
  monto: number
}

interface AcumuladoPersonaMes {
  cc: number
  conceptos: Map<string, AcumuladoConcepto>
}

interface DatosEmpleado {
  nombre: string
  cc: number
  seccion: number
  puesto: number
  esquema: number
  fechaIngreso: string | null
  fechaEgreso: string | null
}

const RE_TABLA_LIQ = /^liq(\d{4})$/

/**
 * Acumula las filas del dump de Salario y arma los resúmenes mensuales de RRHH.
 * Reproduce el cálculo validado en `extraer_salario.py`: solo la liquidación mensual,
 * centro de costo = el mayor del legajo en el mes, y descarte de horas mal cargadas.
 */
export class AcumuladorSalario {
  private readonly personaMes = new Map<string, AcumuladoPersonaMes>()
  private readonly empleados = new Map<number, DatosEmpleado>()
  private readonly vacaciones = new Map<number, PeriodoVacaciones[]>()
  private readonly feriados = new Map<string, Map<number, number>>()
  private readonly codigos = new Map<number, Map<number, string>>()

  constructor(
    private readonly opciones: OpcionesResumen & {
      /** Año mínimo de las tablas liqAAAA a leer. */
      anioDesde: number
    },
  ) {}

  /** Para pasarle a `leerDumpMysql`: tablas que el cálculo necesita. */
  quiereTabla = (tabla: string): boolean => {
    const liq = RE_TABLA_LIQ.exec(tabla)
    if (liq) return Number(liq[1]) >= this.opciones.anioDesde
    return tabla === 'empleado' || tabla === 'tablas' || tabla === 'vac'
  }

  onFila = (tabla: string, fila: FilaDump): void => {
    if (RE_TABLA_LIQ.test(tabla)) this.agregarLiquidacion(fila)
    else if (tabla === 'empleado') this.agregarEmpleado(fila)
    else if (tabla === 'tablas') this.agregarCodigo(fila)
    else if (tabla === 'vac') this.agregarVacacion(fila)
  }

  private agregarLiquidacion(fila: FilaDump): void {
    if ((fila.TIPOLIQ ?? '').trim() !== TIPO_LIQUIDACION_MENSUAL) return
    const mes = (fila.MES ?? '').trim()
    const legajo = entero(fila.LEGAJO)
    if (mes.length !== 6 || !legajo) return
    const clave = `${mes}|${legajo}`
    let acc = this.personaMes.get(clave)
    if (!acc) {
      acc = { cc: 0, conceptos: new Map() }
      this.personaMes.set(clave, acc)
    }
    const cc = entero(fila.CCOSTO)
    if (cc > acc.cc) acc.cc = cc

    const concepto = (fila.CONCEPTO ?? '').trim()
    if (!CONCEPTOS_RELEVANTES.has(concepto)) return
    const cant = num(fila.CANT)
    const monto = num(fila.MONTO)
    if (concepto === CONCEPTO_FERIADOS_MES) {
      const cantidad = Math.round(cant)
      let porCant = this.feriados.get(mes)
      if (!porCant) {
        porCant = new Map()
        this.feriados.set(mes, porCant)
      }
      porCant.set(cantidad, (porCant.get(cantidad) ?? 0) + 1)
      return
    }
    const previo = acc.conceptos.get(concepto)
    if (previo) {
      previo.cant += cant
      previo.monto += monto
    } else {
      acc.conceptos.set(concepto, { cant, monto })
    }
  }

  private agregarEmpleado(fila: FilaDump): void {
    const legajo = entero(fila.LEGAJO)
    if (!legajo) return
    const ingreso2 = fecha(fila.FECING2)
    this.empleados.set(legajo, {
      nombre: (fila.NOMBRE ?? '').trim(),
      cc: entero(fila.CCOSTO),
      seccion: entero(fila.SECCION),
      puesto: entero(fila.PUESTO),
      esquema: entero(fila.ESQLIQ),
      fechaIngreso: ingreso2 ?? fecha(fila.FECING),
      fechaEgreso: fecha(fila.FECEGR),
    })
  }

  private agregarCodigo(fila: FilaDump): void {
    const cotab = entero(fila.COTAB)
    const codigo = entero(fila.CODIGO)
    if (codigo <= 0) return
    let tabla = this.codigos.get(cotab)
    if (!tabla) {
      tabla = new Map()
      this.codigos.set(cotab, tabla)
    }
    tabla.set(codigo, (fila.DESCR ?? '').trim())
  }

  private agregarVacacion(fila: FilaDump): void {
    const legajo = entero(fila.LEGAJO)
    const desde = fecha(fila.FECINI)
    const hasta = fecha(fila.FECFIN)
    if (!legajo || !desde || !hasta || hasta < desde) return
    if (this.opciones.vacacionesDesde && hasta < this.opciones.vacacionesDesde) return
    const lista = this.vacaciones.get(legajo) ?? []
    lista.push({ desde, hasta, dias: entero(fila.DIAS) })
    this.vacaciones.set(legajo, lista)
  }

  resultado(): ResultadoResumen {
    const todosLosMeses = new Set<string>()
    for (const clave of this.personaMes.keys()) todosLosMeses.add(clave.slice(0, 6))
    const ordenados = [...todosLosMeses].sort()
    const ultimoMes = ordenados.at(-1) ?? null
    const primerMes = ultimoMes ? sumarMeses(ultimoMes, -(this.opciones.mesesHistoria - 1)) : null
    const meses = ordenados.filter((m) => primerMes !== null && m >= primerMes)
    const mesesSet = new Set(meses)

    const porCc = new Map<string, ResumenCentroCostoMes>()
    const personas = new Map<number, ResumenPersona>()
    const anomalias: AnomaliaHoras[] = []

    for (const [clave, acc] of this.personaMes) {
      const mes = clave.slice(0, 6)
      if (!mesesSet.has(mes)) continue
      const legajo = Number(clave.slice(7))

      const mp: MesPersona = { cc: acc.cc, horas: horasVacias(), totales: totalesVacios(), ausencias: {} }
      for (const [concepto, { cant, monto }] of acc.conceptos) {
        const grupo = grupoHorasDe(concepto)
        if (grupo) {
          let hs = cant
          if (horasInvalidas(concepto, cant, monto)) {
            anomalias.push({ mes, legajo, concepto, horas: redondear(cant), monto: redondear(monto) })
            hs = 0
          }
          mp.horas[grupo].hs += hs
          mp.horas[grupo].monto += monto
          continue
        }
        const tipo = tipoAusenciaDe(concepto)
        if (tipo) {
          if (monto) mp.ausencias[tipo] = (mp.ausencias[tipo] ?? 0) + monto
          continue
        }
        const total = totalDe(concepto)
        if (total) mp.totales[total] += monto
      }

      const ccClave = `${mes}|${acc.cc}`
      let rc = porCc.get(ccClave)
      if (!rc) {
        rc = {
          mes,
          cc: acc.cc,
          dotacion: 0,
          conHorasExtra: 0,
          horas: horasVacias(),
          totales: totalesVacios(),
          ausencias: {},
        }
        porCc.set(ccClave, rc)
      }
      rc.dotacion += 1
      if (mp.horas.he50.hs + mp.horas.he100.hs + mp.horas.fer.hs > 0) rc.conHorasExtra += 1
      for (const g of GRUPOS) {
        rc.horas[g].hs += mp.horas[g].hs
        rc.horas[g].monto += mp.horas[g].monto
      }
      for (const t of Object.keys(mp.totales) as TotalLiquidacion[]) rc.totales[t] += mp.totales[t]
      for (const [tipo, dias] of Object.entries(mp.ausencias)) {
        rc.ausencias[tipo] = (rc.ausencias[tipo] ?? 0) + dias
      }

      let persona = personas.get(legajo)
      if (!persona) {
        persona = this.nuevaPersona(legajo)
        personas.set(legajo, persona)
      }
      persona.meses[mes] = redondearMes(mp)
    }

    for (const persona of personas.values()) {
      const ultimo = Object.keys(persona.meses).sort().at(-1)
      if (ultimo) persona.cc = persona.meses[ultimo].cc
    }

    const centrosCosto = [...porCc.values()]
      .map((rc) => ({ ...rc, ...redondearMes(rc) }))
      .sort((a, b) => (a.mes === b.mes ? a.cc - b.cc : a.mes < b.mes ? -1 : 1))

    const feriadosPorMes: Record<string, number> = {}
    for (const mes of meses) feriadosPorMes[mes] = modaFeriados(this.feriados.get(mes))

    return {
      meses,
      ultimoMes,
      centrosCosto,
      personas: [...personas.values()].sort((a, b) => a.legajo - b.legajo),
      feriadosPorMes,
      catalogos: {
        centrosCosto: this.tablaCodigos(TABLAS_CODIGOS.centroCosto),
        secciones: this.tablaCodigos(TABLAS_CODIGOS.seccion),
        puestos: this.tablaCodigos(TABLAS_CODIGOS.puesto),
        esquemasLiquidacion: this.tablaCodigos(TABLAS_CODIGOS.esquemaLiquidacion),
        tiposAusencia: this.tablaCodigos(TABLAS_CODIGOS.tipoAusencia),
      },
      anomalias,
    }
  }

  private nuevaPersona(legajo: number): ResumenPersona {
    const emp = this.empleados.get(legajo)
    const vac = (this.vacaciones.get(legajo) ?? []).sort((a, b) => (a.desde < b.desde ? -1 : 1))
    return {
      legajo,
      nombre: emp?.nombre ?? '',
      cc: emp?.cc ?? 0,
      seccion: emp?.seccion ?? 0,
      puesto: emp?.puesto ?? 0,
      esquemaLiquidacion: emp?.esquema ?? 0,
      fechaIngreso: emp?.fechaIngreso ?? null,
      fechaEgreso: emp?.fechaEgreso ?? null,
      meses: {},
      vacaciones: vac,
    }
  }

  private tablaCodigos(cotab: number): Record<number, string> {
    return Object.fromEntries(this.codigos.get(cotab) ?? [])
  }
}

function redondearMes(m: MesPersona): MesPersona {
  const horas = horasVacias()
  for (const g of GRUPOS) {
    horas[g] = { hs: redondear(m.horas[g].hs), monto: redondear(m.horas[g].monto) }
  }
  const totales = totalesVacios()
  for (const t of Object.keys(totales) as TotalLiquidacion[]) totales[t] = redondear(m.totales[t])
  const ausencias: Record<string, number> = {}
  for (const [tipo, dias] of Object.entries(m.ausencias)) ausencias[tipo] = redondear(dias)
  return { cc: m.cc, horas, totales, ausencias }
}

/** Cantidad de feriados del mes: el valor de FERIAD más repetido (a igualdad, el mayor). */
function modaFeriados(porCant: Map<number, number> | undefined): number {
  if (!porCant) return 0
  let mejor = 0
  let veces = 0
  for (const [cant, n] of porCant) {
    if (n > veces || (n === veces && cant > mejor)) {
      mejor = cant
      veces = n
    }
  }
  return mejor
}
