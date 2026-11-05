import { adminDb } from '../../../../lib/firebase/admin.js'
import { VIENTRI_CHEQUES_OCASIONALES } from '../../vientri/services/importar-cheques-ocasionales.js'
import type { ChequeOcasionalDoc } from '../../vientri/domain/cheque-ocasional.types.js'
import type { ChequeEstado } from '../domain/cheque.types.js'
import { dentroDelRangoMonto } from '../domain/filtro-monto.js'
import { sonGemelos } from '../domain/gemelos-cheque.js'
import { PREFIJO_OCASIONAL, esIdOcasional } from './ocasionales-vinculo.repository.js'
import type { ChequeListadoItem, ChequesFiltro } from './cheques.repository.js'

/**
 * En Emitidos los cheques ocasionales salen de su colección de Vientri (son físicos), no de las
 * copias que Vientri deja en `cheques` (una como físico "oca-…" y otra como eCheq).
 */

function estadoDelOcasional(d: ChequeOcasionalDoc): ChequeEstado {
  if (d.estadoCodigo === 13) return 'rechazado'
  if (d.estadoCodigo === 5 || d.renovadoPor.length > 0) return 'renovado'
  return d.pagado ? 'debitado' : 'pendiente'
}

export function ocasionalAItem(docId: string, d: ChequeOcasionalDoc): ChequeListadoItem {
  return {
    id: `${PREFIJO_OCASIONAL}${docId}`,
    numero: d.numeroCheque,
    tipo: 'fisico',
    direccion: 'emitido',
    origen: 'propio',
    emisor: '',
    emisorCuit: '',
    fechaEmision: d.fechaEmision ?? '',
    fechaPago: d.fechaVencimiento ?? '',
    montoCentavos: d.montoCentavos,
    estado: estadoDelOcasional(d),
    estadoBancario: d.estado,
    endosante: null,
    bancoEmisor: null,
    bancoEmisorCodigo: null,
    cliente: null,
    destinatario: d.beneficiario || null,
    fechaRecibido: null,
    fechaEntregado: null,
    utilizado: d.pagado,
    cmc7: null,
    observaciones: d.revisar.length > 0 ? d.revisar.join('; ') : null,
    movimientoBancarioId: d.movimientoBancarioId ?? null,
    movimientoCuentaId: d.movimientoCuentaId ?? null,
    movimientoFecha: d.movimientoFecha ?? null,
    fechaAcreditacion: d.fechaConciliado,
    vientriSync: true,
    vientriClave: `oca-${d.vientriId}`,
    vientriEstadoPrevio: null,
    vientriCmpIngreso: null,
    vientriCmpIngresoDesc: null,
    vientriCmpSalida: null,
    vientriCmpSalidaDesc: null,
    pagoDe: null,
    ocasionalEnriquecido: true,
    esProveedorFinanciero: d.esProveedorFinanciero,
    esRenovacion: d.esRenovacion,
    tipoProveedor: d.tipoProveedor,
    operacionUsd: d.operacionUsd,
    renovacionDe: d.renovacionDe.length > 0 ? d.renovacionDe : null,
    renovadoPor: d.renovadoPor.length > 0 ? d.renovadoPor : null,
    esInteresEncubierto: false,
    beneficiarioRealFinanciero: null,
    pendienteRenovacion: false,
    pendienteRenovacionDesde: null,
    renovadoManualmente: false,
  }
}

function esUtil(d: ChequeOcasionalDoc): boolean {
  return (
    d.baja !== true
    && !d.revisar.some((r) => r.toLowerCase().includes('imposible'))
    && Boolean(d.numeroCheque)
    && Boolean(d.fechaVencimiento)
    && d.montoCentavos > 0
  )
}

export async function cargarOcasionalesComoItems(): Promise<ChequeListadoItem[]> {
  const snap = await adminDb().collection(VIENTRI_CHEQUES_OCASIONALES).get()
  const items: ChequeListadoItem[] = []
  for (const doc of snap.docs) {
    const d = doc.data() as ChequeOcasionalDoc
    if (esUtil(d)) items.push(ocasionalAItem(doc.id, d))
  }
  return items
}

export async function getOcasionalComoItem(id: string): Promise<ChequeListadoItem | null> {
  if (!esIdOcasional(id)) return null
  const snap = await adminDb().collection(VIENTRI_CHEQUES_OCASIONALES).doc(id.slice(PREFIJO_OCASIONAL.length)).get()
  return snap.exists ? ocasionalAItem(snap.id, snap.data() as ChequeOcasionalDoc) : null
}

/** Saca de `cheques` las copias de un ocasional: las "oca-…" y las que coinciden con uno (la copia eCheq). */
export function sacarCopiasDeOcasionales(
  cheques: readonly ChequeListadoItem[],
  ocasionales: readonly ChequeListadoItem[],
): ChequeListadoItem[] {
  const porMonto = new Map<number, ChequeListadoItem[]>()
  for (const o of ocasionales) {
    const lista = porMonto.get(o.montoCentavos)
    if (lista) lista.push(o)
    else porMonto.set(o.montoCentavos, [o])
  }
  return cheques.filter((c) => {
    if (c.direccion !== 'emitido') return true
    if (c.vientriClave?.startsWith('oca-')) return false
    const candidatos = porMonto.get(c.montoCentavos)
    return !candidatos?.some((o) => sonGemelos(c, o))
  })
}

function coincideBusqueda(item: ChequeListadoItem, q: string): boolean {
  const norm = q.toLowerCase()
  return [item.numero, item.emisor, item.emisorCuit, item.cliente, item.destinatario].some(
    (campo) => typeof campo === 'string' && campo.toLowerCase().includes(norm),
  )
}

/** Mismos filtros que `cheques`, aplicados a una fila de ocasional. */
export function itemCumpleFiltro(item: ChequeListadoItem, filtro: ChequesFiltro): boolean {
  if (filtro.direccion && filtro.direccion !== 'emitido') return false
  if (filtro.origen && filtro.origen !== 'propio') return false
  if (filtro.estado && filtro.estado !== item.estado) return false
  if (filtro.tipo && filtro.tipo !== 'fisico') return false
  if (filtro.desde && item.fechaPago < filtro.desde) return false
  if (filtro.hasta && item.fechaPago > filtro.hasta) return false
  if (filtro.vinculacion === 'vinculado' && !item.movimientoBancarioId) return false
  if (filtro.vinculacion === 'sin_vincular' && item.movimientoBancarioId) return false
  if (filtro.comprobante === 'con_comprobante') return false
  if (filtro.interesEncubierto === true) return false
  if (filtro.q && !coincideBusqueda(item, filtro.q)) return false
  return dentroDelRangoMonto(item.montoCentavos, filtro)
}
