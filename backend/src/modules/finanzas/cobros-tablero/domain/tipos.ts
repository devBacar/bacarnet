/** Tipos del tablero de Cobros: cuentas corrientes de clientes y facturas emitidas, desde Vientri. */

export type BucketAntiguedad = '0-30' | '31-60' | '61-90' | 'mas90'

export interface ComprobanteCobro {
  clave: string
  comprobante: string
  fecha: string | null
  fechaVencimiento: string | null
  totalCentavos: number
  pendienteCentavos: number
  /** Días desde el vencimiento hasta `hoy`. null si no está vencida (a vencer o es un saldo a favor). */
  diasVencido: number | null
  bucket: BucketAntiguedad | null
}

export interface ClienteCobro {
  personaId: number
  nombre: string
  cuit: string | null
  /** Suma de pendientes positivos (deuda real, ya neta de notas de crédito imputadas). */
  deudaCentavos: number
  /** Suma de pendientes negativos, en positivo (crédito sin aplicar a favor del cliente). */
  favorCentavos: number
  /** deuda - favor: lo que neto queda debiendo (negativo = Bacar le debe a él). */
  saldoCentavos: number
  /** De la deuda, cuánto ya pasó su fecha de vencimiento. */
  vencidoCentavos: number
  /** De la deuda, cuánto todavía no vence. */
  aVencerCentavos: number
  comprobantes: ComprobanteCobro[]
}

/**
 * Un pago real (total o parcial) que canceló una factura, con su fecha real de cobro (la del
 * comprobante de pago/recibo/OP, no la de la factura). Una factura con dos pagos parciales en fechas
 * distintas aparece como dos `FacturaCobrada`.
 */
export interface FacturaCobrada {
  clave: string
  /** Id del comprobante (factura) cancelado, para no contar dos veces el mismo cobro desde dos fuentes. */
  idCmpFactura: number
  comprobante: string
  persona: { vientriId: number; nombre: string } | null
  fechaCobro: string | null
  /** Lo que se cobró en ESTE pago, no el total de la factura. */
  importeCobradoCentavos: number
  /**
   * 'vientri': confirmado por `aplicaciones.csv` (fuente definitiva). 'banco': todavía no llegó la
   * confirmación de Vientri; se infirió del crédito bancario (CUIT + monto exacto). Provisorio: cuando
   * Vientri confirma esa misma factura, este registro deja de mostrarse (no se duplica).
   */
  fuente: 'vientri' | 'banco'
}

export interface TableroCobros {
  moneda: string
  generadoEn: string
  /** Fecha (AAAA-MM-DD) usada como "hoy" para calcular vencido/a vencer y antigüedad. */
  hoy: string
  /** Rango usado para "cobrado en el período". */
  periodo: { desde: string; hasta: string }
  totalACobrarCentavos: number
  totalFavorCentavos: number
  totalVencidoCentavos: number
  totalAVencerCentavos: number
  /** Antigüedad de la deuda vencida, por bucket. */
  antiguedad: Record<BucketAntiguedad, number>
  cantidadClientesConDeuda: number
  cobradoEnPeriodoCentavos: number
  cantidadFacturasCobradasEnPeriodo: number
  /**
   * Créditos bancarios de HOY que todavía no se pudieron clasificar (ni cheque, ni transferencia, ni
   * factura de Vientri): puede ser falta de CUIT, un monto que no cierra exacto, o algo que no es un
   * cobro de factura. No está incluido en `cobradoEnPeriodoCentavos`. Se muestra para avisar que el
   * número de arriba puede estar incompleto, en vez de mostrarlo como si fuera definitivo.
   */
  sinClasificarHoy: { cantidad: number; montoCentavos: number }
  /** Clientes con saldo (deuda o favor), ordenados por saldo descendente. */
  clientes: ClienteCobro[]
}

export interface DetalleCliente {
  personaId: number
  nombre: string
  impagas: ComprobanteCobro[]
  cobradas: FacturaCobrada[]
}
