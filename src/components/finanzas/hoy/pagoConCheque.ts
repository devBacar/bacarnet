/**
 * Datos que va a pedir "Pagar con cheque" cuando exista el módulo.
 * Tiene que coincidir con backend/src/modules/finanzas/hoy/domain/pago-con-cheque.ts.
 */
export interface PagoConCheque {
  chequeId: string
  numero: string
  banco: string
  /** Día en que se debita el cheque, YYYY-MM-DD. */
  fechaPago: string
}

export const TEXTO_CHEQUE_PROXIMAMENTE =
  'Próximamente: lo estamos terminando junto con el módulo de cheques.'
