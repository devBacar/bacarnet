import { adminDb } from '../../../../lib/firebase/admin.js'
import { normalizarNombre } from '../../agenda/domain/normalizar-nombre.js'
import type { ChequeOcasionalDoc } from '../domain/cheque-ocasional.types.js'

/**
 * Inyecta cheques CHQ regulares pagados/renovados al pool para que el auto-linking
 * implícito (por fechaConciliado/fechaVencimiento) pueda encontrarlos como cheques viejos.
 * Caso principal: MAHUM DIEGO cuyos viejos están en CHQ, no en CHQOCA.
 */
export async function inyectarChqParaAutolink(docs: ChequeOcasionalDoc[]): Promise<ChequeOcasionalDoc[]> {
  const existentes = new Set<string>()
  for (const d of docs) {
    if (d.numeroCheque) existentes.add(d.numeroCheque)
  }

  const chSnap = await adminDb().collection('cheques').get()
  const inyectados: ChequeOcasionalDoc[] = []

  for (const doc of chSnap.docs) {
    const ch = doc.data() as Record<string, unknown>
    const numCompleto = String(ch.numero ?? '').trim()
    if (!numCompleto || existentes.has(numCompleto)) continue

    const estado = String(ch.estado ?? '')
    const pagado = estado === 'renovado' || estado === 'debitado' || ch.fechaAcreditacion != null
    if (!pagado) continue
    if (ch.esProveedorFinanciero !== true) continue

    const benef = String(ch.beneficiarioRealFinanciero ?? ch.destinatario ?? '').trim()
    if (!benef) continue
    const benefNorm = normalizarNombre(benef)

    const sintetico: ChequeOcasionalDoc = {
      numeroCheque: numCompleto,
      beneficiario: benef,
      beneficiarioNormalizado: benefNorm,
      beneficiarioFormal: null,
      beneficiarioCuit: null,
      montoCentavos: typeof ch.montoCentavos === 'number' ? ch.montoCentavos : 0,
      fechaVencimiento: typeof ch.fechaPago === 'string' ? ch.fechaPago : null,
      fechaEmision: typeof ch.fechaEmision === 'string' ? ch.fechaEmision : null,
      estadoCodigo: null,
      estado: String(ch.estadoBancario ?? ch.estado ?? ''),
      pagado: true,
      esProveedorFinanciero: true,
      tipoProveedor: 'financiero',
      esRenovacion: false,
      renovacionDe: [],
      renovadoPor: [],
      operacionUsd: null,
      tasaExplicita: null,
      rolEnOperacion: null,
      obsOriginal: typeof ch.observaciones === 'string' ? ch.observaciones : '',
      revisar: [],
      fechaConciliado: typeof ch.fechaAcreditacion === 'string' ? ch.fechaAcreditacion : null,
      vientriId: 0,
      vientriChqId: null,
      baja: false,
    }

    inyectados.push(sintetico)
    existentes.add(numCompleto)
  }

  return inyectados.length > 0 ? [...docs, ...inyectados] : docs
}
