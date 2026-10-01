import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { agendaTimestampToDate } from '../../agenda/domain/agendaTimestamps.js'
import type { CompromisoPagoDocument } from '../../agenda/domain/agenda.types.js'
import { COMPROMISOS_COLLECTION } from '../../agenda/services/agenda.repository.js'
import { movimientosBancariosCollection } from '../../movimientos/services/movimientos.repository.js'
import type { MovimientoBancarioDocument } from '../../movimientos/domain/movimiento-bancario.types.js'
import {
  clasificarCandidatos,
  fechaDentroDeVentana,
  mismosIds,
  sumarDiasIso,
  VENTANA_DIAS_RECONCILIACION,
} from '../domain/reconciliacion.rules.js'
import type {
  TransferenciaConfeccionadaDocument,
  TransferenciaHistorialOrigen,
} from '../domain/transferencia.types.js'
import { transferenciasCollection } from './transferencias.repository.js'

const TZ = 'America/Argentina/Buenos_Aires'
const HISTORIAL_COMPROMISO = 'historialEstados'
const HISTORIAL_TRANSFERENCIA = 'historialEstados'

export interface ReconciliacionResultado {
  revisadas: number
  efectivizadas: number
  sinCandidato: number
  requierenConfirmacion: number
  reservasReanudadas: number
}

export interface MovimientoCandidatoResumen {
  id: string
  fechaProceso: string
  montoCentavos: number
  descripcion: string
}

export class ReconciliacionError extends Error {
  readonly status: number
  readonly code: 'no_encontrada' | 'estado' | 'no_candidato' | 'ocupado' | 'compromiso'

  constructor(
    message: string,
    status: number,
    code: ReconciliacionError['code'],
  ) {
    super(message)
    this.name = 'ReconciliacionError'
    this.status = status
    this.code = code
  }
}

interface CandidatoLibre {
  id: string
  fechaProceso: string
  montoCentavos: number
  descripcion: string
}

function diaArgentina(value: unknown): string | null {
  const date = agendaTimestampToDate(value)
  if (!date) return null
  return date.toLocaleDateString('en-CA', { timeZone: TZ })
}

function timestampDiaArgentina(iso: string): Timestamp {
  return Timestamp.fromDate(new Date(`${iso}T12:00:00-03:00`))
}

async function buscarCandidatos(input: {
  cuentaId: string
  montoCentavos: number
  diaConfeccion: string
  ocupados: Set<string>
}): Promise<CandidatoLibre[]> {
  const hasta = sumarDiasIso(input.diaConfeccion, VENTANA_DIAS_RECONCILIACION)
  const snap = await movimientosBancariosCollection()
    .where('cuentaId', '==', input.cuentaId)
    .where('tipo', '==', 'debito')
    .where('fechaProceso', '>=', input.diaConfeccion)
    .where('fechaProceso', '<=', hasta)
    .get()

  const libres: CandidatoLibre[] = []
  for (const doc of snap.docs) {
    const data = doc.data() as MovimientoBancarioDocument
    if (data.montoCentavos !== input.montoCentavos) continue
    if (!fechaDentroDeVentana(data.fechaProceso, input.diaConfeccion)) continue
    if (data.reservadoPorTransferenciaId) continue
    if (input.ocupados.has(doc.id)) continue
    libres.push({
      id: doc.id,
      fechaProceso: data.fechaProceso,
      montoCentavos: data.montoCentavos,
      descripcion: data.descripcion,
    })
  }
  return libres
}

/**
 * Si un sync reemplazó el día, el débito reservado tiene otro id.
 * Cuando queda un único equivalente, se vuelve a reservar antes de
 * mirar transferencias todavía confeccionadas.
 */
async function reanudarReservas(ocupados: Set<string>): Promise<number> {
  const snap = await transferenciasCollection().where('estado', '==', 'efectivizada').get()
  let reanudadas = 0

  for (const doc of snap.docs) {
    const data = doc.data() as TransferenciaConfeccionadaDocument
    const movimientoId = data.movimientoId?.trim()
    if (!movimientoId) continue

    const movSnap = await movimientosBancariosCollection().doc(movimientoId).get()
    if (movSnap.exists) {
      ocupados.add(movimientoId)
      const actual = (movSnap.data() as MovimientoBancarioDocument).reservadoPorTransferenciaId
      if (actual !== doc.id) {
        await movSnap.ref.update({ reservadoPorTransferenciaId: doc.id })
      }
      continue
    }

    const dia = diaArgentina(data.fechaConfeccion)
    if (!dia) continue
    const libres = await buscarCandidatos({
      cuentaId: data.cuentaDebitoId,
      montoCentavos: data.montoCentavos,
      diaConfeccion: dia,
      ocupados,
    })
    if (libres.length !== 1) continue

    const nuevoId = libres[0].id
    const aplicada = await adminDb().runTransaction(async (tx) => {
      const movRef = movimientosBancariosCollection().doc(nuevoId)
      const mov = await tx.get(movRef)
      const transferencia = await tx.get(doc.ref)
      if (!mov.exists || !transferencia.exists) return false
      const movData = mov.data() as MovimientoBancarioDocument
      if (movData.reservadoPorTransferenciaId && movData.reservadoPorTransferenciaId !== doc.id) {
        return false
      }
      tx.update(doc.ref, {
        movimientoId: nuevoId,
        updatedAt: FieldValue.serverTimestamp(),
      })
      tx.update(movRef, { reservadoPorTransferenciaId: doc.id })
      return true
    })
    if (!aplicada) continue
    ocupados.add(nuevoId)
    reanudadas += 1
  }

  return reanudadas
}

async function efectivizarConMovimiento(input: {
  transferenciaId: string
  movimientoId: string
  actorUid: string
  origen: TransferenciaHistorialOrigen
  nota: string
}): Promise<void> {
  const transferenciaRef = transferenciasCollection().doc(input.transferenciaId)
  const movimientoRef = movimientosBancariosCollection().doc(input.movimientoId)
  const now = Timestamp.now()

  await adminDb().runTransaction(async (tx) => {
    const transferenciaSnap = await tx.get(transferenciaRef)
    if (!transferenciaSnap.exists) {
      throw new ReconciliacionError('Transferencia no encontrada', 404, 'no_encontrada')
    }
    const transferencia = transferenciaSnap.data() as TransferenciaConfeccionadaDocument
    if (transferencia.estado !== 'confeccionada') {
      throw new ReconciliacionError('La transferencia ya no está confeccionada', 409, 'estado')
    }

    const movimientoSnap = await tx.get(movimientoRef)
    if (!movimientoSnap.exists) {
      throw new ReconciliacionError('El movimiento ya no existe', 409, 'no_candidato')
    }
    const movimiento = movimientoSnap.data() as MovimientoBancarioDocument
    const dia = diaArgentina(transferencia.fechaConfeccion)
    const coincide =
      movimiento.cuentaId === transferencia.cuentaDebitoId &&
      movimiento.tipo === 'debito' &&
      movimiento.montoCentavos === transferencia.montoCentavos &&
      Boolean(dia) &&
      fechaDentroDeVentana(movimiento.fechaProceso, dia!)
    if (!coincide) {
      throw new ReconciliacionError('El movimiento no coincide con la transferencia', 409, 'no_candidato')
    }
    if (
      movimiento.reservadoPorTransferenciaId &&
      movimiento.reservadoPorTransferenciaId !== input.transferenciaId
    ) {
      throw new ReconciliacionError('El movimiento ya está reservado', 409, 'ocupado')
    }

    const compromisoId = transferencia.compromisoPagoId?.trim() ?? ''
    const compromisoRef = compromisoId
      ? adminDb().collection(COMPROMISOS_COLLECTION).doc(compromisoId)
      : null
    const compromisoSnap = compromisoRef ? await tx.get(compromisoRef) : null
    if (compromisoRef && !compromisoSnap?.exists) {
      throw new ReconciliacionError('Compromiso de pago no encontrado', 409, 'compromiso')
    }
    const compromiso = compromisoSnap?.exists
      ? (compromisoSnap.data() as CompromisoPagoDocument)
      : null

    tx.update(transferenciaRef, {
      estado: 'efectivizada',
      movimientoId: input.movimientoId,
      fechaDeteccionEfectivizada: now,
      requiereConfirmacionManual: false,
      movimientoCandidatosIds: [],
      updatedAt: FieldValue.serverTimestamp(),
    })
    tx.set(transferenciaRef.collection(HISTORIAL_TRANSFERENCIA).doc(), {
      estadoAnterior: 'confeccionada',
      estadoNuevo: 'efectivizada',
      origen: input.origen,
      nota: input.nota,
      fecha: now,
    })
    tx.update(movimientoRef, { reservadoPorTransferenciaId: input.transferenciaId })

    if (compromiso && compromisoRef && compromiso.estado !== 'pagado') {
      tx.update(compromisoRef, {
        estado: 'pagado',
        medioPago: 'transferencia',
        cuentaId: compromiso.cuentaId ?? transferencia.cuentaDebitoId,
        fechaPago: timestampDiaArgentina(movimiento.fechaProceso),
        pagadoPor: input.actorUid,
        updatedAt: FieldValue.serverTimestamp(),
      })
      tx.set(compromisoRef.collection(HISTORIAL_COMPROMISO).doc(), {
        estadoAnterior: compromiso.estado,
        estadoNuevo: 'pagado',
        usuario: input.actorUid,
        nota: input.nota,
        fecha: now,
      })
    }
  })
}

async function guardarCandidatos(transferenciaId: string, ids: string[]): Promise<void> {
  await transferenciasCollection().doc(transferenciaId).update({
    requiereConfirmacionManual: true,
    movimientoCandidatosIds: ids,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

async function limpiarCandidatos(transferenciaId: string): Promise<void> {
  await transferenciasCollection().doc(transferenciaId).update({
    requiereConfirmacionManual: false,
    movimientoCandidatosIds: [],
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function reconciliarTransferenciasConMovimientos(input: {
  actorUid: string
}): Promise<ReconciliacionResultado> {
  const ocupados = new Set<string>()
  const reservasReanudadas = await reanudarReservas(ocupados)

  const snap = await transferenciasCollection().where('estado', '==', 'confeccionada').get()
  const resultado: ReconciliacionResultado = {
    revisadas: snap.size,
    efectivizadas: 0,
    sinCandidato: 0,
    requierenConfirmacion: 0,
    reservasReanudadas,
  }

  for (const doc of snap.docs) {
    const data = doc.data() as TransferenciaConfeccionadaDocument
    const dia = diaArgentina(data.fechaConfeccion)
    if (!dia) {
      resultado.sinCandidato += 1
      continue
    }

    const libres = await buscarCandidatos({
      cuentaId: data.cuentaDebitoId,
      montoCentavos: data.montoCentavos,
      diaConfeccion: dia,
      ocupados,
    })
    const clasificacion = clasificarCandidatos(libres.length)

    if (clasificacion === 'ninguno') {
      resultado.sinCandidato += 1
      if (data.requiereConfirmacionManual || (data.movimientoCandidatosIds?.length ?? 0) > 0) {
        await limpiarCandidatos(doc.id)
      }
      continue
    }

    if (clasificacion === 'multiple') {
      resultado.requierenConfirmacion += 1
      const ids = libres.map((candidato) => candidato.id)
      if (!data.requiereConfirmacionManual || !mismosIds(data.movimientoCandidatosIds ?? [], ids)) {
        await guardarCandidatos(doc.id, ids)
      }
      continue
    }

    const candidato = libres[0]
    try {
      await efectivizarConMovimiento({
        transferenciaId: doc.id,
        movimientoId: candidato.id,
        actorUid: input.actorUid,
        origen: 'sync_automatico',
        nota: `Efectivizada por el débito ${candidato.fechaProceso} (${candidato.descripcion})`,
      })
      ocupados.add(candidato.id)
      resultado.efectivizadas += 1
    } catch (err) {
      if (err instanceof ReconciliacionError && err.code === 'ocupado') {
        resultado.sinCandidato += 1
        continue
      }
      throw err
    }
  }

  return resultado
}

export async function confirmarMovimientoDeTransferencia(input: {
  transferenciaId: string
  movimientoId: string
  actorUid: string
}): Promise<{ id: string; data: TransferenciaConfeccionadaDocument }> {
  const transferenciaId = input.transferenciaId.trim()
  const movimientoId = input.movimientoId.trim()
  if (!transferenciaId || !movimientoId) {
    throw new ReconciliacionError('Falta la transferencia o el movimiento', 400, 'no_candidato')
  }

  const row = await transferenciasCollection().doc(transferenciaId).get()
  if (!row.exists) {
    throw new ReconciliacionError('Transferencia no encontrada', 404, 'no_encontrada')
  }
  const data = row.data() as TransferenciaConfeccionadaDocument
  if (data.estado !== 'confeccionada') {
    throw new ReconciliacionError('La transferencia ya no está confeccionada', 409, 'estado')
  }
  if (!data.requiereConfirmacionManual) {
    throw new ReconciliacionError('Esta transferencia no espera confirmación manual', 409, 'estado')
  }
  if (!(data.movimientoCandidatosIds ?? []).includes(movimientoId)) {
    throw new ReconciliacionError('Ese movimiento no es candidato de esta transferencia', 409, 'no_candidato')
  }

  const mov = await movimientosBancariosCollection().doc(movimientoId).get()
  const descripcion = mov.exists
    ? ((mov.data() as MovimientoBancarioDocument).descripcion || movimientoId)
    : movimientoId

  await efectivizarConMovimiento({
    transferenciaId,
    movimientoId,
    actorUid: input.actorUid,
    origen: 'usuario',
    nota: `Efectivizada por confirmación manual del débito ${descripcion}`,
  })

  const updated = await transferenciasCollection().doc(transferenciaId).get()
  return { id: transferenciaId, data: updated.data() as TransferenciaConfeccionadaDocument }
}

export async function resumirMovimientosCandidatos(
  ids: string[],
): Promise<Map<string, MovimientoCandidatoResumen>> {
  const unicos = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  const resumen = new Map<string, MovimientoCandidatoResumen>()
  if (unicos.length === 0) return resumen

  const refs = unicos.map((id) => movimientosBancariosCollection().doc(id))
  const snaps = await adminDb().getAll(...refs)
  for (const snap of snaps) {
    if (!snap.exists) continue
    const data = snap.data() as MovimientoBancarioDocument
    resumen.set(snap.id, {
      id: snap.id,
      fechaProceso: data.fechaProceso,
      montoCentavos: data.montoCentavos,
      descripcion: data.descripcion,
    })
  }
  return resumen
}
