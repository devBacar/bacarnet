/**
 * Textos claros de cómo se paga y de dónde vino el compromiso.
 * El origen se infiere del id del documento (convención del sync con Vientri).
 */

export function etiquetaMedioPago(medio: string): string {
  if (medio === 'cheque') return 'Cheque'
  if (medio === 'efectivo') return 'Efectivo'
  return 'Transferencia'
}

/** Manual / factura Vientri / cheque Vientri, según el id del compromiso. */
export function etiquetaOrigenCompromiso(id: string): string {
  if (id.startsWith('vientri-cheque-')) return 'Cheque de Vientri'
  if (id.startsWith('vientri-')) return 'Factura de Vientri'
  return 'Cargado a mano'
}
