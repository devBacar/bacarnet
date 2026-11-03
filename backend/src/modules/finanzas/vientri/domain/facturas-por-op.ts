/**
 * Índice inverso: para cada OP (orden de pago), qué facturas cancela.
 * Usa aplicaciones.csv (OP → factura cancelada) + comprobantes.csv (label, obs, persona, total).
 */
import type { FilaCsv } from './csv.js'
import { textoComprobante } from './comprobantes.js'
import { refPersona } from './personas.js'
import type { FacturaCancelada, VientriPersonaDoc } from './tipos.js'
import { aBool, aCentavos, aEntero, aTexto } from './valores.js'

export type { FacturaCancelada }

export function facturasPorOp(
  aplicaciones: FilaCsv[],
  comprobantes: FilaCsv[],
  personas: Map<number, VientriPersonaDoc>,
): Map<number, FacturaCancelada[]> {
  const cmpIndex = new Map<number, FilaCsv>()
  for (const f of comprobantes) {
    const id = aEntero(f.vientri_id)
    if (id !== null) cmpIndex.set(id, f)
  }

  const resultado = new Map<number, FacturaCancelada[]>()

  for (const a of aplicaciones) {
    if (aBool(a.baja)) continue
    const idCmp = aEntero(a.id_cmp)
    const idCmpCancelado = aEntero(a.id_cmp_cancelado)
    if (idCmp === null || idCmpCancelado === null) continue

    const filaCmp = cmpIndex.get(idCmpCancelado)
    if (!filaCmp) continue

    const personaId = aEntero(filaCmp.id_persona)
    const ref = refPersona(personas, personaId)

    const factura: FacturaCancelada = {
      comprobante: textoComprobante(filaCmp),
      persona: ref?.nombre ?? null,
      totalCentavos: aCentavos(filaCmp.total) ?? 0,
      obs: aTexto(filaCmp.obs),
    }

    const lista = resultado.get(idCmp) ?? []
    lista.push(factura)
    resultado.set(idCmp, lista)
  }

  return resultado
}
