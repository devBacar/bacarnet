import type { TransferenciaTipo } from '../domain/transferencia.types.js'

export interface ConfeccionTransferenciaItem {
  tipo: TransferenciaTipo
  cuentaDebitoId: string
  cuentaCreditoCbu: string
  montoCentavos: number
  concepto: string | null
  disclaimerAceptado: boolean | null
}

export interface ConfeccionTransferenciaResult {
  operationId: string
  processId: string | null
  estadoInmediato: 'confeccionada' | 'pendiente_proceso'
  erroresCodigos: string[] | null
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
