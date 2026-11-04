/**
 * Tipos del tablero de Combustible: gasto real en combustible (Vientri), desde 2025.
 *
 * Importante: Vientri no tiene el dato de a qué móvil corresponde cada compra desde fines de 2024
 * (se dejó de cargar el vale de combustible). Este tablero muestra gasto total por mes, proveedor y
 * unidad de negocio — NUNCA por móvil, porque ese dato no existe para este período.
 */

export interface ProveedorGastoTablero {
  idProveedor: number | null
  nombre: string
  centavos: number
  cantidadComprobantes: number
  porcentaje: number | null
}

export interface UnegocioGastoTablero {
  idUnegocio: number | null
  nombre: string
  centavos: number
  porcentaje: number | null
}

export interface MesGastoTablero {
  mes: string
  centavos: number
}

export interface ComparativoAnual {
  anio: number
  centavos: number
  /** Meses del año con datos (para no comparar un año completo contra uno a medias). */
  meses: number
}

export interface TableroCombustible {
  mes: string
  generadoEn: string
  totalCentavos: number
  totalMesAnteriorCentavos: number
  variacionPorcentaje: number | null
  totalMismoMesAnioAnteriorCentavos: number
  mesAnioAnterior: string
  variacionInteranualPorcentaje: number | null
  cantidadComprobantes: number
  ticketPromedioCentavos: number
  /** Últimos 12 meses (incluido el actual), para el gráfico de evolución. */
  tendencia: MesGastoTablero[]
  /** Un total por año calendario, desde el primero con datos (2025), para comparar año a año. */
  comparativoAnual: ComparativoAnual[]
  porProveedor: ProveedorGastoTablero[]
  porUnegocio: UnegocioGastoTablero[]
  /** true si 2025-01 es el primer mes con datos (siempre, hoy): para aclarar en la UI que no hay nada antes. */
  primerMesConDatos: string
}
