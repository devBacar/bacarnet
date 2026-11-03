/** Operación financiera: compra de USD con cheques o renovación de cheques en pesos. */

export type TipoOperacion = 'usd' | 'renovacion_pesos'

export interface OperacionDolaresDetalle {
  numeroCheque: string          // puede quedar vacío si aún no se asignó
  fechaCobro: string            // YYYY-MM-DD
  dias: number                  // días desde fecha operación hasta cobro
  importeCentavos: number       // valor nominal del cheque
  tasaEquivalenteCentavos: number // interés calculado (USD: tasaDiaria × días × importe; renovación: 0)
  descuentoCentavos: number     // impuesto al cheque (USD: imp% × importe; renovación: 0)
  importeLiquidarCentavos: number // importe - tasaEquivalente - descuento
}

export interface OperacionDolares {
  id: string                    // 'op-0001', 'op-0002', ...
  numero: number                // secuencial (1, 2, 3...)
  tipo: TipoOperacion           // 'usd' o 'renovacion_pesos'
  fecha: string                 // YYYY-MM-DD — fecha de la operación
  inversor: string              // nombre del financiero (ej. "MANA")
  inversorNormalizado: string
  chequeViejoIds?: string[]     // IDs de cheques renovados (solo renovacion_pesos)

  // Condiciones pactadas — USD
  cotizacion: number            // tipo de cambio (ej. 1555). 0 para renovación.
  tasaMensual: number           // tasa mensual como decimal (ej. 0.065 = 6.5%)
  impuestoPorcentaje: number    // impuesto como decimal (ej. 0.025 = 2.5%). 0 para renovación.

  // Lo que se recibe — USD
  montoUsd: number              // USD recibidos (ej. 70000). 0 para renovación.
  cashCentavos: number          // parte en efectivo pesos (si hay). 0 para renovación.

  // Renovación pesos
  capitalRenovadoCentavos: number  // suma de cheques viejos. 0 para USD.
  cantidadChequesViejos: number    // cuántos cheques se renuevan. 0 para USD.
  interesPorcentaje: number        // % plano sobre capital (ej. 0.10 = 10%). 0 para USD.

  // Cheques entregados (USD) o nuevos emitidos (renovación)
  detalles: OperacionDolaresDetalle[]
  totalChequesCentavos: number  // suma importes nominales
  totalLiquidarCentavos: number // USD: suma importes a liquidar. Renovación: capitalRenovadoCentavos.
  totalInteresCentavos: number  // USD: totalCheques - totalLiquidar. Renovación: capital × interés%.

  // Costo financiero
  costoFinancieroPorcentaje: number // USD: (totalCheques - totalLiquidar) / totalLiquidar. Renovación: interesPorcentaje.

  // Metadata
  notas: string
  estado: 'activa' | 'anulada'
  creadoPor: string
  creadoEn: string              // ISO timestamp
  actualizadoEn: string         // ISO timestamp
}

/** Input para crear/calcular una operación (lo que llega del form). */
export interface OperacionDolaresInput {
  tipo: TipoOperacion
  fecha: string
  inversor: string

  // USD
  cotizacion: number
  tasaMensual: number
  impuestoPorcentaje: number
  montoUsd: number
  cashCentavos: number

  // Renovación pesos
  capitalRenovadoCentavos: number
  cantidadChequesViejos: number
  interesPorcentaje: number

  notas: string
  cheques: Array<{
    numeroCheque?: string
    fechaCobro: string
    importeCentavos: number
  }>
  chequeViejoIds?: string[]     // IDs de cheques a renovar (solo renovacion_pesos)
}
