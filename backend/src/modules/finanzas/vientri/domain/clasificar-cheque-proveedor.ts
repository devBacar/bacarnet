import { normalizarNombre } from '../../agenda/domain/normalizar-nombre.js'

export interface ClasificacionChequeProveedor {
  esInteresEncubierto: boolean
  /** Nombre original del beneficiario cuando es del circuito financiero; null en caso contrario. */
  beneficiarioReal: string | null
}

/**
 * Un cheque es "interés encubierto" cuando el beneficiario real (DESTINATARIO de CHQOCA)
 * coincide con un proveedor financiero. Nunca se usa el proveedor del comprobante contable
 * (PER vía CMP): suele ser un placeholder genérico y no identifica al beneficiario real.
 *
 * @param beneficiario destinatario del cheque
 * @param proveedoresFinancierosSet nombres normalizados (ver normalizarNombre) de proveedoresFinancieros
 */
export function esInteresFinancieroDisfrazado(
  beneficiario: string | null | undefined,
  proveedoresFinancierosSet: ReadonlySet<string>,
): ClasificacionChequeProveedor {
  const nombre = (beneficiario ?? '').trim()
  if (nombre === '') return { esInteresEncubierto: false, beneficiarioReal: null }
  const esFinanciero = proveedoresFinancierosSet.has(normalizarNombre(nombre))
  return {
    esInteresEncubierto: esFinanciero,
    beneficiarioReal: esFinanciero ? nombre : null,
  }
}
