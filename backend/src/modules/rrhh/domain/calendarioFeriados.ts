/**
 * Feriados nacionales para proyectar los meses que todavía no se liquidaron.
 * Los meses pasados no usan esta lista: salen del concepto FERIAD de Salario.
 *
 * Prioridad al armar el calendario de un año: el oficial guardado, y si no está,
 * esta lista conocida de 2026-2027 (incluye días de Córdoba y decretos) encima del cálculo.
 * El cálculo cubre cualquier año: fijos, Carnaval, Viernes Santo y trasladables de la ley 27.399.
 */

export type OrigenFeriado = 'oficial' | 'conocido' | 'calculado'

export interface FeriadoFecha {
  nombre: string
  origen: OrigenFeriado
}

/** Un año → fecha AAAA-MM-DD → nombre y de dónde salió. */
export interface CalendarioFeriados {
  anios: Record<string, Record<string, FeriadoFecha>>
}

export interface OrigenAnioFeriados {
  anio: string
  origen: OrigenFeriado | 'mixto'
  texto: string
}

/**
 * Lista fija 2026-2027, dato conocido (nacionales, provinciales de Córdoba y decretos).
 * No incluye días no laborables optativos, salvo los que ya estaban publicados acá.
 */
export const FERIADOS: Record<string, string> = {
  '2026-10-12': 'Diversidad Cultural',
  // DNU 1103/2026: el 9/11 es feriado nacional y el 10/11 solo en Córdoba y CABA.
  '2026-11-09': 'Visita del Papa',
  '2026-11-10': 'Visita del Papa (Córdoba)',
  '2026-11-23': 'Soberanía Nacional',
  '2026-12-08': 'Inmaculada Concepción',
  '2026-12-25': 'Navidad',
  '2027-01-01': 'Año Nuevo',
  '2027-02-08': 'Carnaval',
  '2027-02-09': 'Carnaval',
  '2027-03-24': 'Día de la Memoria',
  '2027-03-26': 'Viernes Santo',
  '2027-04-02': 'Malvinas',
  '2027-05-01': 'Día del Trabajador',
  '2027-05-25': 'Revolución de Mayo',
  '2027-06-21': 'Güemes (trasladable)',
  '2027-06-20': 'Día de la Bandera',
  '2027-07-09': 'Independencia',
  '2027-08-16': 'San Martín (trasladable)',
  '2027-10-11': 'Diversidad Cultural (trasladable)',
  '2027-11-20': 'Soberanía Nacional',
  '2027-12-08': 'Inmaculada Concepción',
  '2027-12-25': 'Navidad',
}

const FIJOS: { mes: number; dia: number; nombre: string }[] = [
  { mes: 1, dia: 1, nombre: 'Año Nuevo' },
  { mes: 3, dia: 24, nombre: 'Día de la Memoria' },
  { mes: 4, dia: 2, nombre: 'Malvinas' },
  { mes: 5, dia: 1, nombre: 'Día del Trabajador' },
  { mes: 5, dia: 25, nombre: 'Revolución de Mayo' },
  { mes: 6, dia: 20, nombre: 'Día de la Bandera' },
  { mes: 7, dia: 9, nombre: 'Independencia' },
  { mes: 12, dia: 8, nombre: 'Inmaculada Concepción' },
  { mes: 12, dia: 25, nombre: 'Navidad' },
]

/** Ley 27.399: se corren al lunes si caen martes, miércoles, jueves o viernes. */
const TRASLADABLES: { mes: number; dia: number; nombre: string }[] = [
  { mes: 6, dia: 17, nombre: 'Güemes' },
  { mes: 8, dia: 17, nombre: 'San Martín' },
  { mes: 10, dia: 12, nombre: 'Diversidad Cultural' },
  { mes: 11, dia: 20, nombre: 'Soberanía Nacional' },
]

function iso(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)
}

/** Domingo de Pascua (algoritmo de Meeus/Butcher, calendario gregoriano). */
export function pascua(anio: number): string {
  const a = anio % 19
  const b = Math.floor(anio / 100)
  const c = anio % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return iso(anio, mes, dia)
}

/**
 * Martes o miércoles → lunes anterior. Jueves o viernes → lunes siguiente.
 * Lunes, sábado y domingo quedan en su fecha.
 */
export function trasladar(anio: number, mes: number, dia: number): { fecha: string; movido: boolean } {
  const fecha = iso(anio, mes, dia)
  const dow = new Date(`${fecha}T00:00:00Z`).getUTCDay()
  if (dow === 2) return { fecha: sumarDias(fecha, -1), movido: true }
  if (dow === 3) return { fecha: sumarDias(fecha, -2), movido: true }
  if (dow === 4) return { fecha: sumarDias(fecha, 4), movido: true }
  if (dow === 5) return { fecha: sumarDias(fecha, 3), movido: true }
  return { fecha, movido: false }
}

function poner(out: Record<string, string>, fecha: string, nombre: string): void {
  out[fecha] = out[fecha] ? `${out[fecha]} · ${nombre}` : nombre
}

/** Feriados nacionales de un año, sin puentes ni días provinciales. */
export function feriadosNacionales(anio: number): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of FIJOS) poner(out, iso(anio, f.mes, f.dia), f.nombre)
  const domingo = pascua(anio)
  poner(out, sumarDias(domingo, -48), 'Carnaval')
  poner(out, sumarDias(domingo, -47), 'Carnaval')
  poner(out, sumarDias(domingo, -2), 'Viernes Santo')
  for (const f of TRASLADABLES) {
    const t = trasladar(anio, f.mes, f.dia)
    poner(out, t.fecha, t.movido ? `${f.nombre} (trasladable)` : f.nombre)
  }
  return out
}

function resolverAnio(anio: number, oficial: Record<string, string> | undefined): Record<string, FeriadoFecha> {
  const out: Record<string, FeriadoFecha> = {}
  if (oficial && Object.keys(oficial).length > 0) {
    for (const [fecha, nombre] of Object.entries(oficial)) {
      if (fecha.startsWith(String(anio))) out[fecha] = { nombre, origen: 'oficial' }
    }
    return out
  }
  for (const [fecha, nombre] of Object.entries(feriadosNacionales(anio))) {
    out[fecha] = { nombre, origen: 'calculado' }
  }
  for (const [fecha, nombre] of Object.entries(FERIADOS)) {
    if (fecha.startsWith(String(anio))) out[fecha] = { nombre, origen: 'conocido' }
  }
  return out
}

/** Arma el calendario de los años pedidos. `oficial` (año → fechas) pisa al cálculo y a la lista conocida. */
export function armarCalendario(
  anios: number[],
  oficial: Record<number, Record<string, string>> = {},
): CalendarioFeriados {
  const cal: CalendarioFeriados = { anios: {} }
  for (const anio of anios) cal.anios[String(anio)] = resolverAnio(anio, oficial[anio])
  return cal
}

export function textoOrigen(origen: OrigenFeriado | 'mixto'): string {
  if (origen === 'oficial') return 'Calendario oficial'
  if (origen === 'conocido') return 'Calendario conocido'
  if (origen === 'mixto') return 'Calendario conocido y calculado'
  return 'Calculado'
}

function origenDe(fechas: Record<string, FeriadoFecha>): OrigenFeriado | 'mixto' {
  const set = new Set(Object.values(fechas).map((f) => f.origen))
  if (set.size === 0) return 'calculado'
  if (set.size === 1) return [...set][0]
  return 'mixto'
}

export function resumenOrigenFeriados(cal: CalendarioFeriados): OrigenAnioFeriados[] {
  return Object.entries(cal.anios)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([anio, fechas]) => {
      const origen = origenDe(fechas)
      return { anio, origen, texto: textoOrigen(origen) }
    })
}

/** Feriados de un mes AAAAMM: cantidad y detalle legible ("9/11 Visita del Papa"). */
export function feriadosDelMes(
  mes: string,
  calendario?: CalendarioFeriados,
): { cantidad: number; detalle: string[]; enCalendario: boolean; origen: OrigenFeriado | 'mixto' } {
  const anio = mes.slice(0, 4)
  const delAnio = calendario?.anios[anio] ?? resolverAnio(Number(anio), undefined)
  const prefijo = `${anio}-${mes.slice(4, 6)}-`
  const delMes = Object.entries(delAnio)
    .filter(([fecha]) => fecha.startsWith(prefijo))
    .sort(([a], [b]) => (a < b ? -1 : 1))
  const detalle = delMes.map(([fecha, f]) => `${Number(fecha.slice(8, 10))}/${Number(fecha.slice(5, 7))} ${f.nombre}`)
  const origen = delMes.length > 0 ? origenDe(Object.fromEntries(delMes)) : origenDe(delAnio)
  return { cantidad: detalle.length, detalle, enCalendario: true, origen }
}
