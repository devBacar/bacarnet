/**
 * Un cheque de proveedor financiero que se renueva nunca se "paga": se reemplaza por uno nuevo de
 * mayor monto. Vientri no siempre lo marca, así que sin esto queda pendiente para siempre en la
 * Agenda. La única señal confiable de que ya fue reemplazado está en el texto de la observación
 * (OBS), ya resuelto en cadena-renovacion.ts a partir de cheques_propios.csv.
 *
 * Se coteja CUALQUIER cheque pendiente (venga de la tabla CHQOCA sola o ya unido con Chq), no solo
 * los de CHQOCA: si el número aparece como un eslabón ya superado de una cadena, es renovado,
 * sin importar de qué tabla salió. Ante la duda nunca se cierra: si no aparece en ninguna cadena,
 * se deja como está.
 */
import { clasificarCheques, reconstruirCadenas } from './cadena-renovacion.js'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import type { VientriChequeDoc } from './tipos.js'

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
    if (!ESTADOS_PENDIENTES.has(c.estado)) return c
    if (!superados.has(c.numero)) return c
    return { ...c, estado: 'renovado' }
  })
}
