/**
 * Cuenta corriente por cliente: agrupa los comprobantes "a cobrar" (ya netos de NC/RC
 * imputadas, por `pendienteCentavos`) por persona, para ver saldo a favor y deuda real.
 * Mismo criterio que la pantalla "17 - Cuenta Corriente Cliente" de Vientri.
 */
import type { VientriPendienteDoc } from './tipos.js'

export interface ComprobanteSaldoCliente {
  clave: string
  comprobante: string
  fecha: string | null
  fechaVencimiento: string | null
  totalCentavos: number
  pendienteCentavos: number
}

export interface SaldoCliente {
  personaId: number
  nombre: string
  cuit: string | null
  /** Suma de pendientes positivos (deuda real, ya neta de imputaciones). */
  deudaCentavos: number
  /** Suma de pendientes negativos, en positivo (crédito sin aplicar a favor del cliente). */
  favorCentavos: number
  /** deuda - favor: lo que neto le queda debiendo (negativo = BacarNet le debe a él). */
  saldoCentavos: number
  comprobantes: ComprobanteSaldoCliente[]
}

export function armarSaldosCliente(pendientesCobrar: VientriPendienteDoc[]): SaldoCliente[] {
  const porPersona = new Map<number, SaldoCliente>()
  for (const p of pendientesCobrar) {
    if (p.lado !== 'cobrar') continue
    const id = p.persona?.vientriId
    if (id === undefined || id === null) continue
    let s = porPersona.get(id)
    if (!s) {
      s = {
        personaId: id,
        nombre: p.persona?.nombre?.trim() || 'Sin nombre en Vientri',
        cuit: p.persona?.cuit ?? null,
        deudaCentavos: 0,
        favorCentavos: 0,
        saldoCentavos: 0,
        comprobantes: [],
      }
      porPersona.set(id, s)
    }
    if (p.pendienteCentavos > 0) s.deudaCentavos += p.pendienteCentavos
    else if (p.pendienteCentavos < 0) s.favorCentavos += -p.pendienteCentavos
    s.saldoCentavos += p.pendienteCentavos
    s.comprobantes.push({
      clave: p.clave,
      comprobante: p.comprobante,
      fecha: p.fecha,
      fechaVencimiento: p.fechaVencimiento,
      totalCentavos: p.totalCentavos,
      pendienteCentavos: p.pendienteCentavos,
    })
  }
  return [...porPersona.values()].sort((a, b) => b.saldoCentavos - a.saldoCentavos)
}
