import { randomUUID } from 'node:crypto'
import { buildMarcarPagadoHistorial } from '../domain/agenda.historial.js'
import { computeVencimientoAlerta } from '../domain/vencimiento.alert.js'
import type { CompromisoPagoDocument, MedioPago } from '../domain/agenda.types.js'
import {
  appendCompromisoHistorial,
  createCompromisoWithHistorial,
  getCompromisoDocument,
  listAllCompromisos,
  listCompromisoHistorial,
  parseDateInput,
  timestampFromDate,
  updateCompromisoPrioridad,
} from './agenda.repository.js'

function tsToDate(value: unknown): Date | null {
  if (!value || typeof value !== 'object') return null
  const maybe = value as { toDate?: () => Date }
  return typeof maybe.toDate === 'function' ? maybe.toDate() : null
}

function tsToIso(value: unknown): string | null {
  const d = tsToDate(value)
  return d ? d.toISOString() : null
}


export async function serializeCompromiso(id: string, data: CompromisoPagoDocument) {
  const fechaVenc = tsToDate(data.fechaVencimiento)
  const alertaVencimiento = fechaVenc
    ? computeVencimientoAlerta({
        fechaVencimiento: fechaVenc,
        estadoPendiente: data.estado === 'pendiente' || data.estado === 'vencido',
      })
    : 'neutro'

  const cheque = null

  return {
    id,
    concepto: data.concepto,
    proveedorONombre: data.proveedorONombre,
    montoCentavos: data.montoCentavos,
    fechaVencimiento: tsToIso(data.fechaVencimiento),
    prioridad: data.prioridad ?? 0,
    medioPago: data.medioPago,
    chequeId: data.chequeId,
    cheque,
    estado: data.estado,
    cuentaId: data.cuentaId ?? null,
    fechaPago: tsToIso(data.fechaPago),
    pagadoPor: data.pagadoPor,
    alertaVencimiento,
    createdAt: tsToIso(data.createdAt),
    updatedAt: tsToIso(data.updatedAt),
  }
}

export async function listCompromisosAgenda() {
  const rows = await listAllCompromisos()
  const pendientes = rows.filter(
    ({ data }) => data.estado === 'pendiente' || data.estado === 'vencido',
  )

  pendientes.sort((a, b) => {
    const pa = a.data.prioridad ?? 0
    const pb = b.data.prioridad ?? 0
    if (pa !== pb) return pa - pb
    const da = tsToDate(a.data.fechaVencimiento)?.getTime() ?? 0
    const db = tsToDate(b.data.fechaVencimiento)?.getTime() ?? 0
    return da - db
  })

  return Promise.all(pendientes.map(({ id, data }) => serializeCompromiso(id, data)))
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
  const prioridad = typeof input.body.prioridad === 'number' ? input.body.prioridad : 0
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

  if (!concepto || !proveedorONombre || !fechaVencimiento) {
    throw new Error('Faltan campos del compromiso')
  }
  if (typeof montoCentavos !== 'number' || !Number.isInteger(montoCentavos) || montoCentavos <= 0) {
    throw new Error('montoCentavos inválido')
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
      prioridad,
      medioPago: chequeId ? 'cheque' : medioPago,
      chequeId,
      estado: 'pendiente',
      createdBy: input.actorUid,
    },
  })

  const created = await getCompromisoDocument(id)
  if (!created) throw new Error('No se pudo leer el compromiso creado')
  return serializeCompromiso(id, created)
}

export async function patchCompromisoPrioridad(compromisoId: string, prioridad: number) {
  if (!Number.isFinite(prioridad)) throw new Error('prioridad inválida')
  await updateCompromisoPrioridad(compromisoId, Math.round(prioridad))
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
    fecha: tsToIso(data.fecha),
    usuario: data.usuario,
    nota: data.nota,
  }))
}
