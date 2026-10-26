import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { VIENTRI_CHEQUES, VIENTRI_PERSONAS } from '../../vientri/services/vientri.repository.js'
import type { VientriChequeDoc, VientriPersonaDoc } from '../../vientri/domain/tipos.js'
import type { ChequeEstado, ChequeHistorialEstadoDocument } from '../domain/cheque.types.js'
import { vientriChequeToRow, clasificarOrigenPorPersonas, type ChequeVientriRow } from '../domain/mapear-vientri.js'
import { chequeDocId } from './cheques.repository.js'
import { reconciliarChequesConMovimientos } from './reconciliar-cheques-movimientos.js'

const CHEQUES_COLLECTION = 'cheques'
const HISTORIAL_SUB = 'historialEstados'
const WRITE_CHUNK = 50

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
  const [snap, personasSnap] = await Promise.all([
    adminDb().collection(VIENTRI_CHEQUES).get(),
    adminDb().collection(VIENTRI_PERSONAS).get(),
  ])

  const personasMap = new Map<number, VientriPersonaDoc>()
  for (const pDoc of personasSnap.docs) {
    const p = pDoc.data() as VientriPersonaDoc
    if (p.vientriId) personasMap.set(p.vientriId, p)
  }

  const rows: ChequeVientriRow[] = []
  let descartados = 0

  const totalPersonas = personasMap.size
  const totalClientes = [...personasMap.values()].filter(p => p.esCliente).length
  console.log(`[sync-vientri] personas cargadas: ${totalPersonas}, con esCliente=true: ${totalClientes}`)

  let clasificadosCliente = 0
  for (const doc of snap.docs) {
    const row = vientriChequeToRow(doc.data() as VientriChequeDoc)
    if (row) {
      const clasif = clasificarOrigenPorPersonas(row, personasMap)
      row.origen = clasif.origen
      row.cliente = clasif.cliente
      if (row.origen === 'cliente') clasificadosCliente++
      rows.push(row)
    } else {
      descartados++
    }
  }
  console.log(`[sync-vientri] cheques clasificados como cliente: ${clasificadosCliente} de ${rows.length}`)

  const chequeCol = adminDb().collection(CHEQUES_COLLECTION)
  const existingMap = new Map<string, FirebaseFirestore.DocumentData>()
  const existingSnaps = await chequeCol.select(
    'estado', 'montoCentavos', 'estadoBancario', 'fechaPago', 'vientriClave', 'origen',
    'vientriCmpIngreso', 'vientriCmpIngresoDesc', 'vientriCmpSalida', 'vientriCmpSalidaDesc',
    'vientriEstadoPrevio', 'vientriCmpNdRechazo', 'vientriCmpPagoBanco', 'vientriMotivoRechazoId',
  ).get()
  for (const s of existingSnaps.docs) existingMap.set(s.id, s.data())

  const now = Timestamp.now()
  let insertados = 0
  let actualizados = 0
  let sinCambios = 0
  let cambiosEstado = 0

  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    const slice = rows.slice(i, i + WRITE_CHUNK)
    const batch = adminDb().batch()
    let batchWrites = 0

    for (const row of slice) {
      const docId = chequeDocId(row.direccion, row.numero)
      if (!docId || docId.includes('/') || docId.startsWith('.') || docId.includes('__')) {
        console.warn(`[sync-vientri] docId inválido, saltando: "${docId}"`)
        descartados++
        continue
      }
      const ref = chequeCol.doc(docId)
      const prev = existingMap.get(docId)

      const { fechaAcreditacion, vientriClave, idCmpIngreso, cmpIngresoDesc, idCmpSalida, cmpSalidaDesc, idCmpNdRechazo, idCmpPagoBanco, estadoPrevioId, estadoPrevio, motivoRechazoId, ...rest } = row
      const data: Record<string, unknown> = {
        ...rest,
        vientriSync: true,
        vientriSyncAt: FieldValue.serverTimestamp(),
        vientriClave,
        vientriCmpIngreso: idCmpIngreso,
        vientriCmpIngresoDesc: cmpIngresoDesc,
        vientriCmpSalida: idCmpSalida,
        vientriCmpSalidaDesc: cmpSalidaDesc,
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
        batchWrites++
        insertados++
      } else {
        const prevEstado = prev.estado as ChequeEstado | undefined
        const prevCmpIngreso = (prev.vientriCmpIngreso as number | null | undefined) ?? null
        const prevCmpIngresoDesc = (prev.vientriCmpIngresoDesc as string | null | undefined) ?? null
        const prevCmpSalida = (prev.vientriCmpSalida as number | null | undefined) ?? null
        const prevCmpSalidaDesc = (prev.vientriCmpSalidaDesc as string | null | undefined) ?? null
        const prevEstadoPrevio = (prev.vientriEstadoPrevio as string | null | undefined) ?? null
        const prevNdRechazo = (prev.vientriCmpNdRechazo as number | null | undefined) ?? null
        const prevPagoBanco = (prev.vientriCmpPagoBanco as number | null | undefined) ?? null
        const prevMotivoRechazo = (prev.vientriMotivoRechazoId as number | null | undefined) ?? null

        const changed = prevEstado !== row.estado
          || prev.montoCentavos !== row.montoCentavos
          || prev.estadoBancario !== row.estadoBancario
          || prev.fechaPago !== row.fechaPago
          || prev.vientriClave !== vientriClave
          || (prev.origen ?? 'tercero') !== row.origen
          || prevCmpIngreso !== (idCmpIngreso ?? null)
          || prevCmpIngresoDesc !== (cmpIngresoDesc ?? null)
          || prevCmpSalida !== (idCmpSalida ?? null)
          || prevCmpSalidaDesc !== (cmpSalidaDesc ?? null)
          || prevEstadoPrevio !== (estadoPrevio ?? null)
          || prevNdRechazo !== (idCmpNdRechazo ?? null)
          || prevPagoBanco !== (idCmpPagoBanco ?? null)
          || prevMotivoRechazo !== (motivoRechazoId ?? null)

        if (!changed) {
          sinCambios++
          continue
        }

        batch.set(ref, data, { merge: true })
        batchWrites++
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
          batchWrites++
          cambiosEstado++
        }
      }
    }
    if (batchWrites > 0) {
      await batch.commit()
      await new Promise((r) => setTimeout(r, 20))
    }
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
