/**
 * Compras de combustible a proveedores (estaciones de servicio, YPF, Shell, Axion, GNC, etc.) para el
 * tablero de Combustible. Usa compras_combustible.csv (archivo OPCIONAL, ver
 * scripts/vientri-export/sql/24_compras_combustible.sql): si no vino en la exportación, el tablero
 * queda vacío en vez de romper.
 *
 * Solo trae facturas y notas de débito/crédito (FAA, FCG, ND... y NC...): quedan afuera a propósito los
 * remitos, recibos de cobro y órdenes de pago (no son el monto de la factura). Decisión confirmada
 * con el usuario el 2026-11-04.
 *
 * Importante: Vientri NO tiene (desde fines de 2024) el dato de a qué móvil corresponde cada carga de
 * combustible — eso se dejó de cargar (tabla VALECOM, histórico 2000-2024, fuera del alcance de este
 * tablero por ahora). Este módulo arma gasto total por mes/proveedor/unidad de negocio, nunca por móvil.
 */
import type { FilaCsv } from './csv.js'
import { aBool, aCentavos, aEntero, aFecha, aTexto } from './valores.js'

export interface VientriCompraCombustibleDoc {
  id: number
  nomTipo: string | null
  fecha: string | null
  idProveedor: number | null
  nombreProveedor: string | null
  /** Ya con el signo aplicado: positivo para facturas/ND, negativo para NC (notas de crédito). */
  totalCentavos: number
  idDivisa: number | null
  moneda: string | null
  idUnegocio: number | null
  baja: boolean
  fecsys: string | null
}

/** Notas de crédito restan del gasto; el resto (facturas y notas de débito) suma. */
function signoDe(nomTipo: string | null): 1 | -1 {
  const t = (nomTipo ?? '').trim().toUpperCase()
  return t.startsWith('NC') ? -1 : 1
}

export function armarComprasCombustible(filas: FilaCsv[], monedas: Map<number, string>): VientriCompraCombustibleDoc[] {
  const salida: VientriCompraCombustibleDoc[] = []
  for (const f of filas) {
    if (aBool(f.baja)) continue
    const id = aEntero(f.vientri_id)
    if (id === null) continue
    const nomTipo = aTexto(f.nom_tipo)
    const divisaId = aEntero(f.id_divisa)
    const totalBruto = aCentavos(f.total) ?? 0
    salida.push({
      id,
      nomTipo,
      fecha: aFecha(f.fecha),
      idProveedor: aEntero(f.id_proveedor),
      nombreProveedor: aTexto(f.nombre_proveedor),
      totalCentavos: Math.abs(totalBruto) * signoDe(nomTipo),
      idDivisa: divisaId,
      moneda: divisaId !== null ? monedas.get(divisaId) ?? null : null,
      idUnegocio: aEntero(f.id_unegocio),
      baja: false,
      fecsys: aTexto(f.fecsys),
    })
  }
  return salida
}
