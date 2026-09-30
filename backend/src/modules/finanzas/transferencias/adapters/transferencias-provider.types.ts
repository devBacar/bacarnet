import type { TransferenciaTipo } from '../domain/transferencia.types.js'

export interface ConfeccionTransferenciaItem {
  tipo: TransferenciaTipo
  cuentaDebitoId: string
  cuentaCreditoCbu: string
  montoCentavos: number
  concepto: string | null
  disclaimerAceptado: boolean | null
  /** Código de motivo (VAR, ALQ, …). Solo terceros. */
  codigoConcepto?: string | null
  /** 11 dígitos si vino. El body v2 no lo envía: el spec no tiene el campo. */
  destinoCuit?: string | null
  /**
   * CC o CA de la cuenta crédito en terceros y proveedores.
   * En cuentas propias el tipo sale del ruteo conocido.
   */
  tipoCuenta?: 'CC' | 'CA' | null
}

export interface ConfeccionTransferenciaResult {
  operationId: string
  processId: string | null
  estadoInmediato: 'confeccionada' | 'pendiente_proceso'
  erroresCodigos: string[] | null
  /** confection_id que mandamos. Sirve para emparejar el detalle después. */
  confectionId?: string | null
}

export interface ConsultaProcesoResult {
  estado: 'confeccionada' | 'rechazada'
  operationId: string | null
  erroresCodigos: string[] | null
}

export interface TransferenciasDataProvider {
  confeccionarLote(items: ConfeccionTransferenciaItem[]): Promise<ConfeccionTransferenciaResult>
  consultarProceso(processId: string): Promise<ConsultaProcesoResult>
}
