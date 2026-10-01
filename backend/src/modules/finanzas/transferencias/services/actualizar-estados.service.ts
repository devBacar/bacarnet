import { agendaTimestampToDate } from '../../agenda/domain/agendaTimestamps.js'
import {
  cbuDeCuentaPropia,
  resolveInterbankingDebitAccount,
} from '../adapters/interbanking-cuenta.routing.js'
import {
  consultarDetallesTransferencias,
  diaArgentinaDesdeDate,
  type DetalleTransferenciaInterbanking,
} from '../adapters/interbanking-transferencias-details.js'
import {
  esEstadoInterbankingFinal,
  presentarEstadoInterbanking,
} from '../domain/estado-interbanking.js'
import {
  emparejarDetallesConTransferencias,
  type TransferenciaParaEmparejar,
} from '../domain/emparejar-detalle-transferencia.js'
import type {
  TransferenciaConfeccionadaDocument,
  TransferenciaHistorialOrigen,
} from '../domain/transferencia.types.js'
import {
  aplicarEstadoInterbanking,
  listTransferenciasConfeccionadas,
} from './transferencias.repository.js'

export interface ActualizarEstadosResultado {
  revisadas: number
  actualizadas: number
  sinCambio: number
  sinCoincidencia: number
  ambiguas: number
}

export interface ActualizarEstadosDeps {
  listar: () => Promise<Array<{ id: string; data: TransferenciaConfeccionadaDocument }>>
  consultar: (desde: string, hasta: string) => Promise<DetalleTransferenciaInterbanking[]>
  guardar: typeof aplicarEstadoInterbanking
  now: Date
  cbuDebito: (cuentaId: string) => string | null
  numeroDebito: (cuentaId: string) => string | null
  /** Cuando el banco informa que la transferencia quedó hecha. */
  alQuedarHecha: (input: {
    compromisoId: string
    cuentaDebitoId: string
    nota: string
    transferenciaId: string
    montoCentavos: number
  }) => Promise<void>
  /** Cuando el banco la rechaza: el monto reservado vuelve a faltar. */
  alQuedarRechazada: (input: { compromisoId: string; transferenciaId: string; nota: string }) => Promise<void>
}

function diaDeTimestamp(value: unknown): string | null {
  const date = agendaTimestampToDate(value)
  if (!date) return null
  return diaArgentinaDesdeDate(date)
}

function numeroDebitoSeguro(cuentaId: string): string | null {
  try {
    return resolveInterbankingDebitAccount(cuentaId).account_number
  } catch {
    return null
  }
}

async function marcarCompromisoHechoPorDefecto(input: {
  compromisoId: string
  cuentaDebitoId: string
  nota: string
  transferenciaId: string
  montoCentavos: number
}): Promise<void> {
  const { marcarCompromisoPagadoPorTransferenciaHecha } = await import(
    '../../agenda/services/compromisos.service.js'
  )
  await marcarCompromisoPagadoPorTransferenciaHecha({
    compromisoId: input.compromisoId,
    actorUid: 'sistema',
    cuentaId: input.cuentaDebitoId,
    nota: input.nota,
    transferenciaId: input.transferenciaId,
    montoCentavos: input.montoCentavos,
  })
}

async function liberarCompromisoRechazadoPorDefecto(input: {
  compromisoId: string
  transferenciaId: string
  nota: string
}): Promise<void> {
  const { liberarTransferenciaDelCompromiso } = await import('../../agenda/services/compromisos.service.js')
  await liberarTransferenciaDelCompromiso({
    compromisoId: input.compromisoId,
    transferenciaId: input.transferenciaId,
    actorUid: 'sistema',
    nota: input.nota,
  })
}

function depsPorDefecto(now: Date): ActualizarEstadosDeps {
  return {
    listar: listTransferenciasConfeccionadas,
    consultar: (desde, hasta) =>
      consultarDetallesTransferencias({ dateSince: desde, dateUntil: hasta, now }),
    guardar: aplicarEstadoInterbanking,
    now,
    cbuDebito: cbuDeCuentaPropia,
    numeroDebito: numeroDebitoSeguro,
    alQuedarHecha: marcarCompromisoHechoPorDefecto,
    alQuedarRechazada: liberarCompromisoRechazadoPorDefecto,
  }
}

function requiereConsulta(
  data: TransferenciaConfeccionadaDocument,
  fechaConfeccionDia: string | null,
  now: Date,
): boolean {
  if (data.estado === 'rechazada' || data.estado === 'cancelada' || data.estado === 'efectivizada') {
    return false
  }
  if (data.estado !== 'confeccionada' && data.estado !== 'pendiente_proceso') return false
  return !esEstadoInterbankingFinal({
    estado: data.estadoInterbanking,
    fechaSolicitud: data.fechaSolicitudInterbanking ?? fechaConfeccionDia,
    now,
  })
}

export async function actualizarEstadosTransferencias(input?: {
  origen?: TransferenciaHistorialOrigen
  deps?: Partial<ActualizarEstadosDeps>
}): Promise<ActualizarEstadosResultado> {
  const now = input?.deps?.now ?? new Date()
  const deps: ActualizarEstadosDeps = { ...depsPorDefecto(now), ...input?.deps, now }
  const origen = input?.origen ?? 'sync_automatico'
  const vacio: ActualizarEstadosResultado = {
    revisadas: 0,
    actualizadas: 0,
    sinCambio: 0,
    sinCoincidencia: 0,
    ambiguas: 0,
  }

  const rows = await deps.listar()
  const pendientes = rows.flatMap((row) => {
    const fechaConfeccionDia = diaDeTimestamp(row.data.fechaConfeccion)
    if (!requiereConsulta(row.data, fechaConfeccionDia, deps.now)) return []
    const paraEmparejar: TransferenciaParaEmparejar = {
      id: row.id,
      operationId: row.data.operationId ?? '',
      confectionId: row.data.confectionId ?? null,
      cuentaDebitoCbu: deps.cbuDebito(row.data.cuentaDebitoId),
      cuentaDebitoNumero: deps.numeroDebito(row.data.cuentaDebitoId),
      cuentaCreditoCbu: row.data.cuentaCreditoCbu,
      montoCentavos: row.data.montoCentavos,
      fechaConfeccionDia,
    }
    return [{ row, paraEmparejar }]
  })

  if (pendientes.length === 0) return vacio

  const dias = pendientes
    .map((item) => item.paraEmparejar.fechaConfeccionDia)
    .filter((dia): dia is string => Boolean(dia))
    .sort()
  const hoy = diaArgentinaDesdeDate(deps.now)
  const desde = dias[0] ?? hoy
  const hasta = dias[dias.length - 1] ?? hoy
  const detalles = await deps.consultar(desde, hasta > hoy ? hasta : hoy)
  const emparejados = emparejarDetallesConTransferencias(
    pendientes.map((item) => item.paraEmparejar),
    detalles,
  )
  const porId = new Map(pendientes.map((item) => [item.row.id, item.row]))

  const resultado = { ...vacio, revisadas: pendientes.length }
  for (const match of emparejados) {
    if (match.motivo === 'ambiguo') {
      resultado.ambiguas += 1
      continue
    }
    if (!match.detalle) {
      resultado.sinCoincidencia += 1
      continue
    }
    const row = porId.get(match.transferenciaId)
    if (!row) continue
    const anterior = row.data.estadoInterbanking?.trim() || null
    const nuevo = match.detalle.status
    const cambio = anterior !== nuevo
    const rotuloAnterior = presentarEstadoInterbanking({
      estado: anterior,
      fechaSolicitud: row.data.fechaSolicitudInterbanking,
      now: deps.now,
    })
    const rotuloNuevo = presentarEstadoInterbanking({
      estado: nuevo,
      fechaSolicitud: match.detalle.requestDate,
      now: deps.now,
    })
    await deps.guardar({
      transferenciaId: row.id,
      registrarHistorial: cambio,
      historial: {
        estadoAnterior: rotuloAnterior?.rotulo ?? anterior,
        estadoNuevo: rotuloNuevo?.rotulo ?? nuevo,
        origen,
        nota: `Estado informado por el banco: ${nuevo}`,
      },
      estadoInterbanking: nuevo,
      fechaSolicitudInterbanking: match.detalle.requestDate,
    })
    if (rotuloNuevo?.tono === 'hecha' || rotuloNuevo?.tono === 'rechazada') {
      const compromisoId = row.data.compromisoPagoId?.trim() ?? ''
      if (compromisoId && rotuloNuevo.tono === 'hecha') {
        await deps.alQuedarHecha({
          compromisoId,
          cuentaDebitoId: row.data.cuentaDebitoId,
          nota: 'La transferencia quedó hecha en el banco.',
          transferenciaId: row.id,
          montoCentavos: row.data.montoCentavos,
        })
      }
      if (compromisoId && rotuloNuevo.tono === 'rechazada') {
        await deps.alQuedarRechazada({
          compromisoId,
          transferenciaId: row.id,
          nota: 'El banco rechazó la transferencia. Ese monto vuelve a faltar.',
        })
      }
    }
    if (cambio) resultado.actualizadas += 1
    else resultado.sinCambio += 1
  }

  console.info(
    `[finanzas/transferencias] estados revisadas=${resultado.revisadas} actualizadas=${resultado.actualizadas} sinCambio=${resultado.sinCambio} sinCoincidencia=${resultado.sinCoincidencia} ambiguas=${resultado.ambiguas}`,
  )
  return resultado
}
