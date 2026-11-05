import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'

export interface ResultadoResolverIds {
  docs: ChequeOcasionalDoc[]
  /** Números de cheque que no se pudieron ubicar (o son ambiguos): no se importan. */
  sinIdDeVientri: string[]
}

function numeroCorto(numeroCheque: string): string {
  return numeroCheque.split('-').pop() ?? numeroCheque
}

/**
 * El CHQOCA.csv sin encabezado no trae el id de Vientri (`vientri_id`): solo el número del cheque. Si se usara
 * ese número como id, el cheque quedaría guardado dos veces (el doc `oca-<vientri_id>` de la importación normal
 * y otro con el número). Por eso acá el id se toma del cheque que ya está guardado con ese número.
 *
 * - Un cheque que ya está guardado (una sola vez, con su id real) reutiliza su `vientriId`.
 * - Como este CSV tampoco trae estado, fecha de conciliación ni baja, esos campos se conservan del guardado.
 * - Uno que no está guardado, o que está más de una vez, se descarta y se informa: se carga con la importación
 *   normal (`cheques_propios.csv`), que sí trae el id.
 * - Los docs viejos que usaron el número como id (`vientriId` igual al número) no sirven de referencia.
 */
export function resolverIdsSinEncabezado(
  docs: ChequeOcasionalDoc[],
  base: ChequeOcasionalDoc[],
): ResultadoResolverIds {
  const porNumero = new Map<string, ChequeOcasionalDoc[]>()
  for (const b of base) {
    if (String(b.vientriId) === numeroCorto(b.numeroCheque)) continue
    const lista = porNumero.get(b.numeroCheque)
    if (lista) lista.push(b)
    else porNumero.set(b.numeroCheque, [b])
  }

  const resueltos: ChequeOcasionalDoc[] = []
  const sinIdDeVientri: string[] = []
  for (const d of docs) {
    const candidatos = porNumero.get(d.numeroCheque) ?? []
    if (candidatos.length !== 1) {
      sinIdDeVientri.push(d.numeroCheque)
      continue
    }
    const b = candidatos[0]!
    resueltos.push({
      ...d,
      vientriId: b.vientriId,
      vientriChqId: b.vientriChqId,
      estado: b.estado,
      estadoCodigo: b.estadoCodigo,
      fechaConciliado: b.fechaConciliado,
      baja: b.baja,
      pagado: d.pagado || b.fechaConciliado !== null,
    })
  }
  return { docs: resueltos, sinIdDeVientri }
}
