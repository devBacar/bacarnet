import { adminDb } from '../../../../lib/firebase/admin.js'
import { UNEGOCIO_SEED } from '../../vientri/domain/ventas.js'
import { VIENTRI_COMPRAS_COMBUSTIBLE, VIENTRI_UNEGOCIO } from '../../vientri/services/vientri.repository.js'

export const PRIMER_MES_CON_DATOS = '2025-01'

export interface CompraCombustibleRow {
  id: number
  nomTipo: string | null
  fecha: string | null
  idProveedor: number | null
  nombreProveedor: string | null
  totalCentavos: number
  idUnegocio: number | null
}

/**
 * Trae todas las compras de combustible desde `PRIMER_MES_CON_DATOS` hasta `hastaMes` (incluido), en
 * una sola query. Es el único dato que necesita el tablero: se agrupa por mes/proveedor/año en memoria
 * (volumen bajo: unos cientos de comprobantes por mes).
 */
export async function cargarComprasCombustible(hastaMes: string): Promise<CompraCombustibleRow[]> {
  const desde = `${PRIMER_MES_CON_DATOS}-01`
  const hasta = `${hastaMes}-31`
  const snap = await adminDb()
    .collection(VIENTRI_COMPRAS_COMBUSTIBLE)
    .where('fecha', '>=', desde)
    .where('fecha', '<=', hasta)
    .get()
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: Number(data.id) || 0,
      nomTipo: typeof data.nomTipo === 'string' ? data.nomTipo : null,
      fecha: typeof data.fecha === 'string' ? data.fecha : null,
      idProveedor: typeof data.idProveedor === 'number' ? data.idProveedor : null,
      nombreProveedor: typeof data.nombreProveedor === 'string' ? data.nombreProveedor : null,
      totalCentavos: Number(data.totalCentavos) || 0,
      idUnegocio: typeof data.idUnegocio === 'number' ? data.idUnegocio : null,
    }
  })
}

/** Mismo catálogo que usa el tablero de Ventas (6 unidades de negocio de Vientri). */
export async function cargarUnegocio(): Promise<Map<number, string>> {
  const unegocio = new Map<number, string>()
  const snap = await adminDb().collection(VIENTRI_UNEGOCIO).get()
  if (snap.empty) {
    for (const u of UNEGOCIO_SEED) unegocio.set(u.id, u.des)
  } else {
    for (const d of snap.docs) {
      const data = d.data()
      if (typeof data.id === 'number' && typeof data.des === 'string') unegocio.set(data.id, data.des)
    }
  }
  return unegocio
}
