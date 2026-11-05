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

export interface FacturaCobrada {
  clave: string
  comprobante: string
  persona: { vientriId: number; nombre: string } | null
  fecha: string | null
  totalCentavos: number
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
  /** Clientes con saldo (deuda o favor), ordenados por saldo descendente. */
  clientes: ClienteCobro[]
}

export interface DetalleCliente {
  personaId: number
  nombre: string
  impagas: ComprobanteCobro[]
  cobradas: FacturaCobrada[]
}
