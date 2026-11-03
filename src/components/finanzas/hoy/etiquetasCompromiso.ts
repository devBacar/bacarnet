/**
 * Textos claros de cómo se paga y de dónde vino el compromiso, y un color distinto por origen
 * para que se distingan de un vistazo en una lista larga.
 */
import type { OrigenCompromisoHoy } from '../../../services/finanzasHoyApi'
import type { TonoEstado } from '../estadoDescubierto'

export function etiquetaMedioPago(medio: string): string {
  if (medio === 'cheque') return 'Cheque'
  if (medio === 'efectivo') return 'Efectivo'
  return 'Transferencia'
}

const ETIQUETA_ORIGEN: Record<OrigenCompromisoHoy, string> = {
  manual: 'Cargado a mano',
  vientri: 'Factura de Vientri',
  'vientri-cheque': 'Cheque de Vientri',
  inversiones: 'Inversores',
  planilla: 'Planilla',
}

const TONO_ORIGEN: Record<OrigenCompromisoHoy, TonoEstado> = {
  manual: 'gris',
  vientri: 'azul',
  'vientri-cheque': 'azul',
  inversiones: 'violeta',
  planilla: 'ambar',
}

/**
 * Texto según el dato real de origen (no se adivina por el id). Para un cheque de Vientri a un
 * proveedor financiero (circuito de refinanciación: MANA, LIONEL, etc.) distingue esa etiqueta
 * de un cheque a un proveedor común, porque su seguimiento es distinto (renovaciones).
 */
export function etiquetaOrigenCompromiso(origen: OrigenCompromisoHoy, esProveedorFinanciero?: boolean): string {
  if (origen === 'vientri-cheque' && esProveedorFinanciero) return 'Cheque a proveedor financiero'
  return ETIQUETA_ORIGEN[origen]
}

/** Color de la etiqueta, distinto por origen, para que no se confundan en una lista larga. */
export function tonoOrigenCompromiso(origen: OrigenCompromisoHoy, esProveedorFinanciero?: boolean): TonoEstado {
  if (origen === 'vientri-cheque' && esProveedorFinanciero) return 'cyan'
  return TONO_ORIGEN[origen]
}
