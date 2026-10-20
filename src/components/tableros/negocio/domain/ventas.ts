import { suma } from './formato'
import { VENTAS_DESDE, type ModeloNegocio } from './modelo'
import type { ClienteNegocio } from './tipos'

export type EstadoCliente = '' | 'nuevo' | 'perdido' | 'atrasado'

export interface FilaCliente {
  c: ClienteNegocio
  a: number
  b: number | null
  ra: number
  rb: number | null
  ta: number
  ca: number
  pServ: number | null
  brecha: number
  estado: EstadoCliente
}

export type FiltroCliente = 'todos' | 'publico' | 'privado' | 'atrasado' | 'perdido' | 'nuevo'

/** Una fila por cliente con lo facturado/cobrado del período y la comparación contra el año anterior. */
export function filasClientes(modelo: ModeloNegocio, ms: string[], hayB: boolean, mb: string[]): FilaCliente[] {
  const { CL, INF, sv } = modelo
  return CL.map((c): FilaCliente => {
    const a = sv(c.f, ms)
    const b = hayB ? sv(c.f, mb) : null
    const ra = sv(c.r, ms)
    const rb = hayB ? sv(c.r, mb) : null
    const ta = sv(c.t, ms)
    const ca = sv(c.c, ms)
    const pServ = ra > 30 && rb != null && rb > 30 && b != null && b > 0 ? a / ra / (b / rb) - 1 : null
    const brecha =
      hayB && b != null && b > 10e6 && a > 0 ? Math.max(0, b * (1 + INF) * (ra > 30 && rb != null && rb > 30 ? ra / rb : 1) - a) : 0
    const estado: EstadoCliente = !hayB
      ? ''
      : b != null && b < 1e6 && a > 0
        ? 'nuevo'
        : b != null && b > 20e6 && a < b * 0.2
          ? 'perdido'
          : brecha > 0.05 * Math.max(a, 1)
            ? 'atrasado'
            : ''
    return { c, a, b, ra, rb, ta, ca, pServ, brecha, estado }
  }).filter((x) => x.a || x.b || x.ca)
}

export function ventasDelPeriodo(modelo: ModeloNegocio, ms: string[]) {
  const { CL, MESES, D, sv, mesesBase } = modelo
  const mb = mesesBase(ms).filter((m) => m >= VENTAS_DESDE)
  const hayB = mb.length === ms.length
  const xs = MESES.filter((m) => m >= VENTAS_DESDE)
  const totF = (m: string): number => suma(CL, (c) => c.f[m] || 0)
  const totT = (m: string): number => suma(CL, (c) => c.t[m] || 0)
  const fN = suma(ms, totF)
  const fT = suma(ms, totT)
  const cob = suma(ms, (m) => D.cobTot[m] || 0)
  const fNb = hayB ? suma(mb, totF) : null
  const rem = suma(CL, (c) => sv(c.r, ms))
  const remb = hayB ? suma(CL, (c) => sv(c.r, mb)) : null
  const filas0 = filasClientes(modelo, ms, hayB, mb)
  const top1 = filas0.slice().sort((a, b) => b.a - a.a)[0]
  return { mb, hayB, xs, totF, totT, fN, fT, cob, fNb, rem, remb, filas0, top1 }
}
