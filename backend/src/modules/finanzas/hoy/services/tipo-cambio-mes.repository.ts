import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { agendaTimestampToIso } from '../../agenda/domain/agendaTimestamps.js'

export const TIPO_CAMBIO_MES_COLLECTION = 'finanzasTipoCambioMes'

export interface TipoCambioMes {
  mes: string
  usdArs: number
  actualizadoPor: string
  actualizadoAt: string | null
}

export async function getTipoCambioMes(mes: string): Promise<TipoCambioMes | null> {
  const snap = await adminDb().collection(TIPO_CAMBIO_MES_COLLECTION).doc(mes).get()
  if (!snap.exists) return null
  const data = snap.data() as { usdArs?: unknown; actualizadoPor?: unknown; actualizadoAt?: unknown }
  if (typeof data.usdArs !== 'number' || !Number.isFinite(data.usdArs) || data.usdArs <= 0) return null
  return {
    mes,
    usdArs: data.usdArs,
    actualizadoPor: typeof data.actualizadoPor === 'string' ? data.actualizadoPor : '',
    actualizadoAt: agendaTimestampToIso(data.actualizadoAt),
  }
}

export async function putTipoCambioMes(mes: string, usdArs: number, actorUid: string): Promise<void> {
  await adminDb().collection(TIPO_CAMBIO_MES_COLLECTION).doc(mes).set({
    usdArs,
    actualizadoPor: actorUid,
    actualizadoAt: FieldValue.serverTimestamp(),
  })
}
