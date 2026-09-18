import { randomUUID } from 'node:crypto'
import { buildAgendaHistorialEntry } from '../domain/agenda.historial.js'
import { computeVencimientoAlerta } from '../domain/vencimiento.alert.js'
import type { CobroEsperadoDocument } from '../domain/agenda.types.js'
import {
  appendCobroHistorial,
  createCobroWithHistorial,
  getCobroDocument,
  listAllCobros,
  listCobroHistorial,
  parseDateInput,
  timestampFromDate,
  updateCobroPrioridad,
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


export async function serializeCobro(id: string, data: CobroEsperadoDocument) {
  const fechaEsp = tsToDate(data.fechaEsperada)
  const alertaVencimiento = fechaEsp
    ? computeVencimientoAlerta({
        fechaVencimiento: fechaEsp,
        estadoPendiente: data.estado === 'esperado',
      })
    : 'neutro'

  const cheque = null

  return {
    id,
    clienteONombre: data.clienteONombre,
    montoCentavos: data.montoCentavos,
    fechaEsperada: tsToIso(data.fechaEsperada),
    prioridad: data.prioridad ?? 0,
    chequeId: data.chequeId,
    cheque,
    estado: data.estado,
    cuentaId: data.cuentaId ?? null,
    fechaConfirmado: tsToIso(data.fechaConfirmado),
    confirmadoPor: data.confirmadoPor,
    alertaVencimiento,
    createdAt: tsToIso(data.createdAt),
    updatedAt: tsToIso(data.updatedAt),
  }
}

export async function listCobrosAgenda() {
  const rows = await listAllCobros()
  const abiertos = rows.filter(({ data }) => data.estado === 'esperado')

  abiertos.sort((a, b) => {
    const pa = a.data.prioridad ?? 0
    const pb = b.data.prioridad ?? 0
    if (pa !== pb) return pa - pb
    const da = tsToDate(a.data.fechaEsperada)?.getTime() ?? 0
    const db = tsToDate(b.data.fechaEsperada)?.getTime() ?? 0
    return da - db
  })

  return Promise.all(abiertos.map(({ id, data }) => serializeCobro(id, data)))
}

export async function createCobroAgenda(input: {
  actorUid: string
  body: Record<string, unknown>
}) {
  const clienteONombre =
    typeof input.body.clienteONombre === 'string' ? input.body.clienteONombre.trim() : ''
  const montoCentavos = input.body.montoCentavos
  const fechaEsperada = parseDateInput(input.body.fechaEsperada)
  const prioridad = typeof input.body.prioridad === 'number' ? input.body.prioridad : 0
  const chequeId =
    typeof input.body.chequeId === 'string' && input.body.chequeId.trim()
      ? input.body.chequeId.trim()
      : null
  const nota = typeof input.body.nota === 'string' ? input.body.nota.trim() : null

  if (!clienteONombre || !fechaEsperada) throw new Error('Faltan campos del cobro')
  if (typeof montoCentavos !== 'number' || !Number.isInteger(montoCentavos) || montoCentavos <= 0) {
    throw new Error('montoCentavos inválido')
  }

  const id = randomUUID()
  await createCobroWithHistorial({
    id,
    usuario: input.actorUid,
    nota,
    doc: {
      clienteONombre,
      montoCentavos,
      fechaEsperada: timestampFromDate(fechaEsperada),
      prioridad,
      chequeId,
      estado: 'esperado',
      createdBy: input.actorUid,
    },
  })

  const created = await getCobroDocument(id)
  if (!created) throw new Error('No se pudo leer el cobro creado')
  return serializeCobro(id, created)
}

export async function patchCobroPrioridad(cobroId: string, prioridad: number) {
  if (!Number.isFinite(prioridad)) throw new Error('prioridad inválida')
  await updateCobroPrioridad(cobroId, Math.round(prioridad))
  const doc = await getCobroDocument(cobroId)
  if (!doc) throw new Error('Cobro no encontrado')
  return serializeCobro(cobroId, doc)
}

export async function confirmarCobro(cobroId: string, actorUid: string, body: Record<string, unknown>) {
  const current = await getCobroDocument(cobroId)
  if (!current) throw new Error('Cobro no encontrado')
  if (current.estado === 'confirmado') throw new Error('El cobro ya está confirmado')

  const cuentaId =
    typeof body.cuentaId === 'string' && body.cuentaId.trim() ? body.cuentaId.trim() : null
  const fechaConfirmado = parseDateInput(body.fechaConfirmado) ?? new Date()
  const nota = typeof body.nota === 'string' ? body.nota.trim() : null

  if (!cuentaId) throw new Error('cuentaId es obligatorio al confirmar un cobro')

  const historial = buildAgendaHistorialEntry({
    estadoAnterior: current.estado,
    estadoNuevo: 'confirmado',
    usuario: actorUid,
    nota: nota ?? 'Cobro confirmado',
  })

  await appendCobroHistorial({
    cobroId,
    historial,
    patch: {
      estado: 'confirmado',
      cuentaId,
      fechaConfirmado: timestampFromDate(fechaConfirmado),
      confirmadoPor: actorUid,
    },
  })

  const updated = await getCobroDocument(cobroId)
  if (!updated) throw new Error('Cobro no encontrado')
  return serializeCobro(cobroId, updated)
}

export async function getCobroHistorialApi(cobroId: string) {
  const doc = await getCobroDocument(cobroId)
  if (!doc) return null
  const rows = await listCobroHistorial(cobroId)
  return rows.map(({ id, data }) => ({
    id,
    estadoAnterior: data.estadoAnterior,
    estadoNuevo: data.estadoNuevo,
    fecha: tsToIso(data.fecha),
    usuario: data.usuario,
    nota: data.nota,
  }))
}
