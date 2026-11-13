import { adminDb } from '../../../../lib/firebase/admin.js'

/**
 * Beneficiarios de cheques ocasionales que Finanzas marcó a mano como "pago" (no operación financiera).
 * Sus cheques solo se ven en la pestaña "Otros pagos". Id del doc = beneficiario normalizado.
 * No se borra: quitar la marca deja el doc con `estado: 'inactivo'`.
 */
export const VIENTRI_BENEFICIARIOS_PAGO = 'vientriBeneficiariosPago'

export interface BeneficiarioPagoDoc {
  beneficiarioNormalizado: string
  /** Como se ve en pantalla (el beneficiario tal cual vino de Vientri). */
  nombre: string
  estado: 'activo' | 'inactivo'
  actualizadoPor: string
  actualizadoAt: string
}

/** Firestore no acepta "/" en el id; el resto del nombre normalizado sirve tal cual. */
function idDoc(beneficiarioNormalizado: string): string {
  return beneficiarioNormalizado.replace(/\//g, '_')
}

export async function listarBeneficiariosPago(): Promise<BeneficiarioPagoDoc[]> {
  const snap = await adminDb().collection(VIENTRI_BENEFICIARIOS_PAGO).get()
  return snap.docs.map((d) => d.data() as BeneficiarioPagoDoc)
}

/** Los marcados como pago hoy (solo los activos). */
export async function beneficiariosMarcadosComoPago(): Promise<Set<string>> {
  const docs = await listarBeneficiariosPago()
  return new Set(docs.filter((d) => d.estado === 'activo').map((d) => d.beneficiarioNormalizado))
}

export async function guardarBeneficiarioPago(opts: {
  beneficiarioNormalizado: string
  nombre: string
  esPago: boolean
  uid: string
}): Promise<void> {
  const doc: BeneficiarioPagoDoc = {
    beneficiarioNormalizado: opts.beneficiarioNormalizado,
    nombre: opts.nombre,
    estado: opts.esPago ? 'activo' : 'inactivo',
    actualizadoPor: opts.uid,
    actualizadoAt: new Date().toISOString(),
  }
  await adminDb().collection(VIENTRI_BENEFICIARIOS_PAGO).doc(idDoc(opts.beneficiarioNormalizado)).set(doc)
}
