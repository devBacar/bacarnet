import { randomUUID } from 'node:crypto'
import { buildAgendaHistorialEntry } from '../../agenda/domain/agenda.historial.js'
import { agendaTimestampToIso } from '../../agenda/domain/agendaTimestamps.js'
import type { CompromisoEstado } from '../../agenda/domain/agenda.types.js'
import {
  appendCompromisoHistorial,
  getCompromisoDocument,
} from '../../agenda/services/agenda.repository.js'
import { getCuentaDocument } from '../../services/cuentas.repository.js'
import { getFinanzasTransferenciasProvider } from '../adapters/transferencias-provider.factory.js'
import { translateInterbankingErrors } from '../domain/transferencia.errors.js'
import type { TransferenciaEstado } from '../domain/transferencia.types.js'
import {
  appendTransferenciaHistorial,
  createTransferenciaWithHistorial,
  getTransferenciaDocument,
  timestampNow,
} from './transferencias.repository.js'

export const COMPROMISO_ESTADO_CONFECCIONADA: CompromisoEstado =
  'confeccionada_pendiente_autorizacion'

function normalizeCbu(raw: string): string {
  return raw.replace(/\D/g, '')
}

function serializeTransferencia(id: string, data: import('../domain/transferencia.types.js').TransferenciaConfeccionadaDocument) {
  return {
    id,
    compromisoPagoId: data.compromisoPagoId,
    tipo: data.tipo,
    cuentaDebitoId: data.cuentaDebitoId,
    cuentaCreditoCbu: data.cuentaCreditoCbu,
    montoCentavos: data.montoCentavos,
    concepto: data.concepto,
    operationId: data.operationId,
    processId: data.processId,
    estado: data.estado,
    erroresInterbanking: data.erroresInterbanking,
    confeccionadaPor: data.confeccionadaPor,
    fechaConfeccion: agendaTimestampToIso(data.fechaConfeccion),
    fechaDeteccionEfectivizada: agendaTimestampToIso(data.fechaDeteccionEfectivizada),
  }
}

export async function confeccionarTransferenciaDesdeCompromiso(input: {
  actorUid: string
  body: Record<string, unknown>
}) {
  const compromisoPagoId =
    typeof input.body.compromisoPagoId === 'string' ? input.body.compromisoPagoId.trim() : ''
  const cuentaCreditoCbuRaw =
    typeof input.body.cuentaCreditoCbu === 'string' ? input.body.cuentaCreditoCbu.trim() : ''
  const cuentaDebitoIdBody =
    typeof input.body.cuentaDebitoId === 'string' ? input.body.cuentaDebitoId.trim() : ''

  if (!compromisoPagoId) throw new Error('compromisoPagoId es obligatorio')
  if (!cuentaCreditoCbuRaw) throw new Error('cuentaCreditoCbu es obligatorio')

  const compromiso = await getCompromisoDocument(compromisoPagoId)
  if (!compromiso) throw new Error('Compromiso no encontrado')
  if (compromiso.medioPago !== 'transferencia') {
    throw new Error('Solo compromisos con medio transferencia pueden confeccionarse por API')
  }
  if (compromiso.estado === 'pagado') throw new Error('El compromiso ya está pagado')
  if (compromiso.estado === COMPROMISO_ESTADO_CONFECCIONADA) {
    throw new Error('Este compromiso ya tiene una transferencia confeccionada pendiente de autorización')
  }
  if (compromiso.estado !== 'pendiente' && compromiso.estado !== 'vencido') {
    throw new Error('El compromiso no está en un estado válido para confeccionar')
  }

  const cuentaDebitoId = cuentaDebitoIdBody || compromiso.cuentaId?.trim() || ''
  if (!cuentaDebitoId) throw new Error('Indicá la cuenta de débito (CC)')

  const cuenta = await getCuentaDocument(cuentaDebitoId)
  if (!cuenta) throw new Error('Cuenta de débito no encontrada')
  if (cuenta.data.tipo !== 'CC') {
    throw new Error('La cuenta de débito debe ser una cuenta corriente (CC)')
  }

  const cuentaCreditoCbu = normalizeCbu(cuentaCreditoCbuRaw)
  const provider = getFinanzasTransferenciasProvider()
  const providerResult = await provider.confeccionarLote([
    {
      tipo: 'proveedores',
      cuentaDebitoId,
      cuentaCreditoCbu,
      montoCentavos: compromiso.montoCentavos,
      concepto: compromiso.concepto,
      disclaimerAceptado: null,
    },
  ])

  const erroresTraducidos = translateInterbankingErrors(providerResult.erroresCodigos)
  const transferenciaId = randomUUID()
  const fechaConfeccion = timestampNow()

  if (erroresTraducidos?.length) {
    await createTransferenciaWithHistorial({
      id: transferenciaId,
      doc: {
        compromisoPagoId,
        tipo: 'proveedores',
        cuentaDebitoId,
        cuentaCreditoCbu,
        montoCentavos: compromiso.montoCentavos,
        concepto: compromiso.concepto,
        disclaimerAceptado: null,
        operationId: providerResult.operationId || '',
        processId: providerResult.processId,
        estado: 'rechazada',
        erroresInterbanking: erroresTraducidos,
        confeccionadaPor: input.actorUid,
        fechaConfeccion,
        fechaDeteccionEfectivizada: null,
      },
      historial: {
        estadoAnterior: null,
        estadoNuevo: 'rechazada',
        origen: 'api',
        nota: erroresTraducidos.join(' '),
      },
    })

    return {
      ok: false as const,
      transferencia: serializeTransferencia(transferenciaId, (await getTransferenciaDocument(transferenciaId))!.data),
      errores: erroresTraducidos,
    }
  }

  let estado: TransferenciaEstado = providerResult.estadoInmediato
  let operationId = providerResult.operationId
  if (estado === 'pendiente_proceso' && providerResult.processId) {
    const polled = await provider.consultarProceso(providerResult.processId)
    if (polled.estado === 'confeccionada' && polled.operationId) {
      estado = 'confeccionada'
      operationId = polled.operationId
    } else if (polled.estado === 'rechazada') {
      const err = translateInterbankingErrors(polled.erroresCodigos) ?? ['No se pudo confeccionar el lote']
      await createTransferenciaWithHistorial({
        id: transferenciaId,
        doc: {
          compromisoPagoId,
          tipo: 'proveedores',
          cuentaDebitoId,
          cuentaCreditoCbu,
          montoCentavos: compromiso.montoCentavos,
          concepto: compromiso.concepto,
          disclaimerAceptado: null,
          operationId: '',
          processId: providerResult.processId,
          estado: 'rechazada',
          erroresInterbanking: err,
          confeccionadaPor: input.actorUid,
          fechaConfeccion,
          fechaDeteccionEfectivizada: null,
        },
        historial: {
          estadoAnterior: null,
          estadoNuevo: 'rechazada',
          origen: 'api',
          nota: err.join(' '),
        },
      })
      return {
        ok: false as const,
        transferencia: serializeTransferencia(transferenciaId, (await getTransferenciaDocument(transferenciaId))!.data),
        errores: err,
      }
    }
  }

  if (!operationId && estado === 'confeccionada') {
    throw new Error('El proveedor no devolvió operation_id')
  }

  await createTransferenciaWithHistorial({
    id: transferenciaId,
    doc: {
      compromisoPagoId,
      tipo: 'proveedores',
      cuentaDebitoId,
      cuentaCreditoCbu,
      montoCentavos: compromiso.montoCentavos,
      concepto: compromiso.concepto,
      disclaimerAceptado: null,
      operationId: operationId || '',
      processId: providerResult.processId,
      estado,
      erroresInterbanking: null,
      confeccionadaPor: input.actorUid,
      fechaConfeccion,
      fechaDeteccionEfectivizada: null,
    },
    historial: {
      estadoAnterior: null,
      estadoNuevo: estado,
      origen: 'api',
      nota: 'Confección mock (pendiente autorización en Interbanking)',
    },
  })

  const historialCompromiso = buildAgendaHistorialEntry({
    estadoAnterior: compromiso.estado,
    estadoNuevo: COMPROMISO_ESTADO_CONFECCIONADA,
    usuario: input.actorUid,
    nota: `Transferencia confeccionada (operation_id ${operationId}). Pendiente autorización en Interbanking.`,
  })

  await appendCompromisoHistorial({
    compromisoId: compromisoPagoId,
    historial: historialCompromiso,
    patch: {
      estado: COMPROMISO_ESTADO_CONFECCIONADA,
      transferenciaConfeccionadaId: transferenciaId,
      cuentaId: cuentaDebitoId,
    },
  })

  const transferenciaDoc = await getTransferenciaDocument(transferenciaId)
  if (!transferenciaDoc) throw new Error('No se pudo leer la transferencia creada')

  return {
    ok: true as const,
    transferencia: serializeTransferencia(transferenciaId, transferenciaDoc.data),
    provider: 'mock' as const,
  }
}

export async function getTransferenciaEstadoApi(transferenciaId: string) {
  const row = await getTransferenciaDocument(transferenciaId)
  if (!row) return null

  let data = row.data
  if (data.estado === 'pendiente_proceso' && data.processId) {
    const provider = getFinanzasTransferenciasProvider()
    const polled = await provider.consultarProceso(data.processId)
    if (polled.estado === 'confeccionada' && polled.operationId) {
      await appendTransferenciaHistorial({
        transferenciaId,
        historial: {
          estadoAnterior: 'pendiente_proceso',
          estadoNuevo: 'confeccionada',
          origen: 'api',
          nota: 'Resultado del lote asincrónico (mock)',
        },
        patch: {
          estado: 'confeccionada',
          operationId: polled.operationId,
          erroresInterbanking: null,
        },
      })
      const updated = await getTransferenciaDocument(transferenciaId)
      if (updated) data = updated.data
    } else if (polled.estado === 'rechazada') {
      const err = translateInterbankingErrors(polled.erroresCodigos)
      await appendTransferenciaHistorial({
        transferenciaId,
        historial: {
          estadoAnterior: 'pendiente_proceso',
          estadoNuevo: 'rechazada',
          origen: 'api',
          nota: err?.join(' ') ?? null,
        },
        patch: {
          estado: 'rechazada',
          erroresInterbanking: err,
        },
      })
      const updated = await getTransferenciaDocument(transferenciaId)
      if (updated) data = updated.data
    }
  }

  return serializeTransferencia(transferenciaId, data)
}
