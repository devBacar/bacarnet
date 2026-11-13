/**
 * Recalcula y persiste el seguimiento de operaciones de renovación de cheques ocasionales.
 *
 * Colección destino: `renovacionesChequesAgrupados` (ID determinístico
 * `renov-{beneficiario}-{fechaEmision}-{banco}[-n]`). Es una colección derivada: se regenera
 * desde los docs de `vientriChequesOcasionales` en cada importación (upsert por huella).
 *
 * El estado abierta/cerrada no se guarda (depende de la fecha de hoy): ver `estadoOperacion`.
 */
import type { ChequeOcasionalDoc } from '../domain/cheque-ocasional.types.js'
import { marcarOtrosPagos } from '../domain/clasificar-ocasional.js'
import { construirSeguimiento } from '../domain/seguimiento.js'
import { leerActivosConEslabonesDeVientri } from './completar-eslabones-vientri.js'
import { inyectarChqParaAutolink } from './inyectar-chq-autolink.js'
import { sincronizarColeccion, type ConteoEscritura } from './vientri.repository.js'

export const VIENTRI_OPERACIONES_RENOVACION = 'renovacionesChequesAgrupados'

export interface ResultadoSeguimiento {
  operaciones: number
  conteo: ConteoEscritura
}

export async function recalcularSeguimiento(opts: {
  /** Docs de `vientriChequesOcasionales` (con o sin `baja`; los de baja se excluyen). */
  docs: ChequeOcasionalDoc[]
  importacionId: string
  simular?: boolean
  /** Por defecto false: se hace upsert de las operaciones actuales y no se borran las que dejaron de existir. */
  borrarFaltantes?: boolean
  /** Beneficiarios marcados a mano como pago: sus cheques no arman operaciones (ver `esOtroPago`). */
  marcadosComoPago?: ReadonlySet<string>
}): Promise<ResultadoSeguimiento> {
  const activos = marcarOtrosPagos(opts.docs.filter((d) => !d.baja), opts.marcadosComoPago ?? new Set())
  const completos = await leerActivosConEslabonesDeVientri(activos)
  const conChq = await inyectarChqParaAutolink(completos)
  const operaciones = construirSeguimiento(conChq)

  const conteo = await sincronizarColeccion({
    coleccion: VIENTRI_OPERACIONES_RENOVACION,
    docs: operaciones.map((op) => ({ id: op.id, data: op as unknown as object })),
    importacionId: opts.importacionId,
    borrarFaltantes: opts.borrarFaltantes === true,
    simular: opts.simular === true,
  })

  return { operaciones: operaciones.length, conteo }
}
