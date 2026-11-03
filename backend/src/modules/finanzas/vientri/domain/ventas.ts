/**
 * Ventas (facturación real) para el tablero "Ventas". Usa comprobantes.csv (ya requerido para
 * pendientes) más tres archivos OPCIONALES que, al escribir esto, el script de exportación de
 * Vientri todavía no genera: items.csv (líneas de cmp, tabla SQL `items`), unegocio.csv (catálogo
 * `UNEGOCIO`) y art.csv (catálogo `ART`). Mientras no estén, se arman igual los comprobantes de
 * venta (con idUnegocio null y sin items) y el tablero muestra "sin datos" en el mix por unidad de
 * negocio e ítem, en vez de romper. Aditivo: no cambia nada de cheques/pendientes/agenda.
 */
import type { FilaCsv } from './csv.js'
import { ladoPendiente, textoComprobante } from './comprobantes.js'
import { refPersona } from './personas.js'
import type { PersonaRef, VientriPersonaDoc } from './tipos.js'
import { aBool, aCentavos, aEntero, aFecha, aTexto } from './valores.js'

export interface VientriComprobanteDoc {
  id: number
  idTcmp: number | null
  tipo: string | null
  comprobante: string
  persona: PersonaRef | null
  fecha: string | null
  totalCentavos: number
  netoCentavos: number | null
  ivaCentavos: number | null
  idDivisa: number | null
  moneda: string | null
  idUnegocio: number | null
  abierto: boolean
  nombreCf: string | null
  baja: boolean
  fecsys: string | null
}

export interface VientriItemComprobanteDoc {
  id: string
  idCmp: number
  idArt: number | null
  cantidad: number | null
  importeCentavos: number
  fecsys: string | null
}

export interface VientriUnegocioDoc {
  id: number
  des: string
}

export interface VientriArtDoc {
  id: number
  des: string
}

/**
 * Las 6 unidades de negocio de Vientri son casi fijas (catálogo chico, casi no cambia). Se usan como
 * respaldo en el dominio (no en Firestore) para que el tablero de Ventas nunca se quede sin nombres
 * aunque unegocio.csv todavía no esté importado.
 */
export const UNEGOCIO_SEED: VientriUnegocioDoc[] = [
  { id: 1, des: 'SERVICIO DE SEGURIDAD' },
  { id: 2, des: 'PROTECCIÓN DE VALORES' },
  { id: 3, des: 'SERVICIOS TERCERIZADOS DE TESORERIA' },
  { id: 4, des: 'COMERCILIZACION SS ATM' },
  { id: 5, des: 'ALQUILER DE MÁQUINAS DE RECUENTO' },
  { id: 6, des: 'ALQUILER DE GRÚAS PARA TRASLADO' },
]

/** Todos los comprobantes de venta (lado "cobrar": facturas y notas a clientes), estén o no abiertos. */
export function armarComprobantesVenta(
  filas: FilaCsv[],
  personas: Map<number, VientriPersonaDoc>,
  monedas: Map<number, string>,
): VientriComprobanteDoc[] {
  const salida: VientriComprobanteDoc[] = []
  for (const f of filas) {
    if (aBool(f.baja)) continue
    const id = aEntero(f.vientri_id)
    if (id === null) continue
    const { lado, nombre } = ladoPendiente(f.nom_tipo)
    if (lado !== 'cobrar') continue
    const personaId = aEntero(f.id_persona)
    const divisaId = aEntero(f.id_divisa)
    salida.push({
      id,
      idTcmp: aEntero(f.id_tipo),
      tipo: nombre ?? aTexto(f.nom_tipo),
      comprobante: textoComprobante(f),
      persona: refPersona(personas, personaId),
      fecha: aFecha(f.fecha),
      totalCentavos: aCentavos(f.total) ?? 0,
      // neto/iva/id_unegocio/nombre_cf: columnas opcionales, todavía no confirmadas en el export.
      netoCentavos: aCentavos(f.neto),
      ivaCentavos: aCentavos(f.iva),
      idDivisa: divisaId,
      moneda: divisaId !== null ? monedas.get(divisaId) ?? null : null,
      idUnegocio: aEntero(f.id_unegocio),
      abierto: aBool(f.abierto),
      nombreCf: aTexto(f.nombre_cf),
      baja: false,
      fecsys: aTexto(f.fecsys),
    })
  }
  return salida
}

export function armarItemsComprobante(filas: FilaCsv[]): VientriItemComprobanteDoc[] {
  const salida: VientriItemComprobanteDoc[] = []
  let i = 0
  for (const f of filas) {
    const idCmp = aEntero(f.id_cmp)
    if (idCmp === null) continue
    const idRaw = aTexto(f.vientri_id)
    i += 1
    salida.push({
      id: `item-${idRaw ?? `${idCmp}-${i}`}`,
      idCmp,
      idArt: aEntero(f.id_art),
      cantidad: aEntero(f.cantidad),
      importeCentavos: aCentavos(f.importe) ?? 0,
      fecsys: aTexto(f.fecsys),
    })
  }
  return salida
}

export function armarUnegocio(filas: FilaCsv[]): VientriUnegocioDoc[] {
  const salida: VientriUnegocioDoc[] = []
  for (const f of filas) {
    const id = aEntero(f.vientri_id)
    const des = aTexto(f.des)
    if (id !== null && des) salida.push({ id, des })
  }
  return salida.length > 0 ? salida : UNEGOCIO_SEED
}

export function armarArt(filas: FilaCsv[]): VientriArtDoc[] {
  const salida: VientriArtDoc[] = []
  for (const f of filas) {
    const id = aEntero(f.vientri_id)
    const des = aTexto(f.des)
    if (id !== null && des) salida.push({ id, des })
  }
  return salida
}
