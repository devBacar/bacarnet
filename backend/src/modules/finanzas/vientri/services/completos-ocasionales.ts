/**
 * Cheques ocasionales completos (enriquecidos).
 *
 * Persiste el resultado de: vientriChequesOcasionales activos + eslabones de vientriCheques
 * + cheques CHQ inyectados para autolink. Todos los endpoints leen de acá en vez de
 * recomputar el pipeline completo (3-4 lecturas de colección) en cada request.
 *
 * Se reconstruye al importar ocasionales y se puede forzar con POST /completos/recalcular.
 */
import type { ChequeOcasionalDoc } from '../domain/cheque-ocasional.types.js'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { leerActivosConEslabonesDeVientri } from './completar-eslabones-vientri.js'
import { inyectarChqParaAutolink } from './inyectar-chq-autolink.js'
import { sincronizarColeccion, type ConteoEscritura } from './vientri.repository.js'
import { VIENTRI_CHEQUES_OCASIONALES } from './importar-cheques-ocasionales.js'

export const CHEQUES_OCASIONALES_COMPLETOS = 'chequesOcasionalesCompletos'

function completosDocId(doc: ChequeOcasionalDoc): string {
  if (doc.vientriId !== 0) return `oca-${doc.vientriId}`
  const num = doc.numeroCheque.replace(/[^a-zA-Z0-9-]/g, '')
  return `comp-${num}`
}

export interface ResultadoCompletos {
  total: number
  reales: number
  sinteticos: number
  conteo: ConteoEscritura
}

export async function reconstruirCompletos(importacionId?: string): Promise<ResultadoCompletos> {
  const snap = await adminDb().collection(VIENTRI_CHEQUES_OCASIONALES).get()
  const todos = snap.docs.map((d) => d.data() as ChequeOcasionalDoc)
  const activos = todos.filter((d) => !d.baja)

  const conEslabones = await leerActivosConEslabonesDeVientri(activos)
  const completos = await inyectarChqParaAutolink(conEslabones)

  const reales = completos.filter((d) => d.vientriId !== 0).length
  const sinteticos = completos.length - reales

  const docsParaSync = completos.map((d) => ({
    id: completosDocId(d),
    data: d as unknown as object,
  }))

  const conteo = await sincronizarColeccion({
    coleccion: CHEQUES_OCASIONALES_COMPLETOS,
    docs: docsParaSync,
    importacionId: importacionId ?? `completos-${Date.now()}`,
    borrarFaltantes: true,
    simular: false,
  })

  return { total: completos.length, reales, sinteticos, conteo }
}

export async function leerCompletos(): Promise<ChequeOcasionalDoc[]> {
  const snap = await adminDb().collection(CHEQUES_OCASIONALES_COMPLETOS).get()
  return snap.docs.map((d) => d.data() as ChequeOcasionalDoc)
}
