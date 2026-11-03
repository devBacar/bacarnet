import { adminDb } from '../../../../lib/firebase/admin.js'
import {
  VIENTRI_ART,
  VIENTRI_COMPROBANTES,
  VIENTRI_ITEMS_COMPROBANTE,
  VIENTRI_UNEGOCIO,
} from '../../vientri/services/vientri.repository.js'
import { UNEGOCIO_SEED } from '../../vientri/domain/ventas.js'

export interface ComprobanteVentaRow {
  id: number
  persona: { vientriId: number; nombre: string | null } | null
  fecha: string | null
  totalCentavos: number
  idUnegocio: number | null
  moneda: string | null
}

export interface ItemComprobanteRow {
  idCmp: number
  idArt: number | null
  importeCentavos: number
}

export interface DatosVentasMes {
  comprobantes: ComprobanteVentaRow[]
  items: ItemComprobanteRow[]
  unegocio: Map<number, string>
  art: Map<number, string>
}

/** Lee comprobantes de venta del mes (fecha YYYY-MM) + catálogos. Join comprobante↔items se hace en memoria. */
export async function cargarDatosVentasMes(mes: string): Promise<DatosVentasMes> {
  const desde = `${mes}-01`
  const hasta = `${mes}-31`
  const snapCmp = await adminDb()
    .collection(VIENTRI_COMPROBANTES)
    .where('fecha', '>=', desde)
    .where('fecha', '<=', hasta)
    .get()
  const comprobantes: ComprobanteVentaRow[] = snapCmp.docs.map((d) => {
    const data = d.data()
    return {
      id: Number(data.id) || 0,
      persona: data.persona ?? null,
      fecha: typeof data.fecha === 'string' ? data.fecha : null,
      totalCentavos: Number(data.totalCentavos) || 0,
      idUnegocio: typeof data.idUnegocio === 'number' ? data.idUnegocio : null,
      moneda: typeof data.moneda === 'string' ? data.moneda : null,
    }
  })

  const idsCmp = new Set(comprobantes.map((c) => c.id))
  const items: ItemComprobanteRow[] = []
  if (idsCmp.size > 0) {
    // Las colecciones de items pueden ser grandes: se trae todo y se filtra en memoria (dataset chico por ahora).
    const snapItems = await adminDb().collection(VIENTRI_ITEMS_COMPROBANTE).get()
    for (const d of snapItems.docs) {
      const data = d.data()
      const idCmp = Number(data.idCmp)
      if (!idsCmp.has(idCmp)) continue
      items.push({
        idCmp,
        idArt: typeof data.idArt === 'number' ? data.idArt : null,
        importeCentavos: Number(data.importeCentavos) || 0,
      })
    }
  }

  const unegocio = new Map<number, string>()
  const snapUn = await adminDb().collection(VIENTRI_UNEGOCIO).get()
  if (snapUn.empty) {
    for (const u of UNEGOCIO_SEED) unegocio.set(u.id, u.des)
  } else {
    for (const d of snapUn.docs) {
      const data = d.data()
      if (typeof data.id === 'number' && typeof data.des === 'string') unegocio.set(data.id, data.des)
    }
  }

  const art = new Map<number, string>()
  const snapArt = await adminDb().collection(VIENTRI_ART).get()
  for (const d of snapArt.docs) {
    const data = d.data()
    if (typeof data.id === 'number' && typeof data.des === 'string') art.set(data.id, data.des)
  }

  return { comprobantes, items, unegocio, art }
}

/** true si alguna vez se importaron items de comprobante (sirve para avisar "sin datos" en el tablero). */
export async function hayItemsImportados(): Promise<boolean> {
  const snap = await adminDb().collection(VIENTRI_ITEMS_COMPROBANTE).limit(1).get()
  return !snap.empty
}
