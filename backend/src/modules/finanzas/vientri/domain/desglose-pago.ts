/**
 * Con qué se pagó/cobró realmente cada factura y cuándo vence esa plata de verdad.
 * Una factura se cancela con una "orden de pago" (CMP distinto) que puede combinar varios medios
 * (PGODET/medios_pago.csv): cheques (con su propio vencimiento), transferencias/otro medio (vencen el
 * día de la orden) y retenciones (no son plata que sale, se excluyen). Si la orden cubre varias
 * facturas a la vez, cada medio se prorratea según cuánto de esa orden se aplicó a cada factura.
 */
import type { FilaCsv } from './csv.js'
import { aBool, aCentavos, aEntero, aFecha, aTexto } from './valores.js'

export const COLUMNAS_MEDIOS_PAGO = ['vientri_id', 'id_cmp', 'id_medio', 'importe', 'id_cheque'] as const

/** Código de imputación (IDCODIMP) de las retenciones: no es una salida/entrada real de caja. */
const CODIGOS_RETENCION = new Set([25])

export type MedioPagoReal = 'cheque_fisico' | 'echeq' | 'otro_medio'

export interface LegDesglosePago {
  medio: MedioPagoReal
  /** AAAA-MM-DD en que esa plata realmente sale/entra. Cheque: su vencimiento. Otro medio: el día de la orden. */
  fechaVencimiento: string | null
  montoCentavos: number
  chequeNumero: string | null
}

export interface DesglosePago {
  comprobanteId: number
  legs: LegDesglosePago[]
}

export function armarDesglosesPago(
  comprobantes: FilaCsv[],
  aplicaciones: FilaCsv[],
  mediosPago: FilaCsv[],
  chequesCrudos: FilaCsv[],
): Map<number, DesglosePago> {
  const fechaComprobante = new Map<number, string | null>()
  for (const f of comprobantes) {
    const id = aEntero(f.vientri_id)
    if (id !== null) fechaComprobante.set(id, aFecha(f.fecha))
  }

  const cheques = new Map<number, { fechaVencimiento: string | null; echeq: boolean; numero: string | null }>()
  for (const f of chequesCrudos) {
    const id = aEntero(f.vientri_id)
    if (id === null) continue
    cheques.set(id, { fechaVencimiento: aFecha(f.fecha_vto), echeq: aBool(f.echeq), numero: aTexto(f.numero) })
  }

  type Medio = { idMedio: number | null; montoCentavos: number; idCheque: number | null }
  const mediosPorOrden = new Map<number, Medio[]>()
  for (const f of mediosPago) {
    const idCmp = aEntero(f.id_cmp)
    if (idCmp === null) continue
    const monto = aCentavos(f.importe) ?? 0
    const lista = mediosPorOrden.get(idCmp) ?? []
    lista.push({ idMedio: aEntero(f.id_medio), montoCentavos: monto, idCheque: aEntero(f.id_cheque) })
    mediosPorOrden.set(idCmp, lista)
  }

  function legsDeOrden(idCmp: number): LegDesglosePago[] {
    const medios = mediosPorOrden.get(idCmp) ?? []
    const legs: LegDesglosePago[] = []
    for (const m of medios) {
      if (m.idMedio !== null && CODIGOS_RETENCION.has(m.idMedio)) continue
      if (m.montoCentavos === 0) continue
      if (m.idCheque) {
        const chq = cheques.get(m.idCheque)
        legs.push({
          medio: chq?.echeq ? 'echeq' : 'cheque_fisico',
          fechaVencimiento: chq?.fechaVencimiento ?? null,
          montoCentavos: m.montoCentavos,
          chequeNumero: chq?.numero ?? null,
        })
      } else {
        legs.push({
          medio: 'otro_medio',
          fechaVencimiento: fechaComprobante.get(idCmp) ?? null,
          montoCentavos: m.montoCentavos,
          chequeNumero: null,
        })
      }
    }
    return legs
  }

  const totalPorOrden = new Map<number, number>()
  for (const [idCmp, medios] of mediosPorOrden) {
    totalPorOrden.set(idCmp, medios.reduce((s, m) => s + m.montoCentavos, 0))
  }

  const aplicacionesPorFactura = new Map<number, Array<{ idCmp: number; importeCentavos: number }>>()
  for (const f of aplicaciones) {
    if (aBool(f.baja)) continue
    const idCmp = aEntero(f.id_cmp)
    const facturaId = aEntero(f.id_cmp_cancelado)
    const importe = Math.abs(aCentavos(f.importe) ?? 0)
    if (idCmp === null || facturaId === null || importe === 0) continue
    const lista = aplicacionesPorFactura.get(facturaId) ?? []
    lista.push({ idCmp, importeCentavos: importe })
    aplicacionesPorFactura.set(facturaId, lista)
  }

  const resultado = new Map<number, DesglosePago>()
  for (const [facturaId, aplicacionesFactura] of aplicacionesPorFactura) {
    const legs: LegDesglosePago[] = []
    for (const ap of aplicacionesFactura) {
      const totalOrden = totalPorOrden.get(ap.idCmp) ?? 0
      const legsOrden = legsDeOrden(ap.idCmp)
      if (totalOrden <= 0 || legsOrden.length === 0) continue
      const fraccion = ap.importeCentavos / totalOrden
      for (const leg of legsOrden) {
        const monto = Math.round(leg.montoCentavos * fraccion)
        if (monto !== 0) legs.push({ ...leg, montoCentavos: monto })
      }
    }
    if (legs.length > 0) resultado.set(facturaId, { comprobanteId: facturaId, legs })
  }
  return resultado
}
