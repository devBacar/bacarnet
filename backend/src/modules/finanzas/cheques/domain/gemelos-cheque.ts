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
  if (a.id === b.id) return false
  if (a.montoCentavos !== b.montoCentavos || a.fechaPago !== b.fechaPago) return false
  const na = numeroComparable(a.numero)
  const nb = numeroComparable(b.numero)
  if (!na || !nb) return false
  if (na === nb) return true
  const [corto, largo] = na.length <= nb.length ? [na, nb] : [nb, na]
  return corto.length >= 6 && largo.endsWith(corto)
}

/** Agrupa gemelos entre sí. El primero de cada grupo es el de número más corto (el eCheq). */
export function agruparGemelos<T extends ChequeGemeloBase>(cheques: readonly T[]): T[][] {
  const grupos: T[][] = []
  const usados = new Set<string>()
  for (const cheque of cheques) {
    if (usados.has(cheque.id)) continue
    const grupo = [cheque, ...cheques.filter((otro) => !usados.has(otro.id) && sonGemelos(cheque, otro))]
    for (const miembro of grupo) usados.add(miembro.id)
    grupo.sort((x, y) => (numeroComparable(x.numero)?.length ?? 0) - (numeroComparable(y.numero)?.length ?? 0))
    grupos.push(grupo)
  }
  return grupos
}
