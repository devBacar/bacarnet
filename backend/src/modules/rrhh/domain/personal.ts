import { CONVENIOS, convenioDeEsquema, ventanaLiquidacion, type Convenio } from './convenios.js'
import { construirIndicadores } from './indicadores.js'
import type { FamiliarSalario, ResultadoResumen, ResumenPersona } from './resumenMensual.js'
import { sumarMeses } from './resumenMensual.js'

/**
 * Relación en la tabla `familiar` de Salario.
 * Verificar con RRHH: en el backup solo aparecen 1, 2 y 3.
 */
export const RELACION_FAMILIAR = {
  conyuge: 1,
  hijo: 2,
  otro: 3,
} as const

/** Años que se avisan el mes siguiente al último cerrado. */
const ANIVERSARIOS = [5, 10, 15, 20, 25, 30] as const

const EDAD_MIN = 16
const EDAD_MAX = 90
const EDAD_JUB_MUJER = 60
const EDAD_JUB_VARON = 65

export type DatoPrivado = number | 'menos de 3'

export interface RangoPersonal {
  id: string
  nombre: string
  cantidad: number
}

export interface ItemDistribucion {
  id: string
  nombre: string
  cantidad: number
}

export interface CortePersonal {
  id: string
  nombre: string
  /** Último período cerrado de este corte (AAAAMM). */
  mes: string
  personas: number
  edadPromedio: number | null
  antiguedadPromedio: number | null
  /** Parte de mujeres. "menos de 3" si el grupo de mujeres o de varones tiene menos de 3. */
  pctMujeres: DatoPrivado
  pctConHijos: number
  /** Familiares con discapacidad. "menos de 3" si hay 1 o 2. */
  discapacidad: DatoPrivado
}

export interface PersonalAgregado {
  /** Mes más nuevo entre los períodos cerrados (AAAAMM). */
  mes: string
  nota: string
  dotacion: number
  edadPromedio: number | null
  antiguedadPromedio: number | null
  mujeres: number
  varones: number
  sinSexo: number
  pctMujeres: number
  pctVarones: number
  rangosEdad: RangoPersonal[]
  rangosAntiguedad: RangoPersonal[]
  /** Mujeres de 60 años o más y varones de 65 o más. */
  enEdadDeJubilarse: number
  /** Todavía no llegan, pero cumplen esa edad dentro de los próximos 2 años. */
  jubilacionProximos2Anios: number
  aniversarios: {
    mes: string
    cantidad: number
    porAnios: { anios: number; cantidad: number }[]
  }
  porArea: CortePersonal[]
  porConvenio: CortePersonal[]
  estadoCivil: ItemDistribucion[]
  estudios: ItemDistribucion[]
  contratos: ItemDistribucion[]
  jornadaParcial: number
  jornadaCompleta: number
  jornadaSinDato: number
  /** Parte con el dato cargado (lo que no es Sin dato), de 0 a 1. */
  calidad: { estudios: number; estadoCivil: number; contrato: number; sexo: number; edad: number; jornada: number }
  familia: {
    nota: string
    personasConHijos: number
    totalHijos: number
    hijosEdadEscolar: number
    familiaresConDiscapacidad: number
  }
}

export interface PersonaPersonalDetalle {
  legajo: number
  nombre: string
  area: string
  convenio: Convenio
  convenioNombre: string
  edad: number | null
  antiguedad: number | null
  sexo: string
  contrato: string
  hijos: number
}

export interface AniversarioDetalle {
  legajo: number
  nombre: string
  area: string
  anios: number
  ingreso: string
}

export interface PersonalDetalle {
  personas: PersonaPersonalDetalle[]
  aniversarios: AniversarioDetalle[]
}

const RANGOS_EDAD: { id: string; nombre: string }[] = [
  { id: 'menos25', nombre: 'Menos de 25' },
  { id: '25a34', nombre: '25 a 34' },
  { id: '35a44', nombre: '35 a 44' },
  { id: '45a54', nombre: '45 a 54' },
  { id: '55a64', nombre: '55 a 64' },
  { id: '65mas', nombre: '65 o más' },
  { id: 'sinDato', nombre: 'Sin dato' },
]

const RANGOS_ANT: { id: string; nombre: string }[] = [
  { id: 'menos1', nombre: 'Menos de 1 año' },
  { id: '1a5', nombre: '1 a 5 años' },
  { id: '5a10', nombre: '5 a 10 años' },
  { id: '10a20', nombre: '10 a 20 años' },
  { id: 'mas20', nombre: 'Más de 20 años' },
  { id: 'sinDato', nombre: 'Sin dato' },
]

const ORDEN_CONVENIOS: Convenio[] = ['suvico', 'camioneros', 'bancarios', 'comercio', 'fuera']

interface Ficha {
  persona: ResumenPersona
  convenio: Convenio
  mes: string
  hasta: string
  edad: number | null
  antiguedad: number | null
  hijos: number
  hijosEscolares: number
  discapacidad: number
}

function r1(n: number): number {
  return Math.round(n * 10) / 10
}

function r4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

function promedio(vals: number[]): number | null {
  if (vals.length === 0) return null
  return r1(vals.reduce((s, n) => s + n, 0) / vals.length)
}

/** Años cumplidos en `hasta` (AAAA-MM-DD). */
export function edadEn(fecNac: string, hasta: string): number {
  const n = new Date(`${fecNac}T00:00:00Z`)
  const h = new Date(`${hasta}T00:00:00Z`)
  let anios = h.getUTCFullYear() - n.getUTCFullYear()
  const mdN = (n.getUTCMonth() + 1) * 100 + n.getUTCDate()
  const mdH = (h.getUTCMonth() + 1) * 100 + h.getUTCDate()
  if (mdH < mdN) anios -= 1
  return anios
}

function fechaCumple(fecNac: string, anios: number): string {
  const d = new Date(`${fecNac}T00:00:00Z`)
  const y = d.getUTCFullYear() + anios
  const m = d.getUTCMonth()
  const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const dia = Math.min(d.getUTCDate(), ultimo)
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function sumarAnios(fecha: string, anios: number): string {
  return fechaCumple(fecha, anios)
}

/** Años con un decimal, desde el ingreso hasta el cierre del período. */
export function antiguedadEn(ingreso: string, hasta: string): number {
  const dias = (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${ingreso}T00:00:00Z`)) / 86_400_000
  if (dias < 0) return 0
  return r1(dias / 365.25)
}

function edadValida(fecNac: string | null | undefined, hasta: string): number | null {
  if (!fecNac) return null
  const edad = edadEn(fecNac, hasta)
  if (edad < EDAD_MIN || edad > EDAD_MAX) return null
  return edad
}

function rangoEdad(edad: number | null): string {
  if (edad === null) return 'sinDato'
  if (edad < 25) return 'menos25'
  if (edad <= 34) return '25a34'
  if (edad <= 44) return '35a44'
  if (edad <= 54) return '45a54'
  if (edad <= 64) return '55a64'
  return '65mas'
}

function rangoAntiguedad(anios: number | null): string {
  if (anios === null) return 'sinDato'
  if (anios < 1) return 'menos1'
  if (anios < 5) return '1a5'
  if (anios < 10) return '5a10'
  if (anios <= 20) return '10a20'
  return 'mas20'
}

/** 1 o 2 no se publican: se muestra "menos de 3". El 0 queda en 0. */
function celdaPrivada(n: number): DatoPrivado {
  return n > 0 && n < 3 ? 'menos de 3' : n
}

function pctSexo(mujeres: number, varones: number, total: number): DatoPrivado {
  if (mujeres < 3 || varones < 3) return 'menos de 3'
  return total > 0 ? r4(mujeres / total) : 0
}

function contarRangos(ids: string[], catalogo: { id: string; nombre: string }[]): RangoPersonal[] {
  const n = new Map<string, number>()
  for (const id of ids) n.set(id, (n.get(id) ?? 0) + 1)
  return catalogo.map((r) => ({ id: r.id, nombre: r.nombre, cantidad: n.get(r.id) ?? 0 }))
}

function distribuir(codigos: number[], catalogo: Record<number, string> | undefined): { items: ItemDistribucion[]; cargado: number } {
  const counts = new Map<number, number>()
  let sin = 0
  for (const c of codigos) {
    if (!c || !catalogo?.[c]) {
      sin += 1
      continue
    }
    counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  const items: ItemDistribucion[] = [...counts.entries()]
    .map(([id, cantidad]) => ({ id: String(id), nombre: catalogo?.[id] ?? 'Sin dato', cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, 'es'))
  items.push({ id: 'sinDato', nombre: 'Sin dato', cantidad: sin })
  const cargado = codigos.length ? (codigos.length - sin) / codigos.length : 0
  return { items, cargado: r4(cargado) }
}

function etiquetaSexo(sexo: 'M' | 'F' | null | undefined): string {
  if (sexo === 'F') return 'Mujer'
  if (sexo === 'M') return 'Varón'
  return 'Sin dato'
}

function corteDe(id: string, nombre: string, mes: string, fichas: Ficha[]): CortePersonal {
  const mujeres = fichas.filter((f) => f.persona.sexo === 'F').length
  const varones = fichas.filter((f) => f.persona.sexo === 'M').length
  const conHijos = fichas.filter((f) => f.hijos > 0).length
  const discapacidad = fichas.reduce((s, f) => s + f.discapacidad, 0)
  return {
    id,
    nombre,
    mes,
    personas: fichas.length,
    edadPromedio: promedio(fichas.flatMap((f) => (f.edad === null ? [] : [f.edad]))),
    antiguedadPromedio: promedio(fichas.flatMap((f) => (f.antiguedad === null ? [] : [f.antiguedad]))),
    pctMujeres: pctSexo(mujeres, varones, fichas.length),
    pctConHijos: fichas.length ? r4(conHijos / fichas.length) : 0,
    discapacidad: celdaPrivada(discapacidad),
  }
}

/**
 * Último mes con liquidación de cada convenio. La dotación es la misma que Personas
 * de Indicadores en ese período (Toda la empresa, cuando todos cerraron el mismo mes).
 */
export function ultimoMesPorConvenio(resultado: ResultadoResumen): Map<Convenio, string> {
  const meses = new Set(resultado.meses)
  const ult = new Map<Convenio, string>()
  const esquemas = resultado.catalogos.esquemasLiquidacion
  for (const p of resultado.personas) {
    const convenio = convenioDeEsquema(esquemas[p.esquemaLiquidacion])
    for (const mes of Object.keys(p.meses)) {
      if (!meses.has(mes)) continue
      const prev = ult.get(convenio)
      if (!prev || mes > prev) ult.set(convenio, mes)
    }
  }
  return ult
}

export function construirPersonal(
  resultado: ResultadoResumen,
  nombreArea: (cc: number) => string,
): { agregado: PersonalAgregado; detalle: PersonalDetalle } {
  const esquemas = resultado.catalogos.esquemasLiquidacion
  const convenioDe = (p: ResumenPersona): Convenio => convenioDeEsquema(esquemas[p.esquemaLiquidacion])
  const ultimos = ultimoMesPorConvenio(resultado)
  const mes = [...ultimos.values()].sort().at(-1) ?? resultado.ultimoMes ?? ''
  const mesAniversario = mes ? sumarMeses(mes, 1) : ''
  const anioAniv = Number(mesAniversario.slice(0, 4))
  const mmAniv = Number(mesAniversario.slice(4, 6))

  const porLegajo = new Map<number, FamiliarSalario[]>()
  for (const f of resultado.familiares ?? []) {
    const lista = porLegajo.get(f.legajo) ?? []
    lista.push(f)
    porLegajo.set(f.legajo, lista)
  }

  const fichas: Ficha[] = []
  for (const p of resultado.personas) {
    const convenio = convenioDe(p)
    const mesConv = ultimos.get(convenio)
    if (!mesConv || !p.meses[mesConv]) continue
    const hasta = ventanaLiquidacion(mesConv, convenio).hasta
    const familia = porLegajo.get(p.legajo) ?? []
    const hijos = familia.filter((f) => f.relacion === RELACION_FAMILIAR.hijo)
    let escolares = 0
    for (const h of hijos) {
      if (!h.fecNac) continue
      const edad = edadEn(h.fecNac, hasta)
      if (edad >= 4 && edad <= 17) escolares += 1
    }
    fichas.push({
      persona: p,
      convenio,
      mes: mesConv,
      hasta,
      edad: edadValida(p.fecNac, hasta),
      antiguedad: p.fechaIngreso ? antiguedadEn(p.fechaIngreso, hasta) : null,
      hijos: hijos.length,
      hijosEscolares: escolares,
      discapacidad: familia.filter((f) => f.discapacidad).length,
    })
  }

  const mujeres = fichas.filter((f) => f.persona.sexo === 'F').length
  const varones = fichas.filter((f) => f.persona.sexo === 'M').length
  const sinSexo = fichas.length - mujeres - varones

  let enEdad = 0
  let proximos = 0
  for (const f of fichas) {
    if (f.edad === null || !f.persona.fecNac) continue
    const umbral = f.persona.sexo === 'F' ? EDAD_JUB_MUJER : f.persona.sexo === 'M' ? EDAD_JUB_VARON : null
    if (umbral === null) continue
    const cumple = fechaCumple(f.persona.fecNac, umbral)
    if (cumple <= f.hasta) enEdad += 1
    else if (cumple <= sumarAnios(f.hasta, 2)) proximos += 1
  }

  const anivDetalle: AniversarioDetalle[] = []
  const porAnios = new Map<number, number>()
  for (const anios of ANIVERSARIOS) porAnios.set(anios, 0)
  for (const f of fichas) {
    const ingreso = f.persona.fechaIngreso
    if (!ingreso || !mesAniversario) continue
    const d = new Date(`${ingreso}T00:00:00Z`)
    if (d.getUTCMonth() + 1 !== mmAniv) continue
    const cumplidos = anioAniv - d.getUTCFullYear()
    if (!ANIVERSARIOS.includes(cumplidos as (typeof ANIVERSARIOS)[number])) continue
    porAnios.set(cumplidos, (porAnios.get(cumplidos) ?? 0) + 1)
    anivDetalle.push({
      legajo: f.persona.legajo,
      nombre: f.persona.nombre.trim(),
      area: nombreArea(f.persona.meses[f.mes]?.cc ?? f.persona.cc),
      anios: cumplidos,
      ingreso,
    })
  }

  const porArea = new Map<number, Ficha[]>()
  for (const f of fichas) {
    const cc = f.persona.meses[f.mes]?.cc ?? f.persona.cc
    const lista = porArea.get(cc) ?? []
    lista.push(f)
    porArea.set(cc, lista)
  }
  const areas: CortePersonal[] = [...porArea.entries()]
    .map(([cc, lista]) => corteDe(String(cc), nombreArea(cc), lista[0]?.mes ?? mes, lista))
    .sort((a, b) => b.personas - a.personas || a.nombre.localeCompare(b.nombre, 'es'))

  const porConv = new Map<Convenio, Ficha[]>()
  for (const f of fichas) {
    const lista = porConv.get(f.convenio) ?? []
    lista.push(f)
    porConv.set(f.convenio, lista)
  }
  const convenios: CortePersonal[] = ORDEN_CONVENIOS.filter((c) => porConv.has(c)).map((c) => {
    const lista = porConv.get(c) ?? []
    return corteDe(c, CONVENIOS[c].nombre, lista[0]?.mes ?? mes, lista)
  })

  const civil = distribuir(fichas.map((f) => f.persona.estadoCivil ?? 0), resultado.catalogos.estadosCiviles)
  const estudios = distribuir(fichas.map((f) => f.persona.estudio ?? 0), resultado.catalogos.estudios)
  const contratos = distribuir(fichas.map((f) => f.persona.contrato ?? 0), resultado.catalogos.contratos)

  let jornadaParcial = 0
  let jornadaCompleta = 0
  let jornadaSinDato = 0
  for (const f of fichas) {
    if (f.persona.jornadaParcial === true) jornadaParcial += 1
    else if (f.persona.jornadaParcial === false) jornadaCompleta += 1
    else jornadaSinDato += 1
  }

  const conEdad = fichas.filter((f) => f.edad !== null).length
  const detallePersonas: PersonaPersonalDetalle[] = fichas
    .map((f) => ({
      legajo: f.persona.legajo,
      nombre: f.persona.nombre.trim(),
      area: nombreArea(f.persona.meses[f.mes]?.cc ?? f.persona.cc),
      convenio: f.convenio,
      convenioNombre: CONVENIOS[f.convenio].nombre,
      edad: f.edad,
      antiguedad: f.antiguedad,
      sexo: etiquetaSexo(f.persona.sexo),
      contrato: (f.persona.contrato && resultado.catalogos.contratos?.[f.persona.contrato]) || 'Sin dato',
      hijos: f.hijos,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.legajo - b.legajo)

  return {
    agregado: {
      mes,
      nota: 'Son las personas liquidadas en el último período cerrado de cada convenio. El total es el mismo que Personas de Toda la empresa en Ausencias y rotación.',
      dotacion: fichas.length,
      edadPromedio: promedio(fichas.flatMap((f) => (f.edad === null ? [] : [f.edad]))),
      antiguedadPromedio: promedio(fichas.flatMap((f) => (f.antiguedad === null ? [] : [f.antiguedad]))),
      mujeres,
      varones,
      sinSexo,
      pctMujeres: fichas.length ? r4(mujeres / fichas.length) : 0,
      pctVarones: fichas.length ? r4(varones / fichas.length) : 0,
      rangosEdad: contarRangos(fichas.map((f) => rangoEdad(f.edad)), RANGOS_EDAD),
      rangosAntiguedad: contarRangos(fichas.map((f) => rangoAntiguedad(f.antiguedad)), RANGOS_ANT),
      enEdadDeJubilarse: enEdad,
      jubilacionProximos2Anios: proximos,
      aniversarios: {
        mes: mesAniversario,
        cantidad: anivDetalle.length,
        porAnios: ANIVERSARIOS.map((anios) => ({ anios, cantidad: porAnios.get(anios) ?? 0 })),
      },
      porArea: areas,
      porConvenio: convenios,
      estadoCivil: civil.items,
      estudios: estudios.items,
      contratos: contratos.items,
      jornadaParcial,
      jornadaCompleta,
      jornadaSinDato,
      calidad: {
        estudios: estudios.cargado,
        estadoCivil: civil.cargado,
        contrato: contratos.cargado,
        sexo: fichas.length ? r4((mujeres + varones) / fichas.length) : 0,
        edad: fichas.length ? r4(conEdad / fichas.length) : 0,
        jornada: fichas.length ? r4((jornadaParcial + jornadaCompleta) / fichas.length) : 0,
      },
      familia: {
        nota: 'Según los familiares cargados en Salario. Si alguien no figura, puede ser que no esté cargado.',
        personasConHijos: fichas.filter((f) => f.hijos > 0).length,
        totalHijos: fichas.reduce((s, f) => s + f.hijos, 0),
        hijosEdadEscolar: fichas.reduce((s, f) => s + f.hijosEscolares, 0),
        familiaresConDiscapacidad: fichas.reduce((s, f) => s + f.discapacidad, 0),
      },
    },
    detalle: {
      personas: detallePersonas,
      aniversarios: anivDetalle.sort((a, b) => a.anios - b.anios || a.nombre.localeCompare(b.nombre, 'es')),
    },
  }
}

/** Suma de Personas de Indicadores en el último mes cerrado de cada convenio. */
export function personasIndicadoresUltimoCierre(resultado: ResultadoResumen, nombreArea: (cc: number) => string): number {
  const { indicadores } = construirIndicadores(resultado, nombreArea)
  const ult = new Map<string, string>()
  for (const f of indicadores.filas) {
    if (f.personas <= 0) continue
    const prev = ult.get(f.convenio)
    if (!prev || f.mes > prev) ult.set(f.convenio, f.mes)
  }
  let suma = 0
  for (const [convenio, mes] of ult) {
    suma += indicadores.filas.find((f) => f.convenio === convenio && f.mes === mes)?.personas ?? 0
  }
  return suma
}
