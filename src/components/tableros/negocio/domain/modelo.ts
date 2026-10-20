import { difMeses, menos12, mesCorto, mesLargo, suma } from './formato'
import type { DatosTableroNegocio, FilaCosto, FilaProveedor, MontosPorMes, Periodo, PrecioMes } from './tipos'

export const LIN: Record<string, string> = {
  cau: 'Transporte de caudales y recaudación',
  seg: 'Seguridad privada',
  tes: 'Tesorería tercerizada',
  gru: 'Grúas',
}
export const LKEYS = Object.keys(LIN)

/** Último mes con sueldos cargados en Vientri; desde junio 2026 los sueldos vienen de RRHH (clave opcional `rrhh`). */
export const ULT_SUE_VIENTRI = '2026-05'
/** Septiembre todavía se está cargando (ingresos brutos, etc.). */
export const ULT_GASTO = '2026-08'
/** Los comprobantes de venta arrancan en enero 2025. */
export const VENTAS_DESDE = '2025-01'

export interface LineaNegocio {
  l: string
  nombre: string
  ing: number
  sue: number
  otr: number
  dir: number
  contrib: number
  asign: number
  res: number
  cob: number | null
  rows: FilaCosto[]
}

export interface ResultadoNegocios {
  lineas: LineaNegocio[]
  estTot: number
  est: FilaCosto[]
  ingTot: number
  otrosIng: number
}

export interface SerieTarifa {
  c: number
  a: string
  base: string
  fin: string
  pb: number
  pf: number
  n: number
  varN: number
  real: number
  ult: string | null
  sinAum: number
  fact: number
  sp: number[]
}

export const agrupar = <T extends { imp: number }>(rows: T[], key: keyof T | ((r: T) => string)): Record<string, number> => {
  const o: Record<string, number> = {}
  for (const r of rows) {
    const k = typeof key === 'function' ? key(r) : String(r[key])
    o[k] = (o[k] || 0) + r.imp
  }
  return o
}
export const ordenar = (o: Record<string, number>): Array<[string, number]> => Object.entries(o).sort((a, b) => b[1] - a[1])

/** Toda la lógica del tablero sobre un juego de datos. Funciones puras: no tocan nada fuera de `D`. */
export function crearModelo(D: DatosTableroNegocio) {
  const MESES = D.meses
  const INF = D.inflacion
  const CU = D.cuentas
  const CCS = D.ccs
  const CATS = D.cats
  const PROVS = D.provs
  const CL = D.clientes
  const RRHH = D.rrhh ?? null

  /* ---------- Períodos ---------- */
  const PERIODOS: Periodo[] = [
    ['e26', 'Ene–sep 2026 (contra ene–sep 2025)', MESES.filter((m) => m >= '2026-01' && m <= '2026-09')],
    ['u12', 'Últimos 12 meses (oct 25–sep 26)', MESES.filter((m) => m >= '2025-10' && m <= '2026-09')],
    ['t3', 'Último trimestre (jul–sep 26)', MESES.filter((m) => m >= '2026-07' && m <= '2026-09')],
    ['a25', 'Año 2025', MESES.filter((m) => m >= '2025-01' && m <= '2025-12')],
    ...MESES.filter((m) => m >= '2025-01')
      .slice()
      .reverse()
      .map((m): Periodo => [`m${m}`, mesLargo(m), [m]]),
  ]
  const mesesDe = (id: string): string[] => (PERIODOS.find((p) => p[0] === id) ?? PERIODOS[0])[2]
  /** Los mismos meses del año anterior que existan en los datos. */
  const mesesBase = (ms: string[]): string[] => ms.map(menos12).filter((m) => MESES.includes(m))

  /* ---------- Ventas por línea (contabilidad) ---------- */
  const ingLin = (l: string, ms: string[]): number => suma(ms, (m) => D.lineasIng[l]?.[m] || 0)

  /* ---------- Costos (contabilidad + RRHH para los sueldos que faltan) ---------- */
  const faltaSueldo = (m: string): boolean => m > ULT_SUE_VIENTRI && !(RRHH && RRHH.meses[m])
  const sueRRHH = (m: string): boolean => m > ULT_SUE_VIENTRI && Boolean(RRHH && RRHH.meses[m])

  function costosDe(ms: string[], filtro: (r: FilaCosto) => boolean = () => true): FilaCosto[] {
    const out: FilaCosto[] = []
    for (const r of D.costos) {
      const m = MESES[r[0]]
      if (!ms.includes(m)) continue
      if (r[2] === 'sue' && sueRRHH(m)) continue
      const row: FilaCosto = { m, lin: r[1], cla: r[2], cat: CATS[r[3]], cuenta: CU[r[4]], cc: CCS[r[5]], imp: r[6] }
      if (filtro(row)) out.push(row)
    }
    for (const m of ms) {
      if (!sueRRHH(m) || !RRHH) continue
      for (const [lin, v] of Object.entries(RRHH.meses[m])) {
        const row: FilaCosto = {
          m,
          lin,
          cla: 'sue',
          cat: 'Sueldos y cargas',
          cuenta: 'COSTO LABORAL (TABLERO DE RRHH)',
          cc: RRHH.nombres?.[lin] || lin,
          imp: v,
        }
        if (filtro(row)) out.push(row)
      }
    }
    return out
  }
  const sinSueldos = (ms: string[]): string[] => ms.filter(faltaSueldo)
  const completos = (ms: string[]): string[] => ms.filter((m) => !faltaSueldo(m))

  /** Texto del aviso de "meses completos" (null si no falta ningún sueldo). */
  function textoAvisoCompletos(ms: string[]): string | null {
    const f = sinSueldos(ms)
    if (!f.length) return null
    const c = completos(ms)
    const cabeza = c.length
      ? `Resultado y negocios se calculan solo con los meses completos (${mesCorto(c[0])} a ${mesCorto(c[c.length - 1])})`
      : 'Este período no tiene ningún mes con sueldos cargados, así que no se puede calcular el resultado'
    return `${cabeza}: Vientri dejó de cargar sueldos en junio de 2026 y faltan los costos del Tablero de RRHH de ${f.map(mesCorto).join(', ')}.`
  }
  function textoAvisoSueldos(ms: string[]): string | null {
    const f = sinSueldos(ms)
    return f.length
      ? `Faltan los sueldos de ${f.map(mesCorto).join(', ')}: Vientri los dejó de cargar en junio de 2026. Cuando se carguen los costos del Tablero de RRHH de esos meses, se completan. Mientras tanto, el gasto y el resultado de esos meses están incompletos.`
      : null
  }

  /* ---------- Clientes ---------- */
  const sv = (o: MontosPorMes | undefined, ms: string[]): number => suma(ms, (m) => o?.[m] || 0)

  /* ---------- Proveedores ---------- */
  function provDe(ms: string[], filtro: (r: FilaProveedor) => boolean = () => true): FilaProveedor[] {
    const o: FilaProveedor[] = []
    for (const r of D.prov) {
      const m = MESES[r[0]]
      if (!ms.includes(m)) continue
      const row: FilaProveedor = { m, prov: PROVS[r[1]], cuenta: CU[r[2]], imp: r[3] }
      if (filtro(row)) o.push(row)
    }
    return o
  }
  let provMesCache: Record<string, MontosPorMes> | null = null
  const provMes = (): Record<string, MontosPorMes> => {
    if (provMesCache) return provMesCache
    const pm: Record<string, MontosPorMes> = {}
    for (const r of D.prov) {
      const n = PROVS[r[1]]
      const m = MESES[r[0]]
      pm[n] ||= {}
      pm[n][m] = (pm[n][m] || 0) + r[3]
    }
    provMesCache = pm
    return pm
  }

  /* ---------- Negocios (para un período) ---------- */
  function negocios(ms: string[]): ResultadoNegocios {
    const rows = costosDe(ms)
    const est = rows.filter((r) => r.lin === 'est')
    const estTot = suma(est, (r) => r.imp)
    const ing = Object.fromEntries(LKEYS.map((l) => [l, ingLin(l, ms)])) as Record<string, number>
    const ingTot = suma(LKEYS, (l) => ing[l])
    const lineas = LKEYS.map((l): LineaNegocio => {
      const rl = rows.filter((r) => r.lin === l)
      const sue = suma(rl.filter((r) => r.cla === 'sue'), (r) => r.imp)
      const otr = suma(rl.filter((r) => r.cla !== 'sue'), (r) => r.imp)
      const asign = ingTot ? (estTot * ing[l]) / ingTot : 0
      const cob = D.cobLin ? suma(ms, (m) => D.cobLin?.[l]?.[m] || 0) : null
      return { l, nombre: LIN[l], ing: ing[l], sue, otr, dir: sue + otr, contrib: ing[l] - sue - otr, asign, res: ing[l] - sue - otr - asign, cob, rows: rl }
    })
    return { lineas, estTot, est, ingTot, otrosIng: ingLin('otr', ms) }
  }

  /* ---------- Tarifas ---------- */
  const infN = (n: number): number => Math.pow(1 + INF, n / 12) - 1

  function serieTarifa(c: number, a: string, p: Record<string, PrecioMes>, ms: string[]): SerieTarifa | null {
    const xs = Object.keys(p).sort()
    const hasta = xs.filter((m) => m <= ms[ms.length - 1])
    if (!hasta.length) return null
    const fin = hasta[hasta.length - 1]
    if (fin < ms[0]) return null // sin precio en el período
    const precio = (m: string): number => {
      const v = p[m]
      return Array.isArray(v) ? v[2] : v
    }
    const peso = (m: string): number => {
      const v = p[m]
      return Array.isArray(v) ? v[1] : v
    }
    const objetivo = menos12(fin)
    const base = xs.filter((m) => m <= objetivo).pop() || xs[0]
    if (base === fin) return null
    const pf = precio(fin)
    const pb = precio(base)
    const n = difMeses(base, fin)
    // último aumento: el mes más reciente en que el precio subió más de 1%
    let ult: string | null = null
    for (let i = hasta.length - 1; i > 0; i--) {
      if (precio(hasta[i]) > precio(hasta[i - 1]) * 1.01) {
        ult = hasta[i]
        break
      }
    }
    const sinAum = difMeses(ult || hasta[0], fin)
    const varN = pf / pb - 1
    const real = (1 + varN) / (1 + infN(n)) - 1
    const fact = suma(ms, (m) => (p[m] ? peso(m) : 0))
    return { c, a, base, fin, pb, pf, n, varN, real, ult, sinAum, fact, sp: xs.filter((m) => m >= VENTAS_DESDE).map(precio) }
  }

  return {
    D,
    MESES,
    INF,
    CL,
    RRHH,
    PERIODOS,
    mesesDe,
    mesesBase,
    ingLin,
    faltaSueldo,
    costosDe,
    sinSueldos,
    completos,
    textoAvisoCompletos,
    textoAvisoSueldos,
    sv,
    provDe,
    provMes,
    negocios,
    infN,
    serieTarifa,
  }
}

export type ModeloNegocio = ReturnType<typeof crearModelo>
