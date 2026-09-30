/**
 * Datos que va a pedir "Pagar con cheque" cuando exista el módulo de cheques.
 * Hoy el botón se muestra y queda deshabilitado.
 */
export interface PagoConCheque {
  chequeId: string
  numero: string
  banco: string
  /** Día en que se debita el cheque, YYYY-MM-DD. */
  fechaPago: string
}
