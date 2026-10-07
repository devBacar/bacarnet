import type { ConvenioRrhh, FilaCostoNominaRrhh } from '../../services/rrhhApi'
import { claveDe, type Agrupacion } from './evolucionDatos'

/** Agrupa los costos de personal por período y por empresa, convenio o área. */

export interface Totales {
  personas: number
  rem: number
  norem: number
  desc: number
  neto: number
  contrib: number
  prov: number
  costoLaboral: number
  adelantos: number
  extras: number
}

export interface PeriodoCosto extends Totales {
  clave: string
  etiqueta: string
  etiquetaCorta: string
  meses: number
  mesesTotales: number
}

export const bruto = (t: Totales) => t.rem + t.norem
export const costoLaboral = (t: Totales) => t.costoLaboral

function vacio(): Totales {
  return { personas: 0, rem: 0, norem: 0, desc: 0, neto: 0, contrib: 0, prov: 0, costoLaboral: 0, adelantos: 0, extras: 0 }
}

/** Suma filas; las personas se promedian por mes (no se suman meses). */
export function sumar(filas: FilaCostoNominaRrhh[]): Totales & { meses: number } {
  const t = vacio()
  const meses = new Set<string>()
  for (const f of filas) {
    meses.add(f.mes)
    t.personas += f.personas
    t.rem += f.rem
    t.norem += f.norem
    t.desc += f.desc
    t.neto += f.neto
    t.contrib += f.contrib
    t.prov += f.prov
    t.costoLaboral += f.costoLaboral
    t.adelantos += f.adelantos
    t.extras += f.extras
  }
  return { ...t, personas: t.personas / Math.max(1, meses.size), meses: meses.size }
}

/** Mismo criterio para las filas de costos y para la lista de personas, así los totales coinciden. */
export function cumpleFiltro(
  f: { cc: number; convenio: ConvenioRrhh },
  unidadDe: Map<number, string>,
  unidad: string,
  cc: number | 'todas',
  convenio: ConvenioRrhh | 'todos' = 'todos',
): boolean {
  if (convenio !== 'todos' && f.convenio !== convenio) return false
  if (cc !== 'todas') return f.cc === cc
  if (unidad === 'todas') return true
  return unidadDe.get(f.cc) === unidad
}

export function filtrarCostos(
  filas: FilaCostoNominaRrhh[],
  unidadDe: Map<number, string>,
  unidad: string,
  cc: number | 'todas',
  convenio: ConvenioRrhh | 'todos' = 'todos',
): FilaCostoNominaRrhh[] {
  return filas.filter((f) => cumpleFiltro(f, unidadDe, unidad, cc, convenio))
}

export function agruparCostos(filas: FilaCostoNominaRrhh[], ag: Agrupacion): PeriodoCosto[] {
  const grupos = new Map<string, { info: ReturnType<typeof claveDe>; filas: FilaCostoNominaRrhh[] }>()
  for (const f of filas) {
    const info = claveDe(f.mes, ag)
    const g = grupos.get(info.clave) ?? { info, filas: [] }
    g.filas.push(f)
    grupos.set(info.clave, g)
  }
  return [...grupos.values()]
    .sort((a, b) => a.info.clave.localeCompare(b.info.clave))
    .map(({ info, filas: fs }) => {
      const t = sumar(fs)
      return { ...t, clave: info.clave, etiqueta: info.etiqueta, etiquetaCorta: info.corta, mesesTotales: info.total }
    })
}

export function agruparPor<K extends string | number>(filas: FilaCostoNominaRrhh[], clave: (f: FilaCostoNominaRrhh) => K): Map<K, Totales> {
  const grupos = new Map<K, FilaCostoNominaRrhh[]>()
  for (const f of filas) grupos.set(clave(f), [...(grupos.get(clave(f)) ?? []), f])
  return new Map([...grupos.entries()].map(([k, fs]) => [k, sumar(fs)]))
}
