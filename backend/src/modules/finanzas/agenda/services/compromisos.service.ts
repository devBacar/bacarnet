import { randomUUID } from 'node:crypto'
import { buildAgendaHistorialEntry } from '../domain/agenda.historial.js'
import { computeVencimientoAlerta, dateKeyInArgentina } from '../domain/vencimiento.alert.js'
import {
  compareAgendaByUrgenciaThenFecha,
  parsePrioridadUrgencia,
  type PrioridadUrgencia,
} from '../domain/agenda.prioridad.js'
import {
  filterCompromisosByVista,
  type CompromisosAgendaVista,
} from '../domain/agenda.listFilters.js'
import { agendaTimestampToDate, agendaTimestampToIso } from '../domain/agendaTimestamps.js'
import {
  leerAltaPlanilla,
  leerEdicionCompromiso,
  normalizarCentavosOpcional,
  normalizarCuota,
  normalizarGrupo,
  normalizarMoneda,
  normalizarObservacion,
  parseFechaDia,
} from '../domain/compromiso-campos.js'
import type { CompromisoPagoDocument, MedioPago } from '../domain/agenda.types.js'
import {
  acumuladoDePagos,
  leerMontoSolicitado,
  listarPagos,
  pagadoLegacyCompleto,
  restanteAPagarCentavos,
  estadoTrasEditarImporte,
} from '../domain/pago-compromiso.js'
import {
  aplicarTransferenciaHecha,
  aplicarTransferenciaRechazada,
  listarTransferenciasEnFirma,
  montoEnFirmaCentavos,
} from '../../hoy/domain/transferencia-en-firma.js'
import {
  appendCompromisoHistorial,
  commitPagoCompromiso,
  createCompromisoWithHistorial,
  getCompromisoDocument,
  listAllCompromisos,
  listCompromisoHistorial,
  timestampFromDate,
  updateCompromisoUrgencia,
} from './agenda.repository.js'

export type { CompromisosAgendaVista } from '../domain/agenda.listFilters.js'


export async function serializeCompromiso(id: string, data: CompromisoPagoDocument) {
  const pagos = listarPagos(data.pagos)
  const acumuladoCentavos = pagadoLegacyCompleto({ estado: data.estado, pagos })
    ? data.montoCentavos
    : acumuladoDePagos(pagos)
  const fechaVenc = agendaTimestampToDate(data.fechaVencimiento)
  const alertaVencimiento = fechaVenc
    ? computeVencimientoAlerta({
        fechaVencimiento: fechaVenc,
        estadoPendiente:
          data.estado === 'pendiente' ||
          data.estado === 'vencido' ||
          data.estado === 'confeccionada_pendiente_autorizacion',
      })
    : 'neutro'

  const cheque = null

  return {
    id,
    concepto: data.concepto,
    proveedorONombre: data.proveedorONombre,
    montoCentavos: data.montoCentavos,
    fechaVencimiento: agendaTimestampToIso(data.fechaVencimiento),
    urgenciaManual: parsePrioridadUrgencia(data.urgenciaManual) ?? null,
    medioPago: data.medioPago,
    chequeId: data.chequeId,
    cheque,
    transferenciaConfeccionadaId: data.transferenciaConfeccionadaId ?? null,
    estado: data.estado,
    cuentaId: data.cuentaId ?? null,
    fechaPago: agendaTimestampToIso(data.fechaPago),
    pagadoPor: data.pagadoPor,
    esViatico: data.esViatico === true,
    beneficiarioEmpleado: data.beneficiarioEmpleado ?? null,
    grupo: normalizarGrupo(data.grupo),
    moneda: normalizarMoneda(data.moneda),
    deudaTotalCentavos: normalizarCentavosOpcional(data.deudaTotalCentavos),
    cuotaNumero: normalizarCuota(data.cuotaNumero, data.cuotaTotal).cuotaNumero,
    cuotaTotal: normalizarCuota(data.cuotaNumero, data.cuotaTotal).cuotaTotal,
    observacion: normalizarObservacion(data.observacion),
    pagos: listarPagos(data.pagos).map((pago) => ({
      ...pago,
      registradoAt: agendaTimestampToIso(pago.registradoAt),
    })),
    acumuladoCentavos,
    restanteCentavos: restanteAPagarCentavos({
      estado: data.estado,
      montoCentavos: data.montoCentavos,
      pagos,
    }),
    enFirmaCentavos: montoEnFirmaCentavos(listarTransferenciasEnFirma(data.transferenciasEnFirma)),
    alertaVencimiento,
    origen: data.origen ?? null,
    vientri: data.vientri ?? null,
    createdAt: agendaTimestampToIso(data.createdAt),
    updatedAt: agendaTimestampToIso(data.updatedAt),
  }
}

export async function listCompromisosAgenda(vista: CompromisosAgendaVista = 'pendientes') {
  const rows = await listAllCompromisos()

  const filtered = filterCompromisosByVista(rows, vista)

  if (vista === 'pagados') {
    filtered.sort((a, b) => {
      const da =
        agendaTimestampToDate(a.data.fechaPago)?.getTime() ??
        agendaTimestampToDate(a.data.updatedAt)?.getTime() ??
        0
      const db =
        agendaTimestampToDate(b.data.fechaPago)?.getTime() ??
        agendaTimestampToDate(b.data.updatedAt)?.getTime() ??
        0
      return db - da
    })
    return Promise.all(filtered.map(({ id, data }) => serializeCompromiso(id, data)))
  }

  filtered.sort((a, b) => {
    const da = agendaTimestampToDate(a.data.fechaVencimiento)?.getTime() ?? 0
    const db = agendaTimestampToDate(b.data.fechaVencimiento)?.getTime() ?? 0
    return compareAgendaByUrgenciaThenFecha(
      parsePrioridadUrgencia(a.data.urgenciaManual),
      da,
      parsePrioridadUrgencia(b.data.urgenciaManual),
      db,
    )
  })

  return Promise.all(filtered.map(({ id, data }) => serializeCompromiso(id, data)))
}

export async function createCompromisoAgenda(input: {
  actorUid: string
  body: Record<string, unknown>
}) {
  const concepto = typeof input.body.concepto === 'string' ? input.body.concepto.trim() : ''
  const proveedorONombre =
    typeof input.body.proveedorONombre === 'string' ? input.body.proveedorONombre.trim() : ''
  const montoCentavos = input.body.montoCentavos
  const fechaVencimiento = parseFechaDia(input.body.fechaVencimiento)
  const planilla = leerAltaPlanilla(input.body)
  const urgenciaManual =
    input.body.urgenciaManual === null || input.body.urgenciaManual === ''
      ? null
      : parsePrioridadUrgencia(input.body.urgenciaManual)
  const medioRaw = input.body.medioPago
  const medioPago: MedioPago =
    medioRaw === 'transferencia' || medioRaw === 'efectivo' || medioRaw === 'cheque'
      ? medioRaw
      : 'transferencia'
  const chequeId =
    typeof input.body.chequeId === 'string' && input.body.chequeId.trim()
      ? input.body.chequeId.trim()
      : null
  const nota = typeof input.body.nota === 'string' ? input.body.nota.trim() : null
  const esViatico = input.body.esViatico === true
  const beneficiarioEmpleado =
    typeof input.body.beneficiarioEmpleado === 'string'
      ? input.body.beneficiarioEmpleado.trim() || null
      : null

  if (!concepto || !proveedorONombre || !fechaVencimiento) {
    throw new Error('Faltan campos del compromiso')
  }
  if (typeof montoCentavos !== 'number' || !Number.isInteger(montoCentavos) || montoCentavos <= 0) {
    throw new Error('montoCentavos inválido')
  }
  if (esViatico && !beneficiarioEmpleado) {
    throw new Error('Indicá el beneficiario del viático')
  }

  const id = randomUUID()
  await createCompromisoWithHistorial({
    id,
    usuario: input.actorUid,
    nota,
    doc: {
      concepto,
      proveedorONombre,
      montoCentavos,
      fechaVencimiento: timestampFromDate(fechaVencimiento),
      prioridad: 0,
      urgenciaManual,
      medioPago: chequeId ? 'cheque' : medioPago,
      chequeId,
      transferenciaConfeccionadaId: null,
      transferenciasEnFirma: [],
      estado: 'pendiente',
      esViatico,
      beneficiarioEmpleado: esViatico ? beneficiarioEmpleado : null,
      ...planilla,
      createdBy: input.actorUid,
    },
  })

  const created = await getCompromisoDocument(id)
  if (!created) throw new Error('No se pudo leer el compromiso creado')
  return serializeCompromiso(id, created)
}

export async function patchCompromisoUrgencia(
  compromisoId: string,
  urgenciaManual: PrioridadUrgencia | null,
) {
  await updateCompromisoUrgencia(compromisoId, urgenciaManual)
  const doc = await getCompromisoDocument(compromisoId)
  if (!doc) throw new Error('Compromiso no encontrado')
  return serializeCompromiso(compromisoId, doc)
}

export async function registrarPagoCompromiso(input: {
  compromisoId: string
  actorUid: string
  medio: MedioPago
  fecha: Date
  montoSolicitado: number | null
  referenciaId: string | null
  cuentaId: string | null
  chequeId: string | null
  cajaId?: string | null
  transferenciaId?: string | null
  movimientoId?: string | null
  claseCheque?: 'cartera' | 'propio' | null
  marcadoAMano?: boolean
  nota: string | null
  aplicarCuenta: boolean
  siYaPagado: 'error' | 'silencio'
}) {
  const usuario = input.actorUid.trim() || 'sistema'
  const decision = await commitPagoCompromiso({
    compromisoId: input.compromisoId,
    usuario,
    nota: input.nota,
    pago: {
      fecha: dateKeyInArgentina(input.fecha),
      montoSolicitado: input.montoSolicitado,
      medio: input.medio,
      referenciaId: input.referenciaId,
      registradoPor: usuario,
      chequeId: input.chequeId,
      cajaId: input.cajaId ?? null,
      cuentaId: input.cajaId ? null : input.cuentaId,
      transferenciaId: input.transferenciaId ?? null,
      movimientoId: input.movimientoId ?? null,
      claseCheque: input.claseCheque ?? null,
      marcadoAMano: input.marcadoAMano === true,
    },
    cuentaId: input.cuentaId,
    chequeId: input.chequeId,
    aplicarCuenta: input.aplicarCuenta,
  })
  if (decision.tipo === 'ya_pagado') {
    if (input.siYaPagado === 'silencio') return null
    throw new Error('Ese pago ya está hecho')
  }
  const updated = await getCompromisoDocument(input.compromisoId)
  if (!updated) throw new Error('Compromiso no encontrado')
  return serializeCompromiso(input.compromisoId, updated)
}

export async function marcarCompromisoPagado(
  compromisoId: string,
  actorUid: string,
  body: Record<string, unknown>,
) {
  const current = await getCompromisoDocument(compromisoId)
  if (!current) throw new Error('Compromiso no encontrado')
  if (current.estado === 'pagado') throw new Error('El compromiso ya está pagado')
  if (current.estado === 'confeccionada_pendiente_autorizacion') {
    throw new Error(
      'Transferencia confeccionada: el pago se registrará cuando se detecte en el banco (o contactá a sistemas).',
    )
  }
  if (
    current.medioPago === 'transferencia' &&
    (current.estado === 'pendiente' || current.estado === 'vencido')
  ) {
    throw new Error('Para transferencias usá «Confeccionar por API» en lugar de marcar pagado a mano')
  }

  const medioRaw = body.medioPago
  const medioPago: MedioPago =
    medioRaw === 'transferencia' || medioRaw === 'efectivo' || medioRaw === 'cheque'
      ? medioRaw
      : current.medioPago

  const cuentaId =
    typeof body.cuentaId === 'string' && body.cuentaId.trim() ? body.cuentaId.trim() : null
  const fechaPago = parseFechaDia(body.fechaPago) ?? new Date()
  const nota = typeof body.nota === 'string' ? body.nota.trim() : null

  if ((medioPago === 'transferencia' || medioPago === 'efectivo') && !cuentaId) {
    throw new Error('cuentaId es obligatorio para transferencia o efectivo')
  }

  const compromiso = await registrarPagoCompromiso({
    compromisoId,
    actorUid,
    medio: medioPago,
    fecha: fechaPago,
    montoSolicitado: leerMontoSolicitado(body.montoCentavos),
    referenciaId: null,
    cuentaId: medioPago === 'cheque' ? current.cuentaId : cuentaId,
    chequeId: null,
    marcadoAMano: true,
    nota: nota ?? `Pago vía ${medioPago}`,
    aplicarCuenta: true,
    siYaPagado: 'error',
  })
  if (!compromiso) throw new Error('El compromiso ya está pagado')
  return compromiso
}

function fechaDesdeDiaArgentina(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const fecha = new Date(`${ymd}T12:00:00-03:00`)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

/** La transferencia ya figura hecha en el banco: se anota el pago por el monto de esa transferencia. */
export async function marcarCompromisoPagadoPorTransferenciaHecha(input: {
  compromisoId: string
  actorUid: string
  cuentaId: string | null
  nota: string
  transferenciaId?: string | null
  montoCentavos?: number | null
}): Promise<void> {
  const current = await getCompromisoDocument(input.compromisoId)
  if (!current || current.estado === 'pagado') return
  const transferenciaId = input.transferenciaId?.trim() ?? ''
  const aplicado = aplicarTransferenciaHecha(
    {
      estado: current.estado,
      montoCentavos: current.montoCentavos,
      pagos: listarPagos(current.pagos),
      transferenciasEnFirma: listarTransferenciasEnFirma(current.transferenciasEnFirma),
      transferenciaConfeccionadaId: current.transferenciaConfeccionadaId ?? null,
    },
    {
      transferenciaId,
      montoCentavos: input.montoCentavos ?? 0,
      fecha: dateKeyInArgentina(new Date()),
      registradoPor: input.actorUid.trim() || 'sistema',
      registradoAt: null,
    },
  )
  const montoSolicitado =
    aplicado.decision.tipo === 'aplicado' ? aplicado.decision.montoCentavos : aplicado.montoRegistrado
  if (aplicado.decision.tipo === 'ya_pagado' || montoSolicitado <= 0) {
    if (transferenciaId) {
      await guardarTransferenciasEnFirma(input.compromisoId, input.actorUid, aplicado.transferenciasEnFirma, input.nota)
    }
    return
  }
  await registrarPagoCompromiso({
    compromisoId: input.compromisoId,
    actorUid: input.actorUid,
    medio: 'transferencia',
    fecha: new Date(),
    montoSolicitado,
    referenciaId: transferenciaId || null,
    transferenciaId: transferenciaId || null,
    cuentaId: input.cuentaId ?? current.cuentaId,
    chequeId: null,
    nota: input.nota,
    aplicarCuenta: true,
    siYaPagado: 'silencio',
  })
  if (transferenciaId) {
    await guardarTransferenciasEnFirma(input.compromisoId, input.actorUid, aplicado.transferenciasEnFirma, input.nota)
  }
}

/** El banco rechazó o se anuló la transferencia: el monto reservado vuelve a faltar. */
export async function liberarTransferenciaDelCompromiso(input: {
  compromisoId: string
  transferenciaId: string
  actorUid: string
  nota: string
}): Promise<void> {
  const current = await getCompromisoDocument(input.compromisoId)
  if (!current || current.estado === 'pagado') return
  const siguiente = aplicarTransferenciaRechazada(
    {
      estado: current.estado,
      transferenciaConfeccionadaId: current.transferenciaConfeccionadaId ?? null,
      transferenciasEnFirma: listarTransferenciasEnFirma(current.transferenciasEnFirma),
    },
    input.transferenciaId,
  )
  if (!siguiente.cambio) return
  await appendCompromisoHistorial({
    compromisoId: input.compromisoId,
    historial: buildAgendaHistorialEntry({
      estadoAnterior: current.estado,
      estadoNuevo: siguiente.estado,
      usuario: input.actorUid.trim() || 'sistema',
      nota: input.nota,
    }),
    patch: {
      estado: siguiente.estado,
      transferenciaConfeccionadaId: siguiente.transferenciaConfeccionadaId,
      transferenciasEnFirma: siguiente.transferenciasEnFirma,
    },
  })
}

async function guardarTransferenciasEnFirma(
  compromisoId: string,
  actorUid: string,
  transferenciasEnFirma: Array<{ transferenciaId: string; montoCentavos: number }>,
  nota: string,
): Promise<void> {
  const current = await getCompromisoDocument(compromisoId)
  if (!current) return
  await appendCompromisoHistorial({
    compromisoId,
    historial: buildAgendaHistorialEntry({
      estadoAnterior: current.estado,
      estadoNuevo: current.estado,
      usuario: actorUid.trim() || 'sistema',
      nota,
    }),
    patch: { transferenciasEnFirma },
  })
}

/** "Ya lo pagué" desde Hoy: permite banco, efectivo o cheque, incluso si estaba previsto por banco. */
export async function marcarCompromisoYaPagado(
  compromisoId: string,
  actorUid: string,
  body: Record<string, unknown>,
) {
  const current = await getCompromisoDocument(compromisoId)
  if (!current) throw new Error('No encontré ese pago')
  if (current.estado === 'pagado') throw new Error('Ese pago ya está hecho')
  if (current.estado === 'confeccionada_pendiente_autorizacion') {
    throw new Error(
      'Esta transferencia ya está armada y esperando firma. Cuando el banco la confirme, se marca sola.',
    )
  }

  const medioRaw = body.medioPago
  const medioPago: MedioPago =
    medioRaw === 'transferencia' || medioRaw === 'efectivo' || medioRaw === 'cheque'
      ? medioRaw
      : current.medioPago
  const cuentaId =
    typeof body.cuentaId === 'string' && body.cuentaId.trim() ? body.cuentaId.trim() : null
  const fechaTexto = typeof body.fechaPago === 'string' ? body.fechaPago.trim() : ''
  const fechaPago =
    fechaDesdeDiaArgentina(fechaTexto.slice(0, 10)) ?? parseFechaDia(body.fechaPago) ?? new Date()
  const movimientoId = typeof body.movimientoId === 'string' ? body.movimientoId.trim() : ''
  const chequeId =
    typeof body.chequeId === 'string' && body.chequeId.trim() ? body.chequeId.trim() : null
  const cajaId = typeof body.cajaId === 'string' && body.cajaId.trim() ? body.cajaId.trim() : null
  const claseCheque = body.claseCheque === 'cartera' || body.claseCheque === 'propio' ? body.claseCheque : null
  const marcadoAMano = body.marcadoAMano === true
  if (medioPago === 'transferencia' && !cuentaId) {
    throw new Error('Elegí el banco o el movimiento que coincide')
  }

  const notaBase =
    typeof body.nota === 'string' && body.nota.trim()
      ? body.nota.trim()
      : `Pago registrado (${medioPago})`
  const nota = movimientoId ? `${notaBase}. Movimiento del banco ${movimientoId}.` : notaBase
  const referenciaId = movimientoId || chequeId

  const compromiso = await registrarPagoCompromiso({
    compromisoId,
    actorUid,
    medio: medioPago,
    fecha: fechaPago,
    montoSolicitado: leerMontoSolicitado(body.montoCentavos),
    referenciaId,
    cuentaId: medioPago === 'cheque' ? current.cuentaId : cuentaId,
    chequeId,
    cajaId,
    movimientoId: movimientoId || null,
    claseCheque,
    marcadoAMano,
    nota,
    aplicarCuenta: true,
    siYaPagado: 'error',
  })
  if (!compromiso) throw new Error('Ese pago ya está hecho')
  return compromiso
}

export async function reprogramarCompromiso(compromisoId: string, actorUid: string, fechaYmd: string) {
  const fecha = fechaDesdeDiaArgentina(fechaYmd)
  if (!fecha) throw new Error('Elegí el día')
  const current = await getCompromisoDocument(compromisoId)
  if (!current) throw new Error('No encontré ese pago')
  if (current.estado === 'pagado') throw new Error('Ese pago ya está hecho')
  if (current.estado === 'confeccionada_pendiente_autorizacion') {
    throw new Error('Esa transferencia ya está armada. No se puede cambiar el día.')
  }

  await appendCompromisoHistorial({
    compromisoId,
    historial: buildAgendaHistorialEntry({
      estadoAnterior: current.estado,
      estadoNuevo: current.estado,
      usuario: actorUid,
      nota: `Pasado al ${fechaYmd}`,
    }),
    patch: { fechaVencimiento: timestampFromDate(fecha) },
  })

  const updated = await getCompromisoDocument(compromisoId)
  if (!updated) throw new Error('No encontré ese pago')
  return serializeCompromiso(compromisoId, updated)
}

export async function patchCompromisoAgenda(
  compromisoId: string,
  actorUid: string,
  body: Record<string, unknown>,
) {
  const current = await getCompromisoDocument(compromisoId)
  if (!current) throw new Error('Compromiso no encontrado')
  const cambios = leerEdicionCompromiso(body)
  if (current.origen === 'vientri') {
    const tocaDatosDeVientri =
      (cambios.concepto != null && cambios.concepto !== current.concepto) ||
      (cambios.proveedorONombre != null && cambios.proveedorONombre !== current.proveedorONombre) ||
      (cambios.montoCentavos != null && cambios.montoCentavos !== current.montoCentavos) ||
      (cambios.moneda != null && cambios.moneda !== (current.moneda ?? 'ARS'))
    if (tocaDatosDeVientri) {
      throw new Error('Este pago viene de Vientri: el comprobante, el proveedor, el importe y la moneda se corrigen en Vientri.')
    }
  }
  const bloqueado = current.estado === 'confeccionada_pendiente_autorizacion'
  if (
    bloqueado &&
    (cambios.montoCentavos != null || cambios.fechaVencimiento != null || cambios.medioPago != null)
  ) {
    throw new Error('Esa transferencia ya está armada. No se puede cambiar el importe, la fecha ni el medio.')
  }
  if (cambios.esViatico === true) {
    const beneficiario =
      cambios.beneficiarioEmpleado !== undefined ? cambios.beneficiarioEmpleado : current.beneficiarioEmpleado
    if (!beneficiario) throw new Error('Indicá el beneficiario del viático')
  }

  let estado = current.estado
  let reabre = false
  if (cambios.montoCentavos != null) {
    const decision = estadoTrasEditarImporte({
      estado: current.estado,
      pagos: listarPagos(current.pagos),
      montoNuevo: cambios.montoCentavos,
    })
    estado = decision.estado
    reabre = decision.reabre
  }

  const patch: Partial<CompromisoPagoDocument> = {}
  if (cambios.concepto != null) patch.concepto = cambios.concepto
  if (cambios.proveedorONombre != null) patch.proveedorONombre = cambios.proveedorONombre
  if (cambios.montoCentavos != null) patch.montoCentavos = cambios.montoCentavos
  if (cambios.fechaVencimiento) patch.fechaVencimiento = timestampFromDate(cambios.fechaVencimiento)
  if (cambios.medioPago) patch.medioPago = cambios.medioPago
  if (cambios.urgenciaManual !== undefined) patch.urgenciaManual = cambios.urgenciaManual
  if (cambios.esViatico !== undefined) patch.esViatico = cambios.esViatico
  if (cambios.beneficiarioEmpleado !== undefined) patch.beneficiarioEmpleado = cambios.beneficiarioEmpleado
  if (cambios.grupo) patch.grupo = cambios.grupo
  if (cambios.moneda) patch.moneda = cambios.moneda
  if (cambios.deudaTotalCentavos !== undefined) patch.deudaTotalCentavos = cambios.deudaTotalCentavos
  if (cambios.cuotaNumero !== undefined) patch.cuotaNumero = cambios.cuotaNumero
  if (cambios.cuotaTotal !== undefined) patch.cuotaTotal = cambios.cuotaTotal
  if (cambios.observacion !== undefined) patch.observacion = cambios.observacion
  if (reabre) {
    patch.estado = 'pendiente'
    patch.fechaPago = null
    patch.pagadoPor = null
  } else if (estado !== current.estado) {
    patch.estado = estado
    if (estado === 'pagado' && !current.fechaPago) {
      patch.fechaPago = timestampFromDate(new Date())
      patch.pagadoPor = actorUid
    }
  }

  await appendCompromisoHistorial({
    compromisoId,
    historial: buildAgendaHistorialEntry({
      estadoAnterior: current.estado,
      estadoNuevo: patch.estado ?? current.estado,
      usuario: actorUid,
      nota: reabre ? 'El importe quedó por encima de lo pagado: vuelve a pendiente.' : 'Edición del compromiso',
    }),
    patch,
  })

  const updated = await getCompromisoDocument(compromisoId)
  if (!updated) throw new Error('Compromiso no encontrado')
  return serializeCompromiso(compromisoId, updated)
}

export async function getCompromisoHistorialApi(compromisoId: string) {
  const doc = await getCompromisoDocument(compromisoId)
  if (!doc) return null
  const rows = await listCompromisoHistorial(compromisoId)
  return rows.map(({ id, data }) => ({
    id,
    estadoAnterior: data.estadoAnterior,
    estadoNuevo: data.estadoNuevo,
    fecha: agendaTimestampToIso(data.fecha),
    usuario: data.usuario,
    nota: data.nota,
  }))
}
