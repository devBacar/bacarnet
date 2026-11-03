/**
 * Cuando el banco compensa varios cheques juntos en una sola línea del extracto (un "lote"),
 * busca qué combinación de cheques pendientes suma exacto ese monto. Es plata real: ante
 * cualquier duda (ninguna combinación, o más de una posible) no elige nada solo.
 */
import type { ChequeParaContraparte } from '../../contraparte/domain/fuente-cheque.js'

export interface ResultadoCombinacion {
  /** La combinación encontrada, o null si no hay ninguna o hay más de una (ambigua). */
  combinacion: ChequeParaContraparte[] | null
  /** true si hay dos o más combinaciones distintas que suman el mismo monto: no se elige ninguna. */
  ambigua: boolean
  /** true si había demasiados candidatos para buscar con seguridad: no se intentó. */
  demasiadosCandidatos: boolean
}

const MAX_CHEQUES_DEFAULT = 15

export function buscarCombinacionDeCheques(
  montoCentavos: number,
  candidatos: ChequeParaContraparte[],
  opciones?: { maxCheques?: number },
): ResultadoCombinacion {
  const sinResultado: ResultadoCombinacion = { combinacion: null, ambigua: false, demasiadosCandidatos: false }
  if (montoCentavos <= 0 || candidatos.length === 0) return sinResultado

  const maxCheques = opciones?.maxCheques ?? MAX_CHEQUES_DEFAULT
  if (candidatos.length > maxCheques) return { ...sinResultado, demasiadosCandidatos: true }

  const ordenados = [...candidatos].sort((a, b) => b.montoCentavos - a.montoCentavos)
  const encontradas: ChequeParaContraparte[][] = []

  function backtrack(indice: number, actual: ChequeParaContraparte[], suma: number): void {
    if (encontradas.length >= 2) return // ya es ambigua, no hace falta seguir buscando
    if (suma === montoCentavos && actual.length > 0) {
      encontradas.push([...actual])
      return
    }
    if (suma > montoCentavos || indice >= ordenados.length) return

    actual.push(ordenados[indice]!)
    backtrack(indice + 1, actual, suma + ordenados[indice]!.montoCentavos)
    actual.pop()

    backtrack(indice + 1, actual, suma)
  }

  backtrack(0, [], 0)

  if (encontradas.length === 0) return sinResultado
  if (encontradas.length >= 2) return { combinacion: null, ambigua: true, demasiadosCandidatos: false }
  return { combinacion: encontradas[0]!, ambigua: false, demasiadosCandidatos: false }
}
