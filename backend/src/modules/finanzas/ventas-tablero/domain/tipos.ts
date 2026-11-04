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
  /** Mismo total pero del mes anterior, para la variación y la alerta de caída. */
  centavosMesAnterior: number
  variacionPorcentaje: number | null
  /** true si cayó 20% o más vs. el mes anterior (y el mes anterior tenía facturación). */
  caidaFuerte: boolean
}

export interface ClienteVentaTablero {
  vientriId: number
  nombre: string
  centavos: number
  porUnegocio: Array<{ idUnegocio: number | null; nombre: string; centavos: number }>
}

export interface ClientePerdidoTablero {
  vientriId: number
  nombre: string
  centavosMesAnterior: number
}

export interface MesTendenciaTablero {
  mes: string
  totalCentavos: number
}

export interface TendenciaUnegocioMes {
  mes: string
  porUnegocio: Array<{ idUnegocio: number | null; nombre: string; centavos: number }>
}

export interface ComparativoInteranual {
  mesAnioAnterior: string
  totalCentavos: number
  variacionPorcentaje: number | null
}

export interface ProyeccionVentas {
  totalProyectadoCentavos: number
  diasHabilesTranscurridos: number
  diasHabilesTotales: number
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
  /** Igual que `tendencia`, pero con el desglose por unidad de negocio de cada mes (mix mensual). */
  tendenciaPorUnegocio: TendenciaUnegocioMes[]
  /** Mismo mes, un año atrás. */
  comparativoInteranual: ComparativoInteranual
  /** Solo si `mes` es el mes en curso: ventas acumuladas proyectadas a fin de mes por días hábiles. */
  proyeccion: ProyeccionVentas | null
  porUnegocio: UnegocioVentaTablero[]
  /** Top ítems facturados del mes, across todas las unidades de negocio. */
  topItems: ItemVentaTablero[]
  clientes: ClienteVentaTablero[]
  /** Clientes que facturaron este mes y no facturaron el mes anterior (altas), ordenados por monto. */
  clientesNuevos: ClienteVentaTablero[]
  /** Clientes que facturaron el mes anterior y no facturaron este mes (bajas/riesgo). */
  clientesPerdidos: ClientePerdidoTablero[]
  /** true si items.csv/unegocio.csv todavía no llegaron en ninguna importación: el desglose por ítem/unidad queda vacío. */
  sinDatosDeItems: boolean
}
