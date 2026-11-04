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

/**
 * ID de divisa en Vientri (tabla DIVISA) para cada moneda que soporta el tablero. Confirmado contra
 * la base real: 1 = Pesos ($), 4 = Dólares (US). Hay otras (CCL, MEP, euros, reales...) pero son
 * marginales (0 comprobantes de venta reales al armar esto) y no tienen vista propia todavía.
 */
const ID_DIVISA_POR_MONEDA: Record<'ARS' | 'USD', number> = { ARS: 1, USD: 4 }

function idDivisaDe(moneda: string): number {
  return ID_DIVISA_POR_MONEDA[moneda === 'USD' ? 'USD' : 'ARS']
}

/**
 * Lee comprobantes de venta del mes (fecha YYYY-MM) + catálogos, filtrados por moneda.
 * El filtro de moneda se hace en memoria (no en la query) para no depender de un índice compuesto
 * sobre fecha+idDivisa; el volumen mensual (cientos de filas) lo permite sin problema.
 * Join comprobante↔items se hace en memoria.
 */
export async function cargarDatosVentasMes(mes: string, moneda: string): Promise<DatosVentasMes> {
  const desde = `${mes}-01`
  const hasta = `${mes}-31`
  const idDivisa = idDivisaDe(moneda)
  const snapCmp = await adminDb()
    .collection(VIENTRI_COMPROBANTES)
    .where('fecha', '>=', desde)
    .where('fecha', '<=', hasta)
    .get()
  const comprobantes: ComprobanteVentaRow[] = snapCmp.docs
    .filter((d) => {
      const idDivisaReal = typeof d.data().idDivisa === 'number' ? d.data().idDivisa : 1
      // Pesos es el default de Vientri cuando no viene idDivisa: sin dato = ARS, nunca USD.
      return idDivisaReal === idDivisa
    })
    .map((d) => {
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

/** Solo el total facturado del mes, filtrado por moneda (sin traer items ni catálogos): para el gráfico de evolución mensual. */
export async function cargarTotalMes(mes: string, moneda: string): Promise<number> {
  const desde = `${mes}-01`
  const hasta = `${mes}-31`
  const idDivisa = idDivisaDe(moneda)
  const snap = await adminDb()
    .collection(VIENTRI_COMPROBANTES)
    .where('fecha', '>=', desde)
    .where('fecha', '<=', hasta)
    .select('totalCentavos', 'idDivisa')
    .get()
  let total = 0
  for (const d of snap.docs) {
    const data = d.data()
    const idDivisaReal = typeof data.idDivisa === 'number' ? data.idDivisa : 1
    if (idDivisaReal !== idDivisa) continue
    total += Number(data.totalCentavos) || 0
  }
  return total
}

export interface TendenciaMesDetallada {
  mes: string
  totalCentavos: number
  /** Desglose del total por unidad de negocio, ese mes (sin resolver nombre todavía). */
  porUnegocio: Array<{ idUnegocio: number | null; centavos: number }>
}

/**
 * Totales mensuales + desglose por unidad de negocio para el rango de `meses`, en UNA sola query
 * (antes era una query por mes solo para el total). Para el gráfico de evolución y el de mix mensual.
 */
export async function cargarTendenciaRango(meses: string[], moneda: string): Promise<TendenciaMesDetallada[]> {
  const idDivisa = idDivisaDe(moneda)
  const desde = `${meses[0]}-01`
  const hasta = `${meses[meses.length - 1]}-31`
  const snap = await adminDb()
    .collection(VIENTRI_COMPROBANTES)
    .where('fecha', '>=', desde)
    .where('fecha', '<=', hasta)
    .select('fecha', 'totalCentavos', 'idDivisa', 'idUnegocio')
    .get()
  const porMes = new Map<string, { total: number; porUn: Map<string, number> }>(meses.map((m) => [m, { total: 0, porUn: new Map() }]))
  for (const d of snap.docs) {
    const data = d.data()
    const idDivisaReal = typeof data.idDivisa === 'number' ? data.idDivisa : 1
    if (idDivisaReal !== idDivisa) continue
    const mes = typeof data.fecha === 'string' ? data.fecha.slice(0, 7) : null
    const entrada = mes ? porMes.get(mes) : undefined
    if (!entrada) continue
    const total = Number(data.totalCentavos) || 0
    entrada.total += total
    const idUn = typeof data.idUnegocio === 'number' ? data.idUnegocio : null
    const clave = idUn !== null ? String(idUn) : 'sin-unegocio'
    entrada.porUn.set(clave, (entrada.porUn.get(clave) ?? 0) + total)
  }
  return meses.map((mes) => {
    const entrada = porMes.get(mes)!
    return {
      mes,
      totalCentavos: entrada.total,
      porUnegocio: [...entrada.porUn.entries()].map(([clave, centavos]) => ({
        idUnegocio: clave === 'sin-unegocio' ? null : Number(clave),
        centavos,
      })),
    }
  })
}

export interface HistorialClienteMes {
  mes: string
  totalCentavos: number
}

/**
 * Facturación mensual de UN cliente en el rango de `meses` (para el detalle al hacer click en el
 * ranking). Una sola query por rango de fechas, filtra por persona e idDivisa en memoria.
 */
export async function cargarHistorialCliente(vientriId: number, meses: string[], moneda: string): Promise<HistorialClienteMes[]> {
  const idDivisa = idDivisaDe(moneda)
  const desde = `${meses[0]}-01`
  const hasta = `${meses[meses.length - 1]}-31`
  const snap = await adminDb()
    .collection(VIENTRI_COMPROBANTES)
    .where('fecha', '>=', desde)
    .where('fecha', '<=', hasta)
    .select('fecha', 'totalCentavos', 'idDivisa', 'persona')
    .get()
  const porMes = new Map<string, number>(meses.map((m) => [m, 0]))
  for (const d of snap.docs) {
    const data = d.data()
    const idDivisaReal = typeof data.idDivisa === 'number' ? data.idDivisa : 1
    if (idDivisaReal !== idDivisa) continue
    if (!data.persona || data.persona.vientriId !== vientriId) continue
    const mes = typeof data.fecha === 'string' ? data.fecha.slice(0, 7) : null
    if (mes && porMes.has(mes)) porMes.set(mes, (porMes.get(mes) ?? 0) + (Number(data.totalCentavos) || 0))
  }
  return meses.map((mes) => ({ mes, totalCentavos: porMes.get(mes) ?? 0 }))
}
