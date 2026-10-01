import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'

export const DETALLES_CAJA_COLLECTION = 'finanzasDetallesCaja'

function collection() {
  return adminDb().collection(DETALLES_CAJA_COLLECTION)
}

/** El texto ya normalizado es el id: así no se duplica. */
function docId(texto: string): string {
  return texto
}

/** Suma usos. Si es la primera vez, deja quién y cuándo se creó. */
export async function registrarUsoDetalleCaja(input: {
  texto: string
  creadoPor: string
  veces?: number
}): Promise<void> {
  const veces = input.veces != null && input.veces > 0 ? Math.floor(input.veces) : 1
  const ref = collection().doc(docId(input.texto))
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) {
      tx.set(ref, {
        texto: input.texto,
        veces,
        creadoPor: input.creadoPor,
        creadoAt: FieldValue.serverTimestamp(),
      })
      return
    }
    tx.update(ref, { veces: FieldValue.increment(veces), texto: input.texto })
  })
}

export async function listDetallesCajaGuardados(): Promise<Array<{ texto: string; veces: number }>> {
  const snap = await collection().get()
  const rows: Array<{ texto: string; veces: number }> = []
  for (const doc of snap.docs) {
    const data = doc.data()
    const texto = typeof data.texto === 'string' ? data.texto.trim() : ''
    const veces = typeof data.veces === 'number' && Number.isFinite(data.veces) ? data.veces : 0
    if (!texto) continue
    rows.push({ texto, veces })
  }
  return rows
}
