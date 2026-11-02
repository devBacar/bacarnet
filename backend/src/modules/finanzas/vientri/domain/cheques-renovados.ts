/**
 * Un cheque de proveedor financiero (CHQOCA) que se renueva nunca se "paga": se reemplaza por uno
 * nuevo de mayor monto. Vientri no lo marca pagado, así que sin esto queda pendiente para siempre
 * en la Agenda. La única señal confiable de que ya fue reemplazado está en el texto de la
 * observación (OBS), ya resuelto en cadena-renovacion.ts a partir de cheques_propios.csv.
 *
 * Ante la duda nunca se cierra: si el cheque no aparece en ninguna cadena, se deja como está.
 */
import { clasificarCheques, reconstruirCadenas } from './cadena-renovacion.js'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import type { VientriChequeDoc } from './tipos.js'

/** Prefijo de clave de los cheques que solo están en CHQOCA (no se unieron con la tabla Chq). */
const PREFIJO_SOLO_CHQOCA = 'oca-'

/** Estados que, de estar realmente renovado, no deberían seguir contando como pendientes. */
const ESTADOS_PENDIENTES = new Set(['en_cartera', 'pendiente_debito'])

export function marcarRenovadosPorCadena(
  cheques: VientriChequeDoc[],
  ocasionales: ChequeOcasionalDoc[],
): VientriChequeDoc[] {
  const cadenas = reconstruirCadenas(ocasionales)
  const clasificados = clasificarCheques(ocasionales, cadenas)
  const superados = new Set(
    clasificados
      .filter((c) => c.rolEnCadena === 'capital' || c.rolEnCadena === 'mixto')
      .map((c) => c.numeroCheque),
  )
  if (superados.size === 0) return cheques

  return cheques.map((c) => {
    if (!c.clave.startsWith(PREFIJO_SOLO_CHQOCA)) return c
    if (!ESTADOS_PENDIENTES.has(c.estado)) return c
    if (!superados.has(c.numero)) return c
    return { ...c, estado: 'renovado' }
  })
}
