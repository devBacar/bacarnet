import type { ChequeVentana, TableroFinanzas } from './calcular.js'

/** Por debajo del límite de 1 MB de un documento de Firestore. */
export const TOPE_CACHE_TABLERO_BYTES = 700_000

export type ParteCache =
  | { modo: 'entero'; payload: TableroFinanzas }
  | { modo: 'cheques-aparte'; payload: TableroFinanzas; cheques: ChequeVentana[] }
  | { modo: 'no-cachear' }

function bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

/**
 * Si el tablero entra, se guarda entero.
 * Si no entra, los cheques van en otro documento.
 * Si ni así entra, no se cachea: la respuesta igual se devuelve completa.
 */
export function partirPayloadCache(payload: TableroFinanzas, tope = TOPE_CACHE_TABLERO_BYTES): ParteCache {
  if (bytes(payload) <= tope) return { modo: 'entero', payload }
  const cheques = payload.proximos30.cheques
  const liviano: TableroFinanzas = {
    ...payload,
    proximos30: { ...payload.proximos30, cheques: [] },
  }
  if (bytes(liviano) <= tope && bytes(cheques) <= tope) {
    return { modo: 'cheques-aparte', payload: liviano, cheques }
  }
  return { modo: 'no-cachear' }
}
