import type { Timestamp } from 'firebase-admin/firestore'
import type { BancoNombre } from '../../domain/cuenta.types.js'

export type MovimientoBancarioTipo = 'debito' | 'credito'

/**
 * Interbanking Movimientos v2 no devuelve un `id` estable y `correlative_number`
 * se repite. Además su paginación (`limit`/`page`) es inestable: a partir de
 * cierta página devuelve filas ya entregadas y saltea otras. Verificado el
 * 2026-09-28 sobre Córdoba CC: un día paginado de a 50 dio 2.000 filas con solo
 * 782 distintas; el mismo día en una sola página dio 4.565 filas, todas distintas.
 *
 * Por eso:
 *  - No se deduplica por contenido. Cada fila se guarda tal cual la manda el banco.
 *  - Cada rango se pide en UNA sola página (limit grande). Si el banco devuelve
 *    menos filas que `total_rows`, el rango se parte en mitades, nunca se pagina.
 *  - La idempotencia viene del rango, no de la fila: un sync reemplaza completo
 *    (borra + inserta) el tramo [desde, hasta] de esa cuenta.
 *  - `movimientosBancariosSync/{cuentaId}` guarda la marca de agua
 *    `ultimaFechaSincronizada`. Los sync siguientes arrancan en ese día y lo
 *    vuelven a traer entero.
 *
 * `depositorDescription` y `customerCuit` son opcionales: el banco los deja
 * vacíos en comisiones, impuestos y transferencias entre cuentas propias.
 * `descripcion` prioriza `code_description_bank` (viene poblado) y recién
 * después `code_description_ib`.
 */
export interface MovimientoBancarioDocument {
  cuentaId: string
  bancoNombre: BancoNombre
  bancoNumero: string
  numeroCuenta: string
  moneda: 'ARS'
  tipo: MovimientoBancarioTipo
  /** Valor absoluto, en centavos. El signo vive en `tipo`. */
  montoCentavos: number
  /** Día de process_date, YYYY-MM-DD (Argentina, sin hora). */
  fechaProceso: string
  descripcion: string
  codeDescriptionBank: string | null
  codeDescriptionIb: string | null
  depositorDescription: string | null
  customerCuit: string | null
  operationCodeBank: string
  operationCodeIb: string
  /** null cuando el banco manda 0 o no manda comprobante. */
  voucherNumber: number | null
  /** Tal cual lo manda el banco. No es único. */
  correlativeNumber: number | null
  /**
   * Transferencia que ya usó este débito. Un sync que reemplaza el día borra
   * el documento y, con él, esta marca; la reconciliación la vuelve a poner
   * si el débito reaparece como único candidato.
   */
  reservadoPorTransferenciaId?: string | null
  /** Cheque que ya usó este movimiento (traza). Se re-vincula tras cada sync. */
  reservadoPorChequeId?: string | null
  /** Categoría libre. Se reaplica si un sync reemplaza el día y la fila reaparece. */
  categoriaId?: string | null
  /** Texto libre del usuario. También se reaplica junto con la categoría. */
  nota?: string | null
  /**
   * Palabra corta de la planilla de caja (cliente, arca, julio…).
   * `manual` se reaplica si un sync reemplaza el día. `sugerido` no se guarda:
   * se calcula al armar la caja.
   */
  detalleCaja?: string | null
  detalleCajaOrigen?: 'manual' | 'sugerido' | null
  /** A quién o de quién es el movimiento. `manual` no se pisa en un sync. */
  contraparteNombre?: string | null
  contraparteCuit?: string | null
  contraparteOrigen?:
    | 'manual'
    | 'banco'
    | 'transferencia'
    | 'agenda'
    | 'interbanking'
    | 'directorio'
    | 'categoria'
    | null
  createdAt: Timestamp
  syncedBy: string
}

export interface MovimientoBancarioSyncDocument {
  cuentaId: string
  bancoNombre: BancoNombre
  /** Primer día cubierto por la carga inicial, YYYY-MM-DD. */
  primeraFechaCargada: string
  /** Último día ya traído del banco, YYYY-MM-DD. El próximo sync lo reemplaza entero. */
  ultimaFechaSincronizada: string
  ultimoSyncAt: Timestamp
  ultimoSyncPor: string
  ultimoSyncFilas: number
  createdAt: Timestamp
  updatedAt: Timestamp
}
