import { randomUUID } from 'node:crypto'
import { buildMarcarPagadoHistorial } from '../domain/agenda.historial.js'
import { computeVencimientoAlerta } from '../domain/vencimiento.alert.js'
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
import type { CompromisoPagoDocument, MedioPago } from '../domain/agenda.types.js'
import {
  appendCompromisoHistorial,
  createCompromisoWithHistorial,
  getCompromisoDocument,
  listAllCompromisos,
  listCompromisoHistorial,
  parseDateInput,
  timestampFromDate,
  updateCompromisoUrgencia,
} from './agenda.repository.js'

export type { CompromisosAgendaVista } from '../domain/agenda.listFilters.js'


export async function serializeCompromiso(id: string, data: CompromisoPagoDocument) {
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
    alertaVencimiento,
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
  const fechaVencimiento = parseDateInput(input.body.fechaVencimiento)
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
      estado: 'pendiente',
      esViatico,
      beneficiarioEmpleado: esViatico ? beneficiarioEmpleado : null,
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
  const fechaPago = parseDateInput(body.fechaPago) ?? new Date()
  const nota = typeof body.nota === 'string' ? body.nota.trim() : null

  if ((medioPago === 'transferencia' || medioPago === 'efectivo') && !cuentaId) {
    throw new Error('cuentaId es obligatorio para transferencia o efectivo')
  }

  const historial = buildMarcarPagadoHistorial({
    estadoAnterior: current.estado,
    usuario: actorUid,
    nota: nota ?? `Pagado vía ${medioPago}`,
  })

  await appendCompromisoHistorial({
    compromisoId,
    historial,
    patch: {
      estado: 'pagado',
      medioPago,
      cuentaId: medioPago === 'cheque' ? current.cuentaId : cuentaId,
      fechaPago: timestampFromDate(fechaPago),
      pagadoPor: actorUid,
    },
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
