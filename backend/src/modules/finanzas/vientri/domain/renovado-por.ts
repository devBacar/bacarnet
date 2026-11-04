import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'

/**
 * Link inverso de las renovaciones: para cada cheque, los números de los cheques nuevos que lo renuevan.
 * Devuelve una lista alineada con `docs` (misma posición), ordenada para que el resultado no dependa del
 * orden de los docs. Un cheque dado de baja no cuenta como renovación de otro.
 */
export function calcularRenovadoPor(docs: ChequeOcasionalDoc[]): string[][] {
  const indicePorNumero = new Map<string, number>()
  docs.forEach((d, i) => {
    if (!d.numeroCheque) return
    indicePorNumero.set(d.numeroCheque, i)
    const corto = d.numeroCheque.split('-').pop()
    if (corto && corto !== d.numeroCheque) indicePorNumero.set(corto, i)
  })

  const resultado: string[][] = docs.map(() => [])
  for (const nuevo of docs) {
    if (nuevo.baja) continue
    for (const numViejo of nuevo.renovacionDe) {
      const i = indicePorNumero.get(numViejo)
      if (i === undefined) continue
      if (!resultado[i]!.includes(nuevo.numeroCheque)) resultado[i]!.push(nuevo.numeroCheque)
    }
  }
  for (const lista of resultado) lista.sort()
  return resultado
}
