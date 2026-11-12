import type { ChequeOcasionalDoc, OperacionRenovacion } from './cheque-ocasional.types.js'
import type { ProveedorDelCatalogo } from './operaciones-usd.js'
import { mismoBeneficiario } from './propuesta-renovacion.js'
import type { EstadoChequeRenov } from './seguimiento.types.js'

export interface OperacionesDelCheque {
  /** La renovación de la que salió este cheque (es uno de los cheques nuevos). */
  origen: OperacionRenovacion | null
  /** La renovación donde este cheque se reemplazó por otros (es uno de los cheques viejos). */
  renovacion: OperacionRenovacion | null
}

/**
 * Ubica un cheque dentro de las operaciones de renovación armadas por `agruparOperacionesRenovacion`.
 * Finanzas mira la renovación como operación (todos los viejos contra todos los nuevos), no cheque a cheque.
 */
export function operacionesDelCheque(numeroCheque: string, operaciones: OperacionRenovacion[]): OperacionesDelCheque {
  const origen = operaciones.find((o) => o.chequesNuevos.some((c) => c.numeroCheque === numeroCheque)) ?? null
  const renovacion = operaciones.find((o) => o.vinculada && o.chequesViejos.some((c) => c.numeroCheque === numeroCheque)) ?? null
  return { origen, renovacion }
}

/** En qué quedó un cheque (mismo criterio que los cheques nuevos del seguimiento de renovaciones). */
export function estadoChequeRenov(doc: Pick<ChequeOcasionalDoc, 'estadoCodigo'> | undefined, pagado: boolean): EstadoChequeRenov {
  if (doc?.estadoCodigo === 5) return 'renovado'
  if (doc?.estadoCodigo === 9) return 'anulado'
  if (doc?.estadoCodigo === 3) return 'rechazado'
  if (pagado) return 'debitado'
  return 'pendiente'
}

/** Un cheque de interés pagado aparte. */
export interface ChequeDeInteresAparte {
  numeroCheque: string
  montoCentavos: number
  fechaEmision: string | null
  fechaVencimiento: string | null
  obs: string
  estado: EstadoChequeRenov
}

/** Interés de una renovación que se pagó aparte, en otros cheques, y Finanzas confirmó (`interesDe`). */
export interface InteresAparte {
  cantidadCheques: number
  totalCentavos: number
  /** 6 = 6 %. Si `porMes`, es por mes durante `meses`. */
  tasaPorcentaje: number
  porMes: boolean
  meses: number
  baseDescripcion: string
  /** Base sobre la que se calculó (del primer cheque; puede faltar en confirmaciones viejas). */
  baseCentavos: number
  /** Los cheques de interés, del que vence primero al último. */
  cheques: ChequeDeInteresAparte[]
}

/**
 * Los cheques de interés confirmados para una renovación: mismo proveedor, `interesDe.fechaRenovacion` igual a la
 * emisión de la renovación y el mismo OBS (el mismo día puede haber varias renovaciones, cada una con su interés).
 */
export function interesAparteDe(
  op: Pick<OperacionRenovacion, 'fechaEmision' | 'obsOriginal' | 'beneficiario' | 'beneficiarioNormalizado'>,
  docs: ChequeOcasionalDoc[],
  catalogo: ReadonlyMap<string, ProveedorDelCatalogo> = new Map(),
): InteresAparte | null {
  if (!op.fechaEmision) return null
  const obs = op.obsOriginal.trim()
  const cheques = docs.filter(
    (d) =>
      !d.baja
      && d.interesDe?.fechaRenovacion === op.fechaEmision
      && (d.interesDe.obsRenovacion === '' || d.interesDe.obsRenovacion === obs)
      && mismoBeneficiario(d, op, catalogo),
  )
  if (cheques.length === 0) return null
  const i = cheques[0]!.interesDe!
  return {
    cantidadCheques: cheques.length,
    totalCentavos: cheques.reduce((s, d) => s + d.montoCentavos, 0),
    tasaPorcentaje: i.tasaPorcentaje,
    porMes: i.porMes,
    meses: i.meses,
    baseDescripcion: i.baseDescripcion,
    baseCentavos: i.baseCentavos ?? 0,
    cheques: cheques
      .map((d) => ({
        numeroCheque: d.numeroCheque,
        montoCentavos: d.montoCentavos,
        fechaEmision: d.fechaEmision,
        fechaVencimiento: d.fechaVencimiento,
        obs: d.obsOriginal.trim(),
        estado: estadoChequeRenov(d, d.pagado),
      }))
      .sort((a, b) => (a.fechaVencimiento ?? '').localeCompare(b.fechaVencimiento ?? '') || a.numeroCheque.localeCompare(b.numeroCheque)),
  }
}
