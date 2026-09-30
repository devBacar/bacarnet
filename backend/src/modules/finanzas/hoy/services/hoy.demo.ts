import type { Firestore } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import {
  COLECCIONES_DEMO,
  exigirEntornoDePruebas,
  type ColeccionDemo,
  type EntornoDemo,
} from '../domain/hoy.demo.js'

const LOTE_BORRADO = 400

/** true si en alguna de las colecciones queda un documento con `demo: true`. */
export async function hayDatosDemo(db: Firestore = adminDb()): Promise<boolean> {
  const snaps = await Promise.all(
    COLECCIONES_DEMO.map((coleccion) => db.collection(coleccion).where('demo', '==', true).limit(1).get()),
  )
  return snaps.some((snap) => !snap.empty)
}

export interface ResultadoBorradoDemo {
  borrados: Record<ColeccionDemo, number>
  total: number
}

/**
 * Borra los documentos `demo: true` de compromisos, cobros y cheques.
 * Se niega fuera del entorno de pruebas: lanza `SoloEnPruebasError` (403) antes de tocar la base.
 */
export async function borrarDatosDemo(input: { env?: EntornoDemo; db?: Firestore } = {}): Promise<ResultadoBorradoDemo> {
  exigirEntornoDePruebas(input.env ?? process.env)
  const db = input.db ?? adminDb()
  const borrados = { compromisosPago: 0, cobrosEsperados: 0, cheques: 0 } satisfies Record<ColeccionDemo, number>

  for (const coleccion of COLECCIONES_DEMO) {
    const snap = await db.collection(coleccion).where('demo', '==', true).get()
    for (let inicio = 0; inicio < snap.docs.length; inicio += LOTE_BORRADO) {
      const batch = db.batch()
      for (const doc of snap.docs.slice(inicio, inicio + LOTE_BORRADO)) batch.delete(doc.ref)
      await batch.commit()
    }
    borrados[coleccion] = snap.docs.length
  }

  return {
    borrados,
    total: borrados.compromisosPago + borrados.cobrosEsperados + borrados.cheques,
  }
}
