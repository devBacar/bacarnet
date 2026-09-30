import { buildAgendaHistorialEntry } from '../../agenda/domain/agenda.historial.js'
import type { CompromisoEstado } from '../../agenda/domain/agenda.types.js'
import { appendCompromisoHistorial, getCompromisoDocument } from '../../agenda/services/agenda.repository.js'

/** Mismo estado que usa la agenda cuando una transferencia ya está armada. */
export const ESTADO_TRANSFERENCIA_PREPARADA: CompromisoEstado = 'confeccionada_pendiente_autorizacion'

export async function estadoCompromisoParaTransferencia(
  compromisoId: string,
): Promise<'listo' | 'confeccionada'> {
  const compromiso = await getCompromisoDocument(compromisoId)
  if (!compromiso) throw new Error('No encontré ese pago en la agenda')
  if (compromiso.estado === 'pagado') throw new Error('Ese pago ya está marcado como pagado')
  if (compromiso.estado === ESTADO_TRANSFERENCIA_PREPARADA) return 'confeccionada'
  if (compromiso.estado !== 'pendiente' && compromiso.estado !== 'vencido') {
    throw new Error('Ese pago no se puede transferir ahora')
  }
  return 'listo'
}

export async function vincularCompromisoATransferenciaDirecta(input: {
  compromisoId: string
  transferenciaId: string
  actorUid: string
  cuentaDebitoId: string
}): Promise<void> {
  const compromiso = await getCompromisoDocument(input.compromisoId)
  if (!compromiso || compromiso.estado === 'pagado') return
  if (
    compromiso.estado === ESTADO_TRANSFERENCIA_PREPARADA &&
    compromiso.transferenciaConfeccionadaId === input.transferenciaId
  ) {
    return
  }
  if (compromiso.estado === ESTADO_TRANSFERENCIA_PREPARADA) {
    throw new Error('Ese pago ya tiene una transferencia armada')
  }

  await appendCompromisoHistorial({
    compromisoId: input.compromisoId,
    historial: buildAgendaHistorialEntry({
      estadoAnterior: compromiso.estado,
      estadoNuevo: ESTADO_TRANSFERENCIA_PREPARADA,
      usuario: input.actorUid,
      nota: 'Transferencia armada desde Hoy.',
    }),
    patch: {
      estado: ESTADO_TRANSFERENCIA_PREPARADA,
      medioPago: 'transferencia',
      transferenciaConfeccionadaId: input.transferenciaId,
      cuentaId: input.cuentaDebitoId,
    },
  })
}
