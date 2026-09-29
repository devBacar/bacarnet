import { randomUUID } from 'node:crypto'
import { buildAgendaHistorialEntry } from '../../agenda/domain/agenda.historial.js'
import { agendaTimestampToDate, agendaTimestampToIso } from '../../agenda/domain/agendaTimestamps.js'
import type { CompromisoEstado, CompromisoPagoDocument } from '../../agenda/domain/agenda.types.js'
import {
  appendCompromisoHistorial,
  getCompromisoDocument,
} from '../../agenda/services/agenda.repository.js'
import { findCuentaIdByCbu } from '../adapters/interbanking-cuenta.routing.js'
import { getCuentaDocument, listCuentaDocuments } from '../../services/cuentas.repository.js'
import {
  getFinanzasTransferenciasProvider,
  resolveFinanzasTransferenciasProviderMode,
} from '../adapters/transferencias-provider.factory.js'
import { translateInterbankingErrors } from '../domain/transferencia.errors.js'
import type { TransferenciaEstado, TransferenciaTipo } from '../domain/transferencia.types.js'
import {
  appendTransferenciaHistorial,
  cancelarTransferenciaYReabrirCompromiso,
  createTransferenciaWithHistorial,
  marcarTransferenciaCancelada,
  getTransferenciaDocument,
  listTransferenciaHistorial,
  listTransferenciasConfeccionadas,
  timestampNow,
} from './transferencias.repository.js'
import { resumirMovimientosCandidatos } from './reconciliar-movimientos.js'

export const COMPROMISO_ESTADO_CONFECCIONADA: CompromisoEstado =
  'confeccionada_pendiente_autorizacion'

/** Registro local únicamente. No se envía nada a Interbanking. */
export const NOTA_CANCELACION_MANUAL_BACARNET =
  'Cancelada manualmente en BacarNet — verificar que también esté cancelada/rechazada en Interbanking'

export class TransferenciaCancelacionError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'TransferenciaCancelacionError'
    this.status = status
  }
}

function normalizeCbu(raw: string): string {
  return raw.replace(/\D/g, '')
}

const TRANSFERENCIA_TIPOS: TransferenciaTipo[] = [
  'cuentas_propias',
  'sueldos',
  'proveedores',
  'terceros',
  'pagos_arca',
]

function resolveTransferenciaTipo(body: Record<string, unknown>): TransferenciaTipo {
  const mode = resolveFinanzasTransferenciasProviderMode()
  const raw = typeof body.tipo === 'string' ? body.tipo.trim() : ''
  if (raw && TRANSFERENCIA_TIPOS.includes(raw as TransferenciaTipo)) {
    const tipo = raw as TransferenciaTipo
    if (mode === 'interbanking' && tipo !== 'cuentas_propias') {
      throw new Error('Con Interbanking real solo está habilitado cuentas_propias por ahora')
    }
    return tipo
  }
  if (mode === 'interbanking') return 'cuentas_propias'
  return 'proveedores'
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
  const transferenciaTipo = resolveTransferenciaTipo(input.body)
  const providerMode = resolveFinanzasTransferenciasProviderMode()
  const provider = getFinanzasTransferenciasProvider()
  const providerResult = await provider.confeccionarLote([
    {
      tipo: transferenciaTipo,
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
        origen: 'compromiso',
        tipo: transferenciaTipo,
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
          origen: 'compromiso',
          tipo: transferenciaTipo,
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
      origen: 'compromiso',
      tipo: transferenciaTipo,
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
      nota:
        providerMode === 'interbanking'
          ? 'Confección Interbanking v2 (cuentas propias)'
          : 'Confección mock',
    },
  })

  const historialCompromiso = buildAgendaHistorialEntry({
    estadoAnterior: compromiso.estado,
    estadoNuevo: COMPROMISO_ESTADO_CONFECCIONADA,
    usuario: input.actorUid,
    nota: `Transferencia confeccionada por API (operation_id ${operationId}).`,
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
    provider: providerMode,
  }
}

export async function cancelarTransferenciaConfeccionada(input: {
  actorUid: string
  transferenciaId: string
}) {
  const transferenciaId = input.transferenciaId.trim()
  if (!transferenciaId) {
    throw new TransferenciaCancelacionError('Id de transferencia inválido', 400)
  }

  const row = await getTransferenciaDocument(transferenciaId)
  if (!row) throw new TransferenciaCancelacionError('Transferencia no encontrada', 404)
  if (row.data.estado === 'cancelada') {
    throw new TransferenciaCancelacionError('La transferencia ya está cancelada en BacarNet', 400)
  }
  if (row.data.estado !== 'confeccionada') {
    throw new TransferenciaCancelacionError(
      'Solo se puede marcar como cancelada una transferencia en estado confeccionada',
      400,
    )
  }

  const compromisoPagoId = row.data.compromisoPagoId?.trim() ?? ''
  if (!compromisoPagoId) {
    await marcarTransferenciaCancelada({
      transferenciaId,
      estadoAnterior: row.data.estado,
      nota: NOTA_CANCELACION_MANUAL_BACARNET,
    })
    const updatedDirecta = await getTransferenciaDocument(transferenciaId)
    if (!updatedDirecta) throw new TransferenciaCancelacionError('Transferencia no encontrada', 404)
    return {
      transferencia: serializeTransferencia(transferenciaId, updatedDirecta.data),
      compromiso: null,
      nota: NOTA_CANCELACION_MANUAL_BACARNET,
    }
  }

  const compromiso = await getCompromisoDocument(compromisoPagoId)
  if (!compromiso) throw new TransferenciaCancelacionError('Compromiso no encontrado', 404)
  if (compromiso.transferenciaConfeccionadaId !== transferenciaId) {
    throw new TransferenciaCancelacionError(
      'El compromiso no apunta a esta transferencia. No se modificó ningún registro.',
      409,
    )
  }
  if (compromiso.estado === 'pagado') {
    throw new TransferenciaCancelacionError(
      'El compromiso ya está pagado. No se puede reabrir desde esta cancelación.',
      400,
    )
  }
  if (compromiso.estado !== COMPROMISO_ESTADO_CONFECCIONADA) {
    throw new TransferenciaCancelacionError(
      'El compromiso no está pendiente de autorización. No se modificó ningún registro.',
      409,
    )
  }

  await cancelarTransferenciaYReabrirCompromiso({
    transferenciaId,
    compromisoId: compromisoPagoId,
    estadoAnteriorTransferencia: row.data.estado,
    estadoAnteriorCompromiso: compromiso.estado,
    nota: NOTA_CANCELACION_MANUAL_BACARNET,
    usuarioUid: input.actorUid,
  })

  const updated = await getTransferenciaDocument(transferenciaId)
  if (!updated) throw new TransferenciaCancelacionError('Transferencia no encontrada', 404)
  const compromisoActualizado = await getCompromisoDocument(compromisoPagoId)

  return {
    transferencia: serializeTransferencia(transferenciaId, updated.data),
    compromiso: {
      id: compromisoPagoId,
      estado: compromisoActualizado?.estado ?? 'pendiente',
      transferenciaConfeccionadaId: compromisoActualizado?.transferenciaConfeccionadaId ?? null,
    },
    nota: NOTA_CANCELACION_MANUAL_BACARNET,
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

const TRANSFERENCIA_ESTADOS: TransferenciaEstado[] = [
  'confeccionada',
  'pendiente_proceso',
  'rechazada',
  'efectivizada',
  'cancelada',
]

export interface TransferenciasListFilters {
  estado?: string
  cuentaId?: string
  tipo?: string
  desde?: string
  hasta?: string
}

function parseDiaFiltro(value: string | undefined, label: string): string | null {
  if (!value?.trim()) return null
  const dia = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    throw new Error(`${label} tiene que ser una fecha AAAA-MM-DD`)
  }
  return dia
}

function diaArgentina(value: unknown): string | null {
  const date = agendaTimestampToDate(value)
  if (!date) return null
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

function etiquetaCuenta(bancoNombre: string, tipo: string): string {
  return `${bancoNombre} ${tipo === 'USD' ? 'USD' : 'CC'}`
}

function nombreDestinoNoPropio(
  tipo: TransferenciaTipo,
  compromiso: CompromisoPagoDocument | null,
): string {
  if (tipo === 'pagos_arca') return 'ARCA'
  if (tipo === 'sueldos') {
    return (
      compromiso?.beneficiarioEmpleado?.trim() ||
      compromiso?.proveedorONombre?.trim() ||
      'Beneficiario'
    )
  }
  return compromiso?.proveedorONombre?.trim() || 'Beneficiario'
}

export async function listTransferenciasApi(filters: TransferenciasListFilters) {
  const estado = filters.estado?.trim() || ''
  const tipo = filters.tipo?.trim() || ''
  const cuentaId = filters.cuentaId?.trim() || ''
  if (estado && !TRANSFERENCIA_ESTADOS.includes(estado as TransferenciaEstado)) {
    throw new Error('Estado de transferencia inválido')
  }
  if (tipo && !TRANSFERENCIA_TIPOS.includes(tipo as TransferenciaTipo)) {
    throw new Error('Tipo de transferencia inválido')
  }
  const desde = parseDiaFiltro(filters.desde, 'desde')
  const hasta = parseDiaFiltro(filters.hasta, 'hasta')
  if (desde && hasta && desde > hasta) {
    throw new Error('La fecha desde no puede ser posterior a hasta')
  }

  const [rows, cuentas] = await Promise.all([
    listTransferenciasConfeccionadas(),
    listCuentaDocuments(),
  ])
  const cuentasPorId = new Map(cuentas.map((row) => [row.id, row.data]))

  const compromisoIds = [
    ...new Set(
      rows
        .map((row) => row.data.compromisoPagoId)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const compromisos = await Promise.all(
    compromisoIds.map(async (id) => [id, await getCompromisoDocument(id)] as const),
  )
  const compromisoPorId = new Map(compromisos)

  const filtradas = rows
    .filter((row) => {
      if (estado && row.data.estado !== estado) return false
      if (tipo && row.data.tipo !== tipo) return false
      if (cuentaId && row.data.cuentaDebitoId !== cuentaId) return false
      const dia = diaArgentina(row.data.fechaConfeccion)
      if (desde && (!dia || dia < desde)) return false
      if (hasta && (!dia || dia > hasta)) return false
      return true
    })
    .sort((a, b) => {
      const ta = agendaTimestampToDate(a.data.fechaConfeccion)?.getTime() ?? 0
      const tb = agendaTimestampToDate(b.data.fechaConfeccion)?.getTime() ?? 0
      return tb - ta
    })

  const candidatoIds = filtradas.flatMap((row) =>
    row.data.requiereConfirmacionManual ? (row.data.movimientoCandidatosIds ?? []) : [],
  )
  const candidatosPorId = await resumirMovimientosCandidatos(candidatoIds)

  const transferencias = filtradas.map((row) => {
      const debito = cuentasPorId.get(row.data.cuentaDebitoId)
      const debitoLabel = debito
        ? etiquetaCuenta(debito.bancoNombre, debito.tipo)
        : 'Cuenta de débito'
      const compromiso = row.data.compromisoPagoId
        ? (compromisoPorId.get(row.data.compromisoPagoId) ?? null)
        : null
      let destinoLabel = row.data.destinoNombre?.trim() || nombreDestinoNoPropio(row.data.tipo, compromiso)
      if (row.data.tipo === 'cuentas_propias') {
        const creditoId = findCuentaIdByCbu(row.data.cuentaCreditoCbu)
        const credito = creditoId ? cuentasPorId.get(creditoId) : undefined
        destinoLabel = credito
          ? etiquetaCuenta(credito.bancoNombre, credito.tipo)
          : row.data.destinoNombre?.trim() || 'Cuenta propia'
      }
      return {
        id: row.id,
        compromisoPagoId: row.data.compromisoPagoId,
        origen: row.data.origen ?? (row.data.compromisoPagoId ? 'compromiso' : 'directa'),
        tipo: row.data.tipo,
        referencia: row.data.referencia ?? null,
        estado: row.data.estado,
        montoCentavos: row.data.montoCentavos,
        concepto: row.data.concepto,
        fechaConfeccion: agendaTimestampToIso(row.data.fechaConfeccion),
        operationId: row.data.operationId,
        cuentaDebitoId: row.data.cuentaDebitoId,
        direccion: `${debitoLabel} → ${destinoLabel}`,
        erroresInterbanking: row.data.erroresInterbanking,
        puedeCancelar: row.data.estado === 'confeccionada',
        movimientoId: row.data.movimientoId ?? null,
        requiereConfirmacionManual: row.data.requiereConfirmacionManual === true,
        candidatos: (row.data.movimientoCandidatosIds ?? [])
          .map((id) => candidatosPorId.get(id))
          .filter((candidato): candidato is NonNullable<typeof candidato> => Boolean(candidato)),
      }
    })

  return { transferencias }
}

export async function getTransferenciaHistorialApi(transferenciaId: string) {
  const row = await getTransferenciaDocument(transferenciaId.trim())
  if (!row) return null
  const historial = await listTransferenciaHistorial(transferenciaId.trim())
  return historial.map((item) => ({
    id: item.id,
    estadoAnterior: item.data.estadoAnterior,
    estadoNuevo: item.data.estadoNuevo,
    fecha: agendaTimestampToIso(item.data.fecha),
    origen: item.data.origen,
    nota: item.data.nota,
  }))
}
