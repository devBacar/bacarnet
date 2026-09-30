import { formatMoneyCentavos } from '../formatMoney'

/**
 * Datos de "Pagar con cheque".
 * Tiene que coincidir con backend/src/modules/finanzas/hoy/domain/pago-con-cheque.ts.
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

export const TEXTO_CHEQUE_PROXIMAMENTE =
  'Próximamente: lo estamos terminando junto con el módulo de cheques.'

export const TEXTO_CHEQUE_PROPIO =
  'Un cheque nuestro no se puede cargar desde acá. Cargalo en Cheques, con el número, el banco, la fecha de pago y a quién se lo das. El pago queda hecho cuando ese cheque figure debitado.'

export function textoDiferenciaCheque(chequeCentavos: number, pagoCentavos: number): string | null {
  if (chequeCentavos === pagoCentavos) return null
  const diferencia = Math.abs(chequeCentavos - pagoCentavos)
  return `El cheque es de ${formatMoneyCentavos(chequeCentavos, 'ARS')} y el pago de ${formatMoneyCentavos(pagoCentavos, 'ARS')}: queda una diferencia de ${formatMoneyCentavos(diferencia, 'ARS')}.`
}
