/** Montos por mes: clave AAAA-MM. */
export type MontosPorMes = Record<string, number>

/** [mes (índice en meses), línea, clase (sue/otr/imp/ban), categoría (índice en cats), cuenta (índice en cuentas), centro de costo (índice en ccs), importe] */
export type FilaCostoCruda = [number, string, string, number, number, number, number]

/** [mes (índice), proveedor (índice en provs), cuenta (índice), importe] */
export type FilaProveedorCruda = [number, number, number, number]

export interface ClienteNegocio {
  id: number
  n: string
  /** Cliente del sector público. */
  pub: boolean
  /** Facturado sin IVA, por mes. */
  f: MontosPorMes
  /** Facturado con IVA, por mes. */
  t: MontosPorMes
  /** Cobrado, por mes. */
  c: MontosPorMes
  /** Servicios (remitos), por mes. */
  r: MontosPorMes
  dias: number | null
  atraso: number | null
  deuda: number | null
}

export interface ComprasMes {
  facturas: number
  proveedores: number
  chicas: number
  chicasMonto: number
}

export interface DeudaNegocio {
  id: number
  nombre: string
  pendiente: number
  tramos: Record<string, number>
  facturas: number
  masVieja: string
  vencido: number
}

export interface CobroCliente {
  id: number
  cliente: string
  dias: number
  atraso: number
  cobrado: number
}

export interface CobranzasNegocio {
  diasCobro: number
  atrasoCobro: number
  cobroCliente: CobroCliente[]
  tendCobro?: MontosPorMes
  diasPago: number
  pagoProveedor?: Array<{ id: number; proveedor: string; dias: number; pagado: number }>
  tendPago?: MontosPorMes
  deudaClientes: DeudaNegocio[]
  tramosClientes: Record<string, number>
  deudaProveedores: DeudaNegocio[]
  tramosProveedores: Record<string, number>
  deudaImpuestos: DeudaNegocio[]
  tramosImpuestos: Record<string, number>
}

export interface InversionNegocio {
  cuenta: string
  prov: string
  imp: number
}

/** Precio de un artículo en un mes: [cantidad, facturado, precio unitario] (servicios) o solo el precio (abonos fijos). */
export type PrecioMes = number | [number, number, number]

export interface ItemsTarifas {
  /** id de artículo -> [nombre, línea, unidad] */
  arts: Record<string, [string, string, string]>
  red_n: Record<string, string>
  /** [cliente, artículo, precios por mes] de servicios con cantidad. */
  s: Array<[number, string, Record<string, PrecioMes>]>
  /** [cliente, artículo, precios por mes] de abonos fijos. */
  f: Array<[number, string, Record<string, PrecioMes>]>
  /** [cliente, artículo, mes, importe] de redeterminaciones. */
  red: Array<[number, string, string, number]>
  /** Índice de precios por línea (enero 2025 = 100). */
  idx: Record<string, Record<string, number>>
}

/** Costo laboral que llena RRHH para los meses sin sueldos en Vientri. Lo completa el backend más adelante (opcional). */
export interface RrhhNegocio {
  /** mes -> línea (seg, cau, tes, gru, est) -> importe */
  meses: Record<string, Record<string, number>>
  nombres?: Record<string, string>
}

export interface DatosTableroNegocio {
  meses: string[]
  cuentas: string[]
  ccs: string[]
  cats: string[]
  provs: string[]
  costos: FilaCostoCruda[]
  prov: FilaProveedorCruda[]
  /** Ventas por línea (cau, seg, tes, gru, otr) y mes. */
  lineasIng: Record<string, MontosPorMes>
  clientes: ClienteNegocio[]
  compras: Record<string, ComprasMes>
  cobTot: MontosPorMes
  dolar: MontosPorMes
  cob: CobranzasNegocio
  inversiones: InversionNegocio[]
  /** Inflación interanual de referencia (0,33 = 33%). */
  inflacion: number
  /** cliente -> línea -> mes -> facturado */
  cliLin?: Record<string, Record<string, MontosPorMes>>
  /** cliente -> línea -> mes -> cobrado estimado */
  cobCliLin?: Record<string, Record<string, MontosPorMes>>
  /** línea -> mes -> cobrado estimado */
  cobLin?: Record<string, MontosPorMes>
  items?: ItemsTarifas
  rrhh?: RrhhNegocio | null
}

/** Una fila de costo ya resuelta (con los textos en lugar de los índices). */
export interface FilaCosto {
  m: string
  lin: string
  cla: string
  cat: string
  cuenta: string
  cc: string
  imp: number
}

export interface FilaProveedor {
  m: string
  prov: string
  cuenta: string
  imp: number
}

export type Periodo = [id: string, titulo: string, meses: string[]]
