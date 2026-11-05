import { adminDb } from '../../../../lib/firebase/admin.js'
import { idPatron, type PatronOcasional } from '../domain/patrones-ocasionales.js'

/** Lo que Finanzas fue confirmando a mano sobre los OBS de cheques ocasionales (ver domain/patrones-ocasionales). */
export const VIENTRI_PATRONES_OCASIONALES = 'vientriPatronesOcasionales'

export async function listarPatronesOcasionales(): Promise<PatronOcasional[]> {
  const snap = await adminDb().collection(VIENTRI_PATRONES_OCASIONALES).get()
  return snap.docs.map((d) => d.data() as PatronOcasional)
}

export async function leerPatronOcasional(
  clave: Pick<PatronOcasional, 'beneficiarioNormalizado' | 'tipo' | 'forma'>,
): Promise<PatronOcasional | null> {
  const snap = await adminDb().collection(VIENTRI_PATRONES_OCASIONALES).doc(idPatron(clave)).get()
  return snap.exists ? (snap.data() as PatronOcasional) : null
}

export async function guardarPatronOcasional(p: PatronOcasional, uid: string): Promise<void> {
  await adminDb()
    .collection(VIENTRI_PATRONES_OCASIONALES)
    .doc(idPatron(p))
    .set({ ...p, actualizadoPor: uid, actualizadoAt: new Date().toISOString() })
}
