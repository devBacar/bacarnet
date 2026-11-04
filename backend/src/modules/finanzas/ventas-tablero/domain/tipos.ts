/** Tipos del tablero de Ventas: facturación real desde Vientri (ver finanzas/vientri/domain/ventas.ts). */

export interface ItemVentaTablero {
  idArt: number | null
  nombre: string
  centavos: number
}

export interface UnegocioVentaTablero {
  idUnegocio: number | null
  nombre: string
  centavos: number
  porcentaje: number | null
  items: ItemVentaTablero[]
}

export interface ClienteVentaTablero {
  vientriId: number
  nombre: string
  centavos: number
  porUnegocio: Array<{ idUnegocio: number | null; nombre: string; centavos: number }>
}

export interface MesTendenciaTablero {
  mes: string
  totalCentavos: number
}

export interface TableroVentas {
  mes: string
  moneda: string
  generadoEn: string
  totalCentavos: number
  totalMesAnteriorCentavos: number
  variacionPorcentaje: number | null
  cantidadComprobantes: number
  cantidadClientes: number
  ticketPromedioCentavos: number
  /** % del total que representan los 5 clientes más grandes del mes (concentración de cartera). */
  concentracionTop5Porcentaje: number | null
  /** Últimos 6 meses (incluido el actual), para el gráfico de evolución. */
  tendencia: MesTendenciaTablero[]
  porUnegocio: UnegocioVentaTablero[]
  /** Top ítems facturados del mes, across todas las unidades de negocio. */
  topItems: ItemVentaTablero[]
  clientes: ClienteVentaTablero[]
  /** true si items.csv/unegocio.csv todavía no llegaron en ninguna importación: el desglose por ítem/unidad queda vacío. */
  sinDatosDeItems: boolean
}
