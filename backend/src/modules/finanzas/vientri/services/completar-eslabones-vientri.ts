import { adminDb } from '../../../../lib/firebase/admin.js'
import { normalizarNombre } from '../../agenda/domain/normalizar-nombre.js'
import type { ChequeOcasionalDoc } from '../domain/cheque-ocasional.types.js'
import type { VientriChequeDoc } from '../domain/tipos.js'
import { VIENTRI_CHEQUES } from './vientri.repository.js'

/**
 * Completa los eslabones viejos que están referenciados en `renovacionDe` pero no están
 * en `vientriChequesOcasionales` (ej. porque el CSV exportó solo PAGADO=0), buscándolos
 * en `vientriCheques`, y resuelve los links inversos `renovadoPor`.
 */
export async function leerActivosConEslabonesDeVientri(activos: ChequeOcasionalDoc[]): Promise<ChequeOcasionalDoc[]> {
  const clonados: ChequeOcasionalDoc[] = activos.map((d) => ({
    ...d,
    renovacionDe: [...d.renovacionDe],
    renovadoPor: [...d.renovadoPor],
  }))

  const porNumero = new Map<string, ChequeOcasionalDoc>()
  for (const d of clonados) {
    if (d.numeroCheque) {
      porNumero.set(d.numeroCheque, d)
      const corto = d.numeroCheque.split('-').pop()
      if (corto && corto !== d.numeroCheque) porNumero.set(corto, d)
    }
  }

  const faltantes = new Set<string>()
  for (const d of clonados) {
    for (const numViejo of d.renovacionDe) {
      if (!porNumero.has(numViejo)) faltantes.add(numViejo)
    }
  }

  if (faltantes.size > 0) {
    // Cruzar primero contra la colección `cheques` (por número completo o sufijo corto)
    const chSnap = await adminDb().collection('cheques').get()
    for (const doc of chSnap.docs) {
      const ch = doc.data() as Record<string, unknown>
      const numCompleto = String(ch.numero ?? '').trim()
      if (!numCompleto) continue
      const numCorto = (numCompleto.split('-').pop() || '').trim()
      const matchKey = faltantes.has(numCompleto)
        ? numCompleto
        : faltantes.has(numCorto)
          ? numCorto
          : null
      if (!matchKey) continue
      if (porNumero.has(numCompleto)) continue

      const benef = String(ch.beneficiarioRealFinanciero ?? ch.destinatario ?? '').trim()
      const benefNorm = normalizarNombre(benef)
      const estadoStr = String(ch.estadoBancario ?? ch.estado ?? 'Renovado')

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
        estado: estadoStr,
        pagado: ch.estado === 'debitado' || ch.estado === 'renovado' || ch.fechaAcreditacion != null,
        esProveedorFinanciero: true,
        tipoProveedor: 'financiero',
        esRenovacion: false,
        renovacionDe: Array.isArray(ch.renovacionDe) ? (ch.renovacionDe as string[]) : [],
        renovadoPor: [],
        operacionUsd: null,
        tasaExplicita: null,
        rolEnOperacion: null,
        obsOriginal: typeof ch.observaciones === 'string' ? ch.observaciones : '',
        revisar: [],
        fechaConciliado: null,
        vientriId: 0,
        vientriChqId: null,
        baja: false,
      }

      clonados.push(sintetico)
      porNumero.set(numCompleto, sintetico)
      if (numCorto && numCorto !== numCompleto) porNumero.set(numCorto, sintetico)
      faltantes.delete(matchKey)
      if (faltantes.size === 0) break
    }
  }

  if (faltantes.size > 0) {
    const vSnap = await adminDb().collection(VIENTRI_CHEQUES).get()
    for (const doc of vSnap.docs) {
      const v = doc.data() as VientriChequeDoc
      if (v.baja) continue
      const numCompleto = (v.numero || '').trim()
      const numCorto = (v.serie || numCompleto.split('-').pop() || '').trim()
      const matchKey = faltantes.has(numCompleto)
        ? numCompleto
        : faltantes.has(numCorto)
          ? numCorto
          : null
      if (!matchKey) continue

      const numeroCheque = numCompleto || numCorto
      if (porNumero.has(numeroCheque)) continue

      const benef = (v.destinatario ?? v.entregadoA?.nombre ?? '').trim()
      const benefNorm = normalizarNombre(benef)
      const vientriId = v.vientriChqocaId ?? v.vientriChqId ?? 0

      const sintetico: ChequeOcasionalDoc = {
        numeroCheque,
        beneficiario: benef,
        beneficiarioNormalizado: benefNorm,
        beneficiarioFormal: null,
        beneficiarioCuit: null,
        montoCentavos: v.montoCentavos ?? 0,
        fechaVencimiento: v.fechaVencimiento ?? null,
        fechaEmision: v.fechaEmision ?? null,
        estadoCodigo: v.estadoVientriId ?? null,
        estado: v.estadoVientri || v.estado || 'Renovado',
        pagado: v.fechaConciliado !== null || v.estado === 'debitado' || v.estado === 'renovado',
        esProveedorFinanciero: true,
        tipoProveedor: 'financiero',
        esRenovacion: false,
        renovacionDe: [],
        renovadoPor: [],
        operacionUsd: null,
        tasaExplicita: null,
        rolEnOperacion: null,
        obsOriginal: '',
        revisar: v.revisar ?? [],
        fechaConciliado: typeof v.fechaConciliado === 'string' ? v.fechaConciliado : null,
        vientriId,
        vientriChqId: null,
        baja: false,
      }

      clonados.push(sintetico)
      porNumero.set(numeroCheque, sintetico)
      if (numCorto && numCorto !== numeroCheque) porNumero.set(numCorto, sintetico)
      faltantes.delete(matchKey)
      if (faltantes.size === 0) break
    }
  }

  for (const nuevo of clonados) {
    for (const numViejo of nuevo.renovacionDe) {
      const viejo = porNumero.get(numViejo)
      if (viejo && !viejo.renovadoPor.includes(nuevo.numeroCheque)) {
        viejo.renovadoPor.push(nuevo.numeroCheque)
      }
    }
  }

  return clonados
}
