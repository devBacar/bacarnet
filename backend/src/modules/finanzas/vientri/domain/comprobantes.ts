/**
 * Comprobantes abiertos de Vientri → pendientes de pago (proveedores) y de cobro (clientes).
 * Todavía no hay catálogo de tipos (IDTCMP): el lado se decide por si la persona es proveedor o cliente.
 * Si es las dos cosas o ninguna, queda "revisar" hasta cerrar el catálogo de tipos.
 */
import type { FilaCsv } from './csv.js'
import { refPersona } from './personas.js'
import type { LadoPendiente, VientriPendienteDoc, VientriPersonaDoc } from './tipos.js'
import { aBool, aCentavos, aEntero, aFecha, aTexto, fechaImposible } from './valores.js'

export const COLUMNAS_COMPROBANTES = [
  'vientri_id', 'id_tipo', 'nom_tipo', 'id_persona', 'fecha', 'fecha_vto', 'total', 'importe_pendiente', 'abierto', 'baja',
] as const

export function textoComprobante(f: FilaCsv): string {
  const tipo = (f.nom_tipo ?? '').trim()
  const letra = (f.letra ?? '').trim()
  const pv = aEntero(f.punto_venta)
  const nro = aEntero(f.numero)
  const numero = pv !== null && nro !== null ? `${String(pv).padStart(4, '0')}-${String(nro).padStart(8, '0')}` : (f.numero ?? '').trim()
  return [tipo, letra, numero].filter(Boolean).join(' ')
}

export function ladoPendiente(persona: VientriPersonaDoc | undefined): LadoPendiente {
  if (!persona) return 'revisar'
  if (persona.esProveedor && !persona.esCliente) return 'pagar'
  if (persona.esCliente && !persona.esProveedor) return 'cobrar'
  return 'revisar'
}

export function armarPendientes(
  filas: FilaCsv[],
  personas: Map<number, VientriPersonaDoc>,
  monedas: Map<number, string>,
): VientriPendienteDoc[] {
  const salida: VientriPendienteDoc[] = []
  for (const f of filas) {
    if (aBool(f.baja) || !aBool(f.abierto)) continue
    const pendiente = aCentavos(f.importe_pendiente) ?? 0
    if (pendiente === 0) continue
    const id = aEntero(f.vientri_id)
    if (id === null) continue
    const personaId = aEntero(f.id_persona)
    const persona = personaId !== null ? personas.get(personaId) : undefined
    const fechaVencimiento = aFecha(f.fecha_vto)
    const revisar: string[] = []
    const lado = ladoPendiente(persona)
    if (lado === 'revisar') revisar.push('No se sabe si es a pagar o a cobrar (falta el catálogo de tipos)')
    if (fechaImposible(fechaVencimiento)) revisar.push(`Fecha de vencimiento imposible (${fechaVencimiento})`)
    const divisaId = aEntero(f.id_divisa)
    const cot = Number((f.cotizacion ?? '').trim())
    salida.push({
      clave: `cmp-${id}`,
      vientriId: id,
      lado,
      tipoId: aEntero(f.id_tipo),
      tipo: aTexto(f.nom_tipo),
      comprobante: textoComprobante(f),
      persona: refPersona(personas, personaId),
      fecha: aFecha(f.fecha),
      fechaVencimiento,
      totalCentavos: aCentavos(f.total) ?? 0,
      pendienteCentavos: pendiente,
      divisaId,
      moneda: divisaId !== null ? monedas.get(divisaId) ?? null : null,
      cotizacion: Number.isFinite(cot) && cot > 0 ? cot : null,
      fechaProntoPago: aFecha(f.fecha_pronto_pago),
      descuentoProntoPago: aCentavos(f.dto_pronto_pago) !== null ? (aCentavos(f.dto_pronto_pago) as number) / 100 : null,
      cuotas: aEntero(f.cuotas),
      prestamo: aEntero(f.id_linea_prestamo) !== null && aEntero(f.id_linea_prestamo) !== 0,
      revisar,
      fecsys: aTexto(f.fecsys),
    })
  }
  return salida
}
