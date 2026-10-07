import type { ConvenioRrhh, EvolucionRrhh, FilaConvenioRrhh, FilaEvolucionRrhh } from '../../services/rrhhApi'

/** Agrupa la evolución mes a mes en meses, trimestres, semestres o años, con los filtros de unidad y área. */

export type Agrupacion = 'mes' | 'trimestre' | 'semestre' | 'anio'

export interface Periodo {
  clave: string
  etiqueta: string
  etiquetaCorta: string
  /** Meses del período con datos y meses que tiene el período completo. */
  meses: number
  mesesTotales: number
  estimado: boolean
  dotacion: number
  conHorasExtra: number | null
  mas30: number | null
  horasNormales: number
  he50: number
  he100: number
  fer: number
  comp: number
  noct: number
  costoExtra: number
  costoFeriado: number
  costoComp: number
  costoPactadas: number
  horasPactadas: number
  diasVacaciones: number
  diasLicencia: number
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function claveDe(mes: string, ag: Agrupacion): { clave: string; etiqueta: string; corta: string; total: number } {
  const anio = mes.slice(0, 4)
  const m = Number(mes.slice(4, 6))
  if (ag === 'mes') return { clave: mes, etiqueta: `${MESES[m - 1]} ${anio}`, corta: `${MESES[m - 1]}-${anio.slice(2)}`, total: 1 }
  if (ag === 'trimestre') {
    const t = Math.ceil(m / 3)
    return { clave: `${anio}T${t}`, etiqueta: `${t}.º trimestre ${anio}`, corta: `T${t}-${anio.slice(2)}`, total: 3 }
  }
  if (ag === 'semestre') {
    const s = m <= 6 ? 1 : 2
    return { clave: `${anio}S${s}`, etiqueta: `${s}.º semestre ${anio}`, corta: `S${s}-${anio.slice(2)}`, total: 6 }
  }
  return { clave: anio, etiqueta: `Año ${anio}`, corta: anio, total: 12 }
}

export interface Filtro {
  unidad: string
  cc: number | 'todas'
  incluirEstimados: boolean
}

export function filasFiltradas(ev: EvolucionRrhh, f: Filtro): FilaEvolucionRrhh[] {
  const ccsUnidad = new Set(ev.areas.filter((a) => f.unidad === 'todas' || a.unidad === f.unidad).map((a) => a.cc))
  return ev.filas.filter(
    (x) => (f.cc === 'todas' ? ccsUnidad.has(x.cc) : x.cc === f.cc) && (f.incluirEstimados || x.tipo === 'real'),
  )
}

export function agrupar(filas: FilaEvolucionRrhh[], ag: Agrupacion): Periodo[] {
  const porPeriodo = new Map<string, { info: ReturnType<typeof claveDe>; meses: Map<string, FilaEvolucionRrhh[]> }>()
  for (const f of filas) {
    const info = claveDe(f.mes, ag)
    const p = porPeriodo.get(info.clave) ?? { info, meses: new Map() }
    p.meses.set(f.mes, [...(p.meses.get(f.mes) ?? []), f])
    porPeriodo.set(info.clave, p)
  }
  return [...porPeriodo.values()]
    .sort((a, b) => a.info.clave.localeCompare(b.info.clave))
    .map(({ info, meses }) => {
      const todas = [...meses.values()].flat()
      const suma = (k: keyof FilaEvolucionRrhh) => todas.reduce((s, x) => s + (Number(x[k]) || 0), 0)
      const n = meses.size
      // Dotación y personas: promedio por mes del período (no se suman meses).
      const promedioMensual = (k: 'dotacion' | 'conHorasExtra' | 'mas30') => {
        const valores = [...meses.values()].map((fs) => fs.reduce((s, x) => s + (x[k] ?? 0), 0))
        return valores.reduce((s, v) => s + v, 0) / Math.max(1, n)
      }
      const reales = todas.filter((x) => x.tipo === 'real')
      return {
        clave: info.clave,
        etiqueta: info.etiqueta,
        etiquetaCorta: info.corta,
        meses: n,
        mesesTotales: info.total,
        estimado: todas.some((x) => x.tipo !== 'real'),
        dotacion: promedioMensual('dotacion'),
        conHorasExtra: reales.length ? promedioMensual('conHorasExtra') : null,
        mas30: reales.length ? promedioMensual('mas30') : null,
        horasNormales: suma('horasNormales'),
        he50: suma('he50'),
        he100: suma('he100'),
        fer: suma('fer'),
        comp: suma('comp'),
        noct: suma('noct'),
        costoExtra: suma('costoExtra'),
        costoFeriado: suma('costoFeriado'),
        costoComp: suma('costoComp'),
        costoPactadas: suma('costoPactadas'),
        horasPactadas: suma('horasPactadas'),
        diasVacaciones: suma('diasVacaciones'),
        diasLicencia: suma('diasLicencia'),
      }
    })
}

export interface PeriodoConvenio {
  clave: string
  etiqueta: string
  etiquetaCorta: string
  meses: number
  mesesTotales: number
  porConvenio: Partial<Record<ConvenioRrhh, { personas: number; horasNormales: number; horasExtra: number; diasVacaciones: number; diasLicencia: number }>>
}

export function agruparConvenios(filas: FilaConvenioRrhh[], ag: Agrupacion): PeriodoConvenio[] {
  const porPeriodo = new Map<string, PeriodoConvenio & { mesesVistos: Set<string> }>()
  for (const f of filas) {
    const info = claveDe(f.mes, ag)
    const p = porPeriodo.get(info.clave) ?? {
      clave: info.clave,
      etiqueta: info.etiqueta,
      etiquetaCorta: info.corta,
      meses: 0,
      mesesTotales: info.total,
      porConvenio: {},
      mesesVistos: new Set<string>(),
    }
    p.mesesVistos.add(f.mes)
    const c = p.porConvenio[f.convenio] ?? { personas: 0, horasNormales: 0, horasExtra: 0, diasVacaciones: 0, diasLicencia: 0 }
    c.personas += f.personas
    c.horasNormales += f.horasNormales
    c.horasExtra += f.horasExtra
    c.diasVacaciones += f.diasVacaciones
    c.diasLicencia += f.diasLicencia
    p.porConvenio[f.convenio] = c
    porPeriodo.set(info.clave, p)
  }
  return [...porPeriodo.values()]
    .sort((a, b) => a.clave.localeCompare(b.clave))
    .map(({ mesesVistos, ...p }) => ({
      ...p,
      meses: mesesVistos.size,
      // Personas: promedio por mes.
      porConvenio: Object.fromEntries(
        Object.entries(p.porConvenio).map(([k, v]) => [k, { ...v, personas: v.personas / Math.max(1, mesesVistos.size) }]),
      ),
    }))
}
