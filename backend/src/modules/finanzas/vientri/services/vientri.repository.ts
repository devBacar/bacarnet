import { createHash } from 'node:crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'

export const VIENTRI_CHEQUES = 'vientriCheques'
export const VIENTRI_PENDIENTES = 'vientriPendientes'
export const VIENTRI_PERSONAS = 'vientriPersonas'
export const VIENTRI_IMPORTACIONES = 'vientriImportaciones'
export const VIENTRI_ESTADO = 'vientriEstado'
export const VIENTRI_ESTADO_DOC = 'actual'

const LOTE = 400

export interface ConteoEscritura {
  nuevos: number
  cambiados: number
  iguales: number
  borrados: number
}

function huella(data: unknown): string {
  return createHash('sha1').update(JSON.stringify(data)).digest('hex')
}

/**
 * Escribe solo lo que cambió (por huella) y, en carga completa, borra lo que ya no vino.
 * Son colecciones propias de la integración: no tocan cheques, agenda ni nada existente.
 */
export async function sincronizarColeccion(input: {
  coleccion: string
  docs: Array<{ id: string; data: object }>
  importacionId: string
  borrarFaltantes: boolean
  simular: boolean
}): Promise<ConteoEscritura> {
  const col = adminDb().collection(input.coleccion)
  const existentes = new Map<string, string>()
  const snap = await col.select('huella').get()
  for (const d of snap.docs) existentes.set(d.id, String(d.get('huella') ?? ''))

  const conteo: ConteoEscritura = { nuevos: 0, cambiados: 0, iguales: 0, borrados: 0 }
  const escrituras: Array<{ id: string; data: object | null }> = []
  const vistos = new Set<string>()
  for (const d of input.docs) {
    vistos.add(d.id)
    const h = huella(d.data)
    const previa = existentes.get(d.id)
    if (previa === h) {
      conteo.iguales++
      continue
    }
    if (previa === undefined) conteo.nuevos++
    else conteo.cambiados++
    escrituras.push({ id: d.id, data: { ...d.data, huella: h, importacionId: input.importacionId } })
  }
  if (input.borrarFaltantes) {
    for (const id of existentes.keys()) {
      if (!vistos.has(id)) {
        conteo.borrados++
        escrituras.push({ id, data: null })
      }
    }
  }
  if (input.simular) return conteo

  for (let i = 0; i < escrituras.length; i += LOTE) {
    const batch = adminDb().batch()
    for (const e of escrituras.slice(i, i + LOTE)) {
      const ref = col.doc(e.id)
      if (e.data === null) batch.delete(ref)
      else batch.set(ref, { ...e.data, actualizadoAt: FieldValue.serverTimestamp() })
    }
    await batch.commit()
  }
  return conteo
}

export async function contarColeccion(coleccion: string): Promise<number> {
  const agg = await adminDb().collection(coleccion).count().get()
  return agg.data().count
}

export async function crearImportacion(data: object): Promise<string> {
  const ref = await adminDb().collection(VIENTRI_IMPORTACIONES).add({ ...data, inicioAt: FieldValue.serverTimestamp() })
  return ref.id
}

export async function cerrarImportacion(id: string, data: object): Promise<void> {
  await adminDb().collection(VIENTRI_IMPORTACIONES).doc(id).set({ ...data, finAt: FieldValue.serverTimestamp() }, { merge: true })
}

export async function guardarEstado(data: object): Promise<void> {
  await adminDb().collection(VIENTRI_ESTADO).doc(VIENTRI_ESTADO_DOC).set({ ...data, actualizadoAt: FieldValue.serverTimestamp() })
}

export interface EstadoVientri {
  fechaDatos: string | null
  importadoAt: string | null
  importacionId: string | null
  ok: boolean
  mensaje: string | null
  resumen: Record<string, unknown> | null
}

export async function leerEstado(): Promise<EstadoVientri | null> {
  const snap = await adminDb().collection(VIENTRI_ESTADO).doc(VIENTRI_ESTADO_DOC).get()
  if (!snap.exists) return null
  const d = snap.data() ?? {}
  const ts = d.importadoAt instanceof Timestamp ? d.importadoAt.toDate().toISOString() : null
  return {
    fechaDatos: typeof d.fechaDatos === 'string' ? d.fechaDatos : null,
    importadoAt: ts,
    importacionId: typeof d.importacionId === 'string' ? d.importacionId : null,
    ok: d.ok === true,
    mensaje: typeof d.mensaje === 'string' ? d.mensaje : null,
    resumen: (d.resumen as Record<string, unknown>) ?? null,
  }
}

export async function listarPorCampos(
  coleccion: string,
  filtros: Array<[string, string | boolean]>,
): Promise<Array<Record<string, unknown>>> {
  let q: FirebaseFirestore.Query = adminDb().collection(coleccion)
  for (const [campo, valor] of filtros) q = q.where(campo, '==', valor)
  const snap = await q.get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
