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

/** Texto según el dato real de origen (no se adivina por el id). */
export function etiquetaOrigenCompromiso(origen: OrigenCompromisoHoy): string {
  return ETIQUETA_ORIGEN[origen]
}

/** Color de la etiqueta, distinto por origen, para que no se confundan en una lista larga. */
export function tonoOrigenCompromiso(origen: OrigenCompromisoHoy): TonoEstado {
  return TONO_ORIGEN[origen]
}

/**
 * Aproximación por el id, para pantallas que todavía no traen el origen real (ej. "Compromisos de
 * la semana", que sale de otro endpoint). Usar `etiquetaOrigenCompromiso` cuando se pueda.
 */
export function etiquetaOrigenPorId(id: string): string {
  if (id.startsWith('vientri-cheque-')) return ETIQUETA_ORIGEN['vientri-cheque']
  if (id.startsWith('vientri-')) return ETIQUETA_ORIGEN.vientri
  if (id.startsWith('inv-')) return ETIQUETA_ORIGEN.inversiones
  return ETIQUETA_ORIGEN.manual
}
