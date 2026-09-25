import { randomUUID } from 'node:crypto'
import type {
  ConfeccionTransferenciaItem,
  ConfeccionTransferenciaResult,
  ConsultaProcesoResult,
  TransferenciasDataProvider,
} from './transferencias-provider.types.js'

const pendingProcess = new Map<string, { operationId: string }>()

function normalizeCbu(cbu: string): string {
  return cbu.replace(/\D/g, '')
}

export class MockTransferenciasProvider implements TransferenciasDataProvider {
  async confeccionarLote(items: ConfeccionTransferenciaItem[]): Promise<ConfeccionTransferenciaResult> {
    if (items.length === 0) {
      return {
        operationId: '',
        processId: null,
        estadoInmediato: 'confeccionada',
        erroresCodigos: ['mock.lote.vacio'],
      }
    }

    const item = items[0]!
    const cbu = normalizeCbu(item.cuentaCreditoCbu)
    if (cbu.length !== 22) {
      return {
        operationId: '',
        processId: null,
        estadoInmediato: 'confeccionada',
        erroresCodigos: ['tef.gestion.error.cbu.invalido'],
      }
    }

    if (item.montoCentavos <= 0) {
      return {
        operationId: '',
        processId: null,
        estadoInmediato: 'confeccionada',
        erroresCodigos: ['tef.gestion.error.monto.supera.tope'],
      }
    }

    const operationId = `mock-op-${randomUUID().slice(0, 8)}`

    if (items.length > 10) {
      const processId = `mock-proc-${randomUUID().slice(0, 8)}`
      pendingProcess.set(processId, { operationId })
      return {
        operationId: '',
        processId,
        estadoInmediato: 'pendiente_proceso',
        erroresCodigos: null,
      }
    }

    return {
      operationId,
      processId: null,
      estadoInmediato: 'confeccionada',
      erroresCodigos: null,
    }
  }

  async consultarProceso(processId: string): Promise<ConsultaProcesoResult> {
    const row = pendingProcess.get(processId)
    if (!row) {
      return {
        estado: 'rechazada',
        operationId: null,
        erroresCodigos: ['mock.process.not_found'],
      }
    }
    pendingProcess.delete(processId)
    return {
      estado: 'confeccionada',
      operationId: row.operationId,
      erroresCodigos: null,
    }
  }
}

export const mockTransferenciasProvider = new MockTransferenciasProvider()
