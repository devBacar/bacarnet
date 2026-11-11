import { numeroComparable } from '../../contraparte/domain/fuente-cheque.js'

export interface ChequeGemeloBase {
  id: string
  numero: string
  montoCentavos: number
  fechaPago: string
}

/**
 * El físico "financiero" (número largo, ej. 020-923-5000-40074070) y su eCheq (40074070) son el mismo
 * cheque cargado dos veces: mismo importe y vencimiento, y un número es el final del otro.
 */
export function sonGemelos(a: ChequeGemeloBase, b: ChequeGemeloBase): boolean {
  return a.fechaPago === b.fechaPago && mismoNumeroEImporte(a, b)
}

/** Mismo importe y un número es el final del otro (o son iguales), sin mirar fechas. */
export function mismoNumeroEImporte(a: ChequeGemeloBase, b: ChequeGemeloBase): boolean {
  if (a.id === b.id) return false
  if (a.montoCentavos !== b.montoCentavos) return false
  const na = numeroComparable(a.numero)
  const nb = numeroComparable(b.numero)
  if (!na || !nb) return false
  if (na === nb) return true
  const [corto, largo] = na.length <= nb.length ? [na, nb] : [nb, na]
  return corto.length >= 6 && largo.endsWith(corto)
}

/** Prefijo de los ids de cheques ocasionales en la conciliación (igual a `PREFIJO_OCASIONAL`). */
const PREFIJO_OCASIONAL = 'oca:'

/**
 * Regla de "mismo cheque" para conciliar con el banco. Entre cheques de `cheques`, la de siempre (mismo importe,
 * número y fecha de pago). Si uno es un ocasional, sin mirar la fecha: el ocasional se busca por su fecha de
 * conciliado y su copia en `cheques` tiene la de vencimiento, así que nunca coincidirían.
 */
export function mismoChequeParaConciliar(a: ChequeGemeloBase, b: ChequeGemeloBase): boolean {
  if (a.id.startsWith(PREFIJO_OCASIONAL) || b.id.startsWith(PREFIJO_OCASIONAL)) return mismoNumeroEImporte(a, b)
  return sonGemelos(a, b)
}

/**
 * Agrupa gemelos entre sí. El primero de cada grupo es el de número más corto (el eCheq).
 * `iguales` permite otra regla (por ejemplo, para un ocasional cuya fecha es la de conciliado y no la de pago).
 */
export function agruparGemelos<T extends ChequeGemeloBase>(
  cheques: readonly T[],
  iguales: (a: T, b: T) => boolean = sonGemelos,
): T[][] {
  const grupos: T[][] = []
  const usados = new Set<string>()
  for (const cheque of cheques) {
    if (usados.has(cheque.id)) continue
    const grupo = [cheque, ...cheques.filter((otro) => !usados.has(otro.id) && iguales(cheque, otro))]
    for (const miembro of grupo) usados.add(miembro.id)
    grupo.sort((x, y) => (numeroComparable(x.numero)?.length ?? 0) - (numeroComparable(y.numero)?.length ?? 0))
    grupos.push(grupo)
  }
  return grupos
}
