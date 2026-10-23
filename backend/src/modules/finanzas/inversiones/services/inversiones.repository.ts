import { adminDb } from '../../../../lib/firebase/admin.js'
import { COMPROMISOS_COLLECTION } from '../../agenda/services/agenda.repository.js'
import { listarPagos, restanteAPagarCentavos } from '../../agenda/domain/pago-compromiso.js'
import { idCompromisoCuota } from '../domain/agenda-plan.js'
import type { InversionDocumentBase, MonedaInversion } from '../domain/inversion.types.js'
import type { CompromisoDeCuota } from '../domain/vista.js'
import { NoEncontrado } from '../domain/validar.js'
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

/**
 * Lee la inversión dentro de una transacción y guarda lo que decida `decidir`.
 * Si otro pedido la cambió en el medio, Firestore reintenta y `decidir` vuelve a validar con el estado nuevo.
 */
export async function actualizarInversionTx(
  id: string,
  decidir: (actual: InversionDocumentBase) => { data: InversionDocumentBase; historial: HistorialEstadoDocument },
): Promise<void> {
  const ref = adminDb().collection(INVERSIONES_COLLECTION).doc(id)
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new NoEncontrado('No encontré esa inversión.')
    const { data, historial } = decidir(snap.data() as InversionDocumentBase)
    tx.set(ref, data)
    tx.set(ref.collection(HISTORIAL_SUB).doc(), historial)
  })
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
