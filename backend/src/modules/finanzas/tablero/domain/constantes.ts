/** Pases entre cuentas propias: no son plata que entró ni que salió. */
export const GRUPO_MOVIMIENTOS_INTERNOS = 'Movimientos internos'

export const GRUPO_GASTOS_BANCARIOS = 'Gastos bancarios'

/**
 * El impuesto al cheque se suma al costo bancario, aunque su grupo sea Impuestos.
 * El IVA no entra: en esa categoría se mezclan percepciones que no son un gasto del banco.
 */
export const CATEGORIA_IMPUESTO_AL_CHEQUE = 'Impuesto al cheque'

export const SIN_CATEGORIA = 'Sin categoría'

/** Los sueldos no van al ranking de a quién pagamos: son pagos a personas (y el nombre trae empleados). */
export const CATEGORIA_SUELDOS = 'Sueldos'
export const SIN_IDENTIFICAR = 'Sin identificar'
export const SIN_BANCO = 'Sin banco'

/** Meses del gráfico de entradas y salidas. */
export const MESES_EN_GRAFICO = 12

export const TOP_CONTRAPARTES = 5

/** Las 3 primeras concentran más de este porcentaje de los cobros. */
export const UMBRAL_CONCENTRACION_COBROS = 35

/** El costo bancario subió más de este porcentaje contra el mes anterior. */
export const UMBRAL_SUBA_COSTO_BANCARIO = 15

/** Desde hoy, inclusive, hasta este número de días. */
export const DIAS_PROXIMOS = 30

/** El saldo de hoy se compara contra el saldo de hace esta cantidad de días. */
export const DIAS_VARIACION_SALDO = 30

export const CACHE_TABLERO_MS = 30 * 60 * 1000

export const COLECCION_TABLERO = 'finanzasTablero'
