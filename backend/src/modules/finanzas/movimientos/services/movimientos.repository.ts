import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import type { BancoNombre } from '../../domain/cuenta.types.js'
import type { MovimientoBancarioMapped } from '../domain/movimiento-bancario.map.js'
import type { MovimientoBancarioSyncDocument } from '../domain/movimiento-bancario.types.js'

export const MOVIMIENTOS_BANCARIOS_COLLECTION = 'movimientosBancarios'
export const MOVIMIENTOS_BANCARIOS_SYNC_COLLECTION = 'movimientosBancariosSync'

const WRITE_CHUNK = 400

export function movimientosBancariosCollection() {
  return adminDb().collection(MOVIMIENTOS_BANCARIOS_COLLECTION)
}

function syncCollection() {
  return adminDb().collection(MOVIMIENTOS_BANCARIOS_SYNC_COLLECTION)
}

export async function getMovimientosSyncEstado(
  cuentaId: string,
): Promise<MovimientoBancarioSyncDocument | null> {
  const snap = await syncCollection().doc(cuentaId).get()
  return snap.exists ? (snap.data() as MovimientoBancarioSyncDocument) : null
}

export async function countMovimientosBancarios(cuentaId?: string): Promise<number> {
  const base = movimientosBancariosCollection()
  const query = cuentaId ? base.where('cuentaId', '==', cuentaId) : base
  const snap = await query.count().get()
  return snap.data().count
}

/** Borra todo lo que esa cuenta tenga en [desde, hasta]. Devuelve cuántos borró. */
async function deleteRango(input: { cuentaId: string; desde: string; hasta: string }): Promise<number> {
  const db = adminDb()
  let eliminados = 0
  for (;;) {
    const snap = await movimientosBancariosCollection()
      .where('cuentaId', '==', input.cuentaId)
      .where('fechaProceso', '>=', input.desde)
      .where('fechaProceso', '<=', input.hasta)
      .limit(WRITE_CHUNK)
      .get()
    if (snap.empty) return eliminados
    const batch = db.batch()
    snap.docs.forEach((doc) => batch.delete(doc.ref))
    await batch.commit()
    eliminados += snap.size
    if (snap.size < WRITE_CHUNK) return eliminados
  }
}

async function insertRows(input: { rows: MovimientoBancarioMapped[]; syncedBy: string }): Promise<number> {
  const db = adminDb()
  const col = movimientosBancariosCollection()
  let insertados = 0
  for (let i = 0; i < input.rows.length; i += WRITE_CHUNK) {
    const slice = input.rows.slice(i, i + WRITE_CHUNK)
    const batch = db.batch()
    for (const row of slice) {
      batch.set(col.doc(), {
        ...row,
        createdAt: FieldValue.serverTimestamp(),
        syncedBy: input.syncedBy,
      })
    }
    await batch.commit()
    insertados += slice.length
  }
  return insertados
}

/**
 * Reemplaza completo el tramo [desde, hasta] de una cuenta: borra lo que había
 * y guarda las filas tal cual vinieron del banco. La marca de agua se mueve al
 * final, así un corte a mitad de camino se repara solo en el próximo sync.
 */
export async function replaceMovimientosRango(input: {
  cuenta: { cuentaId: string; bancoNombre: BancoNombre }
  desde: string
  hasta: string
  rows: MovimientoBancarioMapped[]
  syncedBy: string
  primeraFechaCargada: string
}): Promise<{ eliminados: number; insertados: number }> {
  const eliminados = await deleteRango({ cuentaId: input.cuenta.cuentaId, desde: input.desde, hasta: input.hasta })
  const insertados = await insertRows({ rows: input.rows, syncedBy: input.syncedBy })

  const ref = syncCollection().doc(input.cuenta.cuentaId)
  const now = FieldValue.serverTimestamp()
  await adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref)
    const patch = {
      cuentaId: input.cuenta.cuentaId,
      bancoNombre: input.cuenta.bancoNombre,
      ultimaFechaSincronizada: input.hasta,
      ultimoSyncAt: now,
      ultimoSyncPor: input.syncedBy,
      ultimoSyncFilas: input.rows.length,
      updatedAt: now,
    }
    if (existing.exists) {
      tx.update(ref, patch)
    } else {
      tx.set(ref, { ...patch, primeraFechaCargada: input.primeraFechaCargada, createdAt: now })
    }
  })

  return { eliminados, insertados }
}
