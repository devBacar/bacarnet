import { adminDb } from '../../../../lib/firebase/admin.js'
import { COMPROMISOS_COLLECTION } from '../../agenda/services/agenda.repository.js'
import { MOVIMIENTOS_COLLECTION } from '../../cajachica/services/caja.repository.js'
import { listarPagos, restanteAPagarCentavos } from '../../agenda/domain/pago-compromiso.js'
import { idCompromisoCuota } from '../domain/agenda-plan.js'
import type { InversionDocumentBase, MonedaInversion } from '../domain/inversion.types.js'
import type { CompromisoDeCuota } from '../domain/vista.js'
import { EnCurso } from '../domain/validar.js'
import { INVERSIONES_COLLECTION } from './inversores.repository.js'

const HISTORIAL_SUB = 'historialEstados'

export interface HistorialEstadoDocument {
  estadoAnterior: string | null
  estadoNuevo: string
  fecha: string
  usuario: string
  usuarioNombre: string | null
  nota: string | null
}

export async function getInversionDoc(id: string): Promise<InversionDocumentBase | null> {
  const snap = await adminDb().collection(INVERSIONES_COLLECTION).doc(id).get()
  return snap.exists ? (snap.data() as InversionDocumentBase) : null
}

/** Crea o reemplaza la inversión y deja la línea de historial en el mismo batch. */
export async function guardarInversionDoc(
  id: string | null,
  data: InversionDocumentBase,
  historial: HistorialEstadoDocument,
): Promise<string> {
  const col = adminDb().collection(INVERSIONES_COLLECTION)
  const ref = id ? col.doc(id) : col.doc()
  const batch = adminDb().batch()
  batch.set(ref, data)
  batch.set(ref.collection(HISTORIAL_SUB).doc(), historial)
  await batch.commit()
  return ref.id
}

export async function listHistorial(id: string): Promise<HistorialEstadoDocument[]> {
  const snap = await adminDb().collection(INVERSIONES_COLLECTION).doc(id).collection(HISTORIAL_SUB).orderBy('fecha', 'desc').get()
  return snap.docs.map((d) => d.data() as HistorialEstadoDocument)
}

/** Compromisos de la Agenda de cada cuota (ids fijos inv-<id>-c<n>). Los anulados no cuentan. */
export async function compromisosDeCuotas(
  inversiones: ReadonlyArray<{ id: string; data: Pick<InversionDocumentBase, 'cronograma'> }>,
): Promise<Map<string, Map<number, CompromisoDeCuota>>> {
  const col = adminDb().collection(COMPROMISOS_COLLECTION)
  const refs = inversiones.flatMap(({ id, data }) =>
    data.cronograma.map((c) => ({ inversionId: id, numero: c.numero, ref: col.doc(idCompromisoCuota(id, c.numero)) })),
  )
  const porInversion = new Map<string, Map<number, CompromisoDeCuota>>()
  if (refs.length === 0) return porInversion
  const snaps = await adminDb().getAll(...refs.map((r) => r.ref))
  snaps.forEach((snap, i) => {
    if (!snap.exists) return
    const d = snap.data() as Record<string, unknown>
    if (d.anulado === true) return
    const estado = String(d.estado ?? '')
    const montoCentavos = typeof d.montoCentavos === 'number' ? d.montoCentavos : 0
    const pagos = listarPagos(d.pagos)
    const restante = restanteAPagarCentavos({ estado, montoCentavos, pagos })
    const { inversionId, numero } = refs[i]
    const mapa = porInversion.get(inversionId) ?? new Map<number, CompromisoDeCuota>()
    mapa.set(numero, {
      estado,
      montoCentavos,
      pagadoCentavos: montoCentavos - restante,
      moneda: (d.moneda === 'USD' ? 'USD' : 'ARS') as MonedaInversion,
      comoSePago: null,
    })
    porInversion.set(inversionId, mapa)
  })
  return porInversion
}

/** Movimiento de caja ya cargado para un ingreso (reintento o doble clic). */
export async function movimientoCajaPorClave(clave: string): Promise<string | null> {
  const snap = await adminDb().collection(MOVIMIENTOS_COLLECTION).where('operacionVinculadaId', '==', clave).limit(1).get()
  return snap.empty ? null : snap.docs[0].id
}

const RESERVAS_SUB = 'ingresoReservas'
/** Una reserva "en curso" más vieja que esto se considera cortada y se puede retomar. */
const RESERVA_VENCE_MS = 2 * 60 * 1000

export type ReservaCaja =
  | { tipo: 'nueva' }
  | { tipo: 'hecha'; cajaMovimientoId: string }

/**
 * Reserva la clave de un ingreso en efectivo antes de tocar la caja, en una transacción:
 * así dos pedidos con la misma clave (doble clic, reintento) nunca cargan dos movimientos.
 * - no existía o falló antes → queda "en curso" y el que llamó carga la caja.
 * - ya tiene movimiento → se reusa.
 * - otro pedido la está cargando → error claro.
 */
export async function reservarIngresoCaja(inversionId: string, clave: string, ahoraMs = Date.now()): Promise<ReservaCaja> {
  const ref = adminDb().collection(INVERSIONES_COLLECTION).doc(inversionId).collection(RESERVAS_SUB).doc(clave)
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const d = snap.data() as { estado?: string; cajaMovimientoId?: string | null; desdeMs?: number } | undefined
    if (d?.estado === 'hecha' && d.cajaMovimientoId) return { tipo: 'hecha', cajaMovimientoId: d.cajaMovimientoId }
    if (d?.estado === 'en_curso' && ahoraMs - (d.desdeMs ?? 0) < RESERVA_VENCE_MS) {
      throw new EnCurso('Este ingreso ya se está registrando. Esperá unos segundos y actualizá la pantalla.')
    }
    tx.set(ref, { estado: 'en_curso', cajaMovimientoId: null, desdeMs: ahoraMs })
    return { tipo: 'nueva' }
  })
}

export async function cerrarReservaCaja(inversionId: string, clave: string, cajaMovimientoId: string | null): Promise<void> {
  const ref = adminDb().collection(INVERSIONES_COLLECTION).doc(inversionId).collection(RESERVAS_SUB).doc(clave)
  await ref.set(cajaMovimientoId ? { estado: 'hecha', cajaMovimientoId } : { estado: 'fallida', cajaMovimientoId: null })
}

/** Reservas ya cerradas con movimiento (reintento con otra clave puede reusarlas si el ingreso no se grabó). */
export async function reservasCajaHechas(
  inversionId: string,
): Promise<Array<{ clave: string; cajaMovimientoId: string }>> {
  const snap = await adminDb().collection(INVERSIONES_COLLECTION).doc(inversionId).collection(RESERVAS_SUB).get()
  const out: Array<{ clave: string; cajaMovimientoId: string }> = []
  for (const d of snap.docs) {
    const data = d.data() as { estado?: string; cajaMovimientoId?: string | null }
    if (data.estado === 'hecha' && typeof data.cajaMovimientoId === 'string' && data.cajaMovimientoId) {
      out.push({ clave: d.id, cajaMovimientoId: data.cajaMovimientoId })
    }
  }
  return out
}

/** Datos del movimiento para comparar una reserva huérfana con el pedido actual. */
export async function movimientoCajaDatos(
  id: string,
): Promise<{ cajaId: string; montoCentavos: number; fechaYmd: string } | null> {
  const snap = await adminDb().collection(MOVIMIENTOS_COLLECTION).doc(id).get()
  if (!snap.exists) return null
  const d = snap.data() as { cajaId?: unknown; montoCentavos?: unknown; fecha?: { toDate?: () => Date } }
  if (typeof d.cajaId !== 'string' || typeof d.montoCentavos !== 'number') return null
  const fecha = typeof d.fecha?.toDate === 'function' ? d.fecha.toDate() : null
  if (!fecha || Number.isNaN(fecha.getTime())) return null
  // La caja guarda YMD como medianoche UTC (parseDateInput); el día de negocio es el ISO.
  return { cajaId: d.cajaId, montoCentavos: d.montoCentavos, fechaYmd: fecha.toISOString().slice(0, 10) }
}
