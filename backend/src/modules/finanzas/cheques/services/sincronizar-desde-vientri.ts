import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { VIENTRI_CHEQUES } from '../../vientri/services/vientri.repository.js'
import type { VientriChequeDoc } from '../../vientri/domain/tipos.js'
import type { ChequeEstado, ChequeHistorialEstadoDocument } from '../domain/cheque.types.js'
import { vientriChequeToRow, type ChequeVientriRow } from '../domain/mapear-vientri.js'
import { chequeDocId } from './cheques.repository.js'
import { reconciliarChequesConMovimientos } from './reconciliar-cheques-movimientos.js'

const CHEQUES_COLLECTION = 'cheques'
const HISTORIAL_SUB = 'historialEstados'
const READ_CHUNK = 500
const WRITE_CHUNK = 200

export interface ResultadoSincVientri {
  leidos: number
  insertados: number
  actualizados: number
  sinCambios: number
  descartados: number
  cambiosEstado: number
  errores: string[]
}

export async function sincronizarChequesDesdeVientri(actorUid: string): Promise<ResultadoSincVientri> {
  const snap = await adminDb().collection(VIENTRI_CHEQUES).get()
  const rows: ChequeVientriRow[] = []
  let descartados = 0

  for (const doc of snap.docs) {
    const row = vientriChequeToRow(doc.data() as VientriChequeDoc)
    if (row) rows.push(row)
    else descartados++
  }

  const chequeCol = adminDb().collection(CHEQUES_COLLECTION)
  const refs = rows.map((r) => chequeCol.doc(chequeDocId(r.direccion, r.numero)))

  const existingMap = new Map<string, FirebaseFirestore.DocumentData>()
  for (let i = 0; i < refs.length; i += READ_CHUNK) {
    const batch = refs.slice(i, i + READ_CHUNK)
    if (batch.length === 0) continue
    const snaps = await adminDb().getAll(...batch)
    for (const s of snaps) {
      if (s.exists) existingMap.set(s.id, s.data()!)
    }
  }

  const now = Timestamp.now()
  let insertados = 0
  let actualizados = 0
  let sinCambios = 0
  let cambiosEstado = 0

  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    const slice = rows.slice(i, i + WRITE_CHUNK)
    const batch = adminDb().batch()

    for (const row of slice) {
      const docId = chequeDocId(row.direccion, row.numero)
      if (!docId || docId.includes('/') || docId.startsWith('.') || docId.includes('__')) {
        console.warn(`[sync-vientri] docId inválido, saltando: "${docId}"`)
        descartados++
        continue
      }
      const ref = chequeCol.doc(docId)
      const prev = existingMap.get(docId)

      const { fechaAcreditacion, vientriClave, idCmpIngreso, idCmpSalida, idCmpNdRechazo, idCmpPagoBanco, estadoPrevioId, estadoPrevio, motivoRechazoId, ...rest } = row
      const data: Record<string, unknown> = {
        ...rest,
        vientriSync: true,
        vientriSyncAt: FieldValue.serverTimestamp(),
        vientriClave,
        vientriCmpIngreso: idCmpIngreso,
        vientriCmpSalida: idCmpSalida,
        vientriCmpNdRechazo: idCmpNdRechazo,
        vientriCmpPagoBanco: idCmpPagoBanco,
        vientriEstadoPrevio: estadoPrevio,
        vientriMotivoRechazoId: motivoRechazoId,
        updatedAt: FieldValue.serverTimestamp(),
      }
      if (fechaAcreditacion) data.fechaAcreditacion = fechaAcreditacion

      if (!prev) {
        data.createdBy = actorUid
        data.createdAt = FieldValue.serverTimestamp()
        batch.set(ref, data)
        insertados++
      } else {
        const prevEstado = prev.estado as ChequeEstado | undefined
        const prevCmpIngreso = (prev.vientriCmpIngreso as number | null | undefined) ?? null
        const prevCmpSalida = (prev.vientriCmpSalida as number | null | undefined) ?? null
        const prevEstadoPrevio = (prev.vientriEstadoPrevio as string | null | undefined) ?? null
        const prevNdRechazo = (prev.vientriCmpNdRechazo as number | null | undefined) ?? null
        const prevPagoBanco = (prev.vientriCmpPagoBanco as number | null | undefined) ?? null
        const prevMotivoRechazo = (prev.vientriMotivoRechazoId as number | null | undefined) ?? null

        const changed = prevEstado !== row.estado
          || prev.montoCentavos !== row.montoCentavos
          || prev.estadoBancario !== row.estadoBancario
          || prev.fechaPago !== row.fechaPago
          || prev.vientriClave !== vientriClave
          || prevCmpIngreso !== (idCmpIngreso ?? null)
          || prevCmpSalida !== (idCmpSalida ?? null)
          || prevEstadoPrevio !== (estadoPrevio ?? null)
          || prevNdRechazo !== (idCmpNdRechazo ?? null)
          || prevPagoBanco !== (idCmpPagoBanco ?? null)
          || prevMotivoRechazo !== (motivoRechazoId ?? null)

        if (!changed) {
          batch.set(ref, {
            vientriSyncAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true })
          sinCambios++
          continue
        }

        batch.set(ref, data, { merge: true })
        actualizados++

        if (prevEstado && prevEstado !== row.estado) {
          const entry: ChequeHistorialEstadoDocument = {
            estadoAnterior: prevEstado,
            estadoNuevo: row.estado,
            origen: 'vientri',
            usuario: null,
            nota: `Sincronizado desde Vientri (${vientriClave})`,
            fecha: now,
          }
          batch.set(ref.collection(HISTORIAL_SUB).doc(), entry)
          cambiosEstado++
        }
      }
    }
    await batch.commit()
  }

  const errores: string[] = []
  try {
    await reconciliarChequesConMovimientos()
  } catch (err) {
    console.error('[finanzas/cheques] reconciliar post-sync-vientri', err)
    errores.push('Reconciliación falló (los cheques se sincronizaron correctamente)')
  }

  return { leidos: snap.size, insertados, actualizados, sinCambios, descartados, cambiosEstado, errores }
}
