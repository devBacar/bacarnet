/**
 * Pago con cheque desde Hoy.
 * Tiene que coincidir con src/components/finanzas/hoy/pagoConCheque.ts.
 * `cartera`: se endosa un cheque recibido y el compromiso queda pagado.
 * `propio`: el alta del cheque emitido se hace en Cheques; acá no hay formulario.
 */
export interface PagoConCheque {
  modo: 'cartera' | 'propio'
  chequeId: string | null
  numero: string
  banco: string
  /** Día en que se debita el cheque, YYYY-MM-DD. */
  fechaPago: string
  destinatario: string
}
