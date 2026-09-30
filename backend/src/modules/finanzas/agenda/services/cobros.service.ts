import { randomUUID } from 'node:crypto'
import { buildAgendaHistorialEntry } from '../domain/agenda.historial.js'
import { computeVencimientoAlerta } from '../domain/vencimiento.alert.js'
import { compareAgendaByUrgenciaThenFecha, parsePrioridadUrgencia } from '../domain/agenda.prioridad.js'
import type { PrioridadUrgencia } from '../domain/agenda.prioridad.js'
import { filterCobrosByVista, type CobrosAgendaVista } from '../domain/agenda.listFilters.js'
import { agendaTimestampToDate, agendaTimestampToIso } from '../domain/agendaTimestamps.js'
import type { CobroEsperadoDocument } from '../domain/agenda.types.js'
import {
  appendCobroHistorial,
  createCobroWithHistorial,
  getCobroDocument,
  listAllCobros,
  listCobroHistorial,
  parseDateInput,
  timestampFromDate,
  updateCobroUrgencia,
} from './agenda.repository.js'

export type { CobrosAgendaVista } from '../domain/agenda.listFilters.js'


export async function serializeCobro(id: string, data: CobroEsperadoDocument) {
  const fechaEsp = agendaTimestampToDate(data.fechaEsperada)
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
    fechaEsperada: agendaTimestampToIso(data.fechaEsperada),
    urgenciaManual: parsePrioridadUrgencia(data.urgenciaManual) ?? null,
    chequeId: data.chequeId,
    cheque,
    estado: data.estado,
    cuentaId: data.cuentaId ?? null,
    fechaConfirmado: agendaTimestampToIso(data.fechaConfirmado),
    confirmadoPor: data.confirmadoPor,
    alertaVencimiento,
    createdAt: agendaTimestampToIso(data.createdAt),
    updatedAt: agendaTimestampToIso(data.updatedAt),
  }
}

export async function listCobrosAgenda(vista: CobrosAgendaVista = 'esperados') {
  const rows = await listAllCobros()

  const filtered = filterCobrosByVista(rows, vista)

  if (vista === 'cobrados') {
    filtered.sort((a, b) => {
      const da =
        agendaTimestampToDate(a.data.fechaConfirmado)?.getTime() ??
        agendaTimestampToDate(a.data.updatedAt)?.getTime() ??
        0
      const db =
        agendaTimestampToDate(b.data.fechaConfirmado)?.getTime() ??
        agendaTimestampToDate(b.data.updatedAt)?.getTime() ??
        0
      return db - da
    })
    return Promise.all(filtered.map(({ id, data }) => serializeCobro(id, data)))
  }

  filtered.sort((a, b) => {
    const da = agendaTimestampToDate(a.data.fechaEsperada)?.getTime() ?? 0
    const db = agendaTimestampToDate(b.data.fechaEsperada)?.getTime() ?? 0
    return compareAgendaByUrgenciaThenFecha(
      parsePrioridadUrgencia(a.data.urgenciaManual),
      da,
      parsePrioridadUrgencia(b.data.urgenciaManual),
      db,
    )
  })

  return Promise.all(filtered.map(({ id, data }) => serializeCobro(id, data)))
}

export async function createCobroAgenda(input: {
  actorUid: string
  body: Record<string, unknown>
}) {
  const clienteONombre =
    typeof input.body.clienteONombre === 'string' ? input.body.clienteONombre.trim() : ''
  const montoCentavos = input.body.montoCentavos
  const fechaEsperada = parseDateInput(input.body.fechaEsperada)
  const urgenciaManual =
    input.body.urgenciaManual === null || input.body.urgenciaManual === ''
      ? null
      : parsePrioridadUrgencia(input.body.urgenciaManual)
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
      prioridad: 0,
      urgenciaManual,
      chequeId,
      estado: 'esperado',
      createdBy: input.actorUid,
    },
  })

  const created = await getCobroDocument(id)
  if (!created) throw new Error('No se pudo leer el cobro creado')
  return serializeCobro(id, created)
}

export async function patchCobroUrgencia(cobroId: string, urgenciaManual: PrioridadUrgencia | null) {
  await updateCobroUrgencia(cobroId, urgenciaManual)
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

function fechaDesdeDiaArgentina(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const fecha = new Date(`${ymd}T12:00:00-03:00`)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

export async function reprogramarCobro(cobroId: string, actorUid: string, fechaYmd: string) {
  const fecha = fechaDesdeDiaArgentina(fechaYmd)
  if (!fecha) throw new Error('Elegí el día')
  const current = await getCobroDocument(cobroId)
  if (!current) throw new Error('No encontré ese cobro')
  if (current.estado === 'confirmado') throw new Error('Ese cobro ya está confirmado')
  if (current.estado === 'incobrable') throw new Error('Ese cobro está marcado como incobrable')

  await appendCobroHistorial({
    cobroId,
    historial: buildAgendaHistorialEntry({
      estadoAnterior: current.estado,
      estadoNuevo: current.estado,
      usuario: actorUid,
      nota: `Pasado al ${fechaYmd}`,
    }),
    patch: { fechaEsperada: timestampFromDate(fecha) },
  })

  const updated = await getCobroDocument(cobroId)
  if (!updated) throw new Error('No encontré ese cobro')
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
    fecha: agendaTimestampToIso(data.fecha),
    usuario: data.usuario,
    nota: data.nota,
  }))
}
