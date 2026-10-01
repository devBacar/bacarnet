import { buildAgendaHistorialEntry } from '../../agenda/domain/agenda.historial.js'
import { listarPagos } from '../../agenda/domain/pago-compromiso.js'
import type { CompromisoEstado } from '../../agenda/domain/agenda.types.js'
import { appendCompromisoHistorial, getCompromisoDocument } from '../../agenda/services/agenda.repository.js'
import {
  decidirVinculoTransferencia,
  faltaPagarCentavos,
  listarTransferenciasEnFirma,
} from '../../hoy/domain/transferencia-en-firma.js'

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

/** Falla antes de llamar al banco si el monto no entra en lo que falta. */
export async function assertMontoTransferenciaCabe(compromisoId: string, montoCentavos: number): Promise<void> {
  const compromiso = await getCompromisoDocument(compromisoId)
  if (!compromiso) throw new Error('No encontré ese pago en la agenda')
  const libre = faltaPagarCentavos({
    estado: compromiso.estado,
    montoCentavos: compromiso.montoCentavos,
    pagos: listarPagos(compromiso.pagos),
    transferenciasEnFirma: listarTransferenciasEnFirma(compromiso.transferenciasEnFirma),
  })
  if (libre <= 0) throw new Error('Ese pago ya está cubierto')
  if (!Number.isInteger(montoCentavos) || montoCentavos <= 0) throw new Error('Indicá un monto mayor a cero')
  if (montoCentavos > libre) throw new Error('El monto supera lo que falta pagar')
}

export async function vincularCompromisoATransferenciaDirecta(input: {
  compromisoId: string
  transferenciaId: string
  actorUid: string
  cuentaDebitoId: string
  montoCentavos: number
}): Promise<void> {
  const compromiso = await getCompromisoDocument(input.compromisoId)
  if (!compromiso || compromiso.estado === 'pagado') return
  if (
    compromiso.estado === ESTADO_TRANSFERENCIA_PREPARADA &&
    compromiso.transferenciaConfeccionadaId === input.transferenciaId
  ) {
    return
  }

  const decision = decidirVinculoTransferencia(
    {
      estado: compromiso.estado,
      montoCentavos: compromiso.montoCentavos,
      pagos: listarPagos(compromiso.pagos),
      transferenciasEnFirma: listarTransferenciasEnFirma(compromiso.transferenciasEnFirma),
    },
    { transferenciaId: input.transferenciaId, montoCentavos: input.montoCentavos },
  )
  if (!decision.ok) throw new Error(decision.error)

  if (decision.modo === 'total') {
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
        transferenciasEnFirma: [],
      },
    })
    return
  }

  await appendCompromisoHistorial({
    compromisoId: input.compromisoId,
    historial: buildAgendaHistorialEntry({
      estadoAnterior: compromiso.estado,
      estadoNuevo: decision.estado,
      usuario: input.actorUid,
      nota: 'Quedó una transferencia en firma por una parte del pago.',
    }),
    patch: {
      medioPago: 'transferencia',
      cuentaId: input.cuentaDebitoId,
      transferenciasEnFirma: decision.transferenciasEnFirma,
    },
  })
}
