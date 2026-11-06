import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'

/** Proveedor del catálogo al que corresponde un nombre (entrada de `mapaProveedoresFinancieros`). */
export interface ProveedorDelCatalogo {
  id: string
  nombre: string
}

export interface ProveedorResuelto {
  /** null si el nombre no está en el catálogo (queda como está escrito). */
  proveedorId: string | null
  nombre: string
  /** Para agrupar: el id del proveedor, o el nombre normalizado si no está en el catálogo. */
  clave: string
}

/**
 * A qué proveedor corresponde un beneficiario. Misma regla que la importación: nombre normalizado
 * contra el nombre y los alias del catálogo. Así, todas las formas de escribirlo caen en el mismo proveedor.
 */
export function resolverProveedor(
  beneficiario: string,
  beneficiarioNormalizado: string,
  catalogo: ReadonlyMap<string, ProveedorDelCatalogo>,
): ProveedorResuelto {
  const p = beneficiarioNormalizado !== '' ? catalogo.get(beneficiarioNormalizado) : undefined
  if (p) return { proveedorId: p.id, nombre: p.nombre, clave: `pf:${p.id}` }
  return { proveedorId: null, nombre: beneficiario, clave: `b:${beneficiarioNormalizado}` }
}

export interface ChequeDeOperacionUsd {
  numeroCheque: string
  montoCentavos: number
  fechaVencimiento: string | null
  fechaEmision: string | null
}

export interface OperacionUsdAgrupada {
  /** Nombre del proveedor en el catálogo, o como está escrito si no está cargado. */
  beneficiario: string
  beneficiarioNormalizado: string
  proveedorId: string | null
  fechaEmision: string | null
  montoUsd: number
  cotizacion: number
  equivalenteCentavos: number
  cantidadCheques: number
  sumaChequesCentavos: number
  obsComun: string
  cheques: ChequeDeOperacionUsd[]
}

export interface UsdPorProveedor {
  beneficiario: string
  proveedorId: string | null
  cantidadOperaciones: number
  cantidadCheques: number
  totalUsd: number
  /** Cotización promedio ponderada por monto USD. */
  cotizacionPromedio: number
  equivalenteCentavos: number
  sumaChequesCentavos: number
  operaciones: OperacionUsdAgrupada[]
}

/**
 * Una operación USD partida en varios cheques: mismo proveedor, monto USD, cotización y fecha de emisión.
 * El proveedor sale del catálogo, así GONZALES y GONZALEZ son la misma operación si están juntados.
 */
export function agruparOperacionesUsd(
  docs: ChequeOcasionalDoc[],
  catalogo: ReadonlyMap<string, ProveedorDelCatalogo>,
): OperacionUsdAgrupada[] {
  const grupos = new Map<string, OperacionUsdAgrupada>()
  for (const d of docs) {
    if (!d.operacionUsd) continue
    const prov = resolverProveedor(d.beneficiario, d.beneficiarioNormalizado, catalogo)
    const key = `${prov.clave}|${d.operacionUsd.montoUsd}|${d.operacionUsd.cotizacion}|${d.fechaEmision ?? ''}`
    const cheque = { numeroCheque: d.numeroCheque, montoCentavos: d.montoCentavos, fechaVencimiento: d.fechaVencimiento, fechaEmision: d.fechaEmision }
    const existente = grupos.get(key)
    if (existente) {
      existente.cantidadCheques += 1
      existente.sumaChequesCentavos += d.montoCentavos
      existente.cheques.push(cheque)
      continue
    }
    grupos.set(key, {
      beneficiario: prov.nombre,
      beneficiarioNormalizado: d.beneficiarioNormalizado,
      proveedorId: prov.proveedorId,
      fechaEmision: d.fechaEmision,
      montoUsd: d.operacionUsd.montoUsd,
      cotizacion: d.operacionUsd.cotizacion,
      equivalenteCentavos: Math.round(d.operacionUsd.montoUsd * d.operacionUsd.cotizacion * 100),
      cantidadCheques: 1,
      sumaChequesCentavos: d.montoCentavos,
      obsComun: d.obsOriginal,
      cheques: [cheque],
    })
  }
  return [...grupos.values()].sort((a, b) => b.sumaChequesCentavos - a.sumaChequesCentavos)
}

/** Las operaciones USD sumadas por proveedor, de la que más plata movió a la que menos. */
export function resumirUsdPorProveedor(operaciones: OperacionUsdAgrupada[]): UsdPorProveedor[] {
  const grupos = new Map<string, UsdPorProveedor & { ponderado: number }>()
  for (const op of operaciones) {
    const key = op.proveedorId ? `pf:${op.proveedorId}` : `b:${op.beneficiarioNormalizado}`
    let g = grupos.get(key)
    if (!g) {
      g = {
        beneficiario: op.beneficiario,
        proveedorId: op.proveedorId,
        cantidadOperaciones: 0,
        cantidadCheques: 0,
        totalUsd: 0,
        cotizacionPromedio: 0,
        equivalenteCentavos: 0,
        sumaChequesCentavos: 0,
        operaciones: [],
        ponderado: 0,
      }
      grupos.set(key, g)
    }
    g.cantidadOperaciones += 1
    g.cantidadCheques += op.cantidadCheques
    g.totalUsd += op.montoUsd
    g.ponderado += op.montoUsd * op.cotizacion
    g.equivalenteCentavos += op.equivalenteCentavos
    g.sumaChequesCentavos += op.sumaChequesCentavos
    g.operaciones.push(op)
  }
  return [...grupos.values()]
    .map(({ ponderado, ...g }) => ({ ...g, cotizacionPromedio: g.totalUsd > 0 ? Math.round(ponderado / g.totalUsd) : 0 }))
    .sort((a, b) => b.sumaChequesCentavos - a.sumaChequesCentavos || a.beneficiario.localeCompare(b.beneficiario, 'es'))
}
