/** Operación de compra de dólares pagada con cheques ocasionales. */

export interface OperacionDolaresDetalle {
  numeroCheque: string          // puede quedar vacío si aún no se asignó
  fechaCobro: string            // YYYY-MM-DD
  dias: number                  // días desde fecha operación hasta cobro
  importeCentavos: number       // valor nominal del cheque
  tasaEquivalenteCentavos: number // interés calculado = tasaDiaria × días × importe
  descuentoCentavos: number     // impuesto al cheque = imp% × importe
  importeLiquidarCentavos: number // importe - tasaEquivalente - descuento
}

export interface OperacionDolares {
  id: string                    // 'op-0001', 'op-0002', ...
  numero: number                // secuencial (1, 2, 3...)
  fecha: string                 // YYYY-MM-DD — fecha de la operación
  inversor: string              // nombre del financiero (ej. "MANA")
  inversorNormalizado: string

  // Condiciones pactadas
  cotizacion: number            // tipo de cambio (ej. 1555)
  tasaMensual: number           // tasa mensual como decimal (ej. 0.065 = 6.5%)
  impuestoPorcentaje: number    // impuesto como decimal (ej. 0.025 = 2.5%)

  // Lo que se recibe
  montoUsd: number              // USD recibidos (ej. 70000)
  cashCentavos: number          // parte en efectivo pesos (si hay)

  // Cheques entregados
  detalles: OperacionDolaresDetalle[]
  totalChequesCentavos: number  // suma importes nominales
  totalLiquidarCentavos: number // suma importes a liquidar
  totalInteresCentavos: number  // totalCheques - totalLiquidar

  // Costo financiero
  costoFinancieroPorcentaje: number // (totalCheques - totalLiquidar) / totalLiquidar

  // Metadata
  notas: string
  estado: 'activa' | 'anulada'
  creadoPor: string
  creadoEn: string              // ISO timestamp
  actualizadoEn: string         // ISO timestamp
}

/** Input para crear/calcular una operación (lo que llega del form). */
export interface OperacionDolaresInput {
  fecha: string
  inversor: string
  cotizacion: number
  tasaMensual: number
  impuestoPorcentaje: number
  montoUsd: number
  cashCentavos: number
  notas: string
  cheques: Array<{
    numeroCheque?: string
    fechaCobro: string
    importeCentavos: number
  }>
}
