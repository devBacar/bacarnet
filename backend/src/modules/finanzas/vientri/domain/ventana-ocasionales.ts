/**
 * Qué cheques ocasionales se guardan en Bacarnet:
 * - los que vencen desde `desde` (ventana de Finanzas), y
 * - los cheques anteriores de una cadena de renovación que sigue abierta: si un cheque de la ventana
 *   sin pagar viene de otro más viejo, ese y sus antecesores se conservan para no perder el seguimiento,
 *   aunque tengan más de un año. Una cadena ya cerrada (el último cheque pagado) no se arrastra.
 */
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'

function indicePorNumero(docs: ChequeOcasionalDoc[]): Map<string, ChequeOcasionalDoc[]> {
  const indice = new Map<string, ChequeOcasionalDoc[]>()
  const agregar = (clave: string, d: ChequeOcasionalDoc) => {
    const lista = indice.get(clave)
    if (lista) lista.push(d)
    else indice.set(clave, [d])
  }
  for (const d of docs) {
    if (!d.numeroCheque) continue
    agregar(d.numeroCheque, d)
    const corto = d.numeroCheque.split('-').pop()
    if (corto && corto !== d.numeroCheque) agregar(corto, d)
  }
  return indice
}

export function filtrarVentanaConCadenas(docs: ChequeOcasionalDoc[], desde: string): ChequeOcasionalDoc[] {
  const enVentana = (d: ChequeOcasionalDoc) => d.fechaVencimiento === null || d.fechaVencimiento >= desde
  const indice = indicePorNumero(docs)
  const conservar = new Set<ChequeOcasionalDoc>(docs.filter(enVentana))

  const pendientes = docs.filter((d) => enVentana(d) && !d.pagado)
  const visitados = new Set<ChequeOcasionalDoc>(pendientes)
  while (pendientes.length > 0) {
    const actual = pendientes.pop()!
    for (const numViejo of actual.renovacionDe) {
      for (const viejo of indice.get(numViejo) ?? []) {
        if (visitados.has(viejo)) continue
        visitados.add(viejo)
        conservar.add(viejo)
        pendientes.push(viejo)
      }
    }
  }
  return docs.filter((d) => conservar.has(d))
}
