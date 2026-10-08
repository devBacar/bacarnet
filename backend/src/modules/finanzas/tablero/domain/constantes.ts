/** Pases entre cuentas propias: no son plata que entró ni que salió. */
export const GRUPO_MOVIMIENTOS_INTERNOS = 'Movimientos internos'

/** Plata que se pone en un fondo y se rescata: no es gasto ni ingreso. */
export const GRUPO_INVERSIONES = 'Inversiones'

export const GRUPO_GASTOS_BANCARIOS = 'Gastos bancarios'

/** Movimientos que Finanzas todavía tiene que confirmar. Van al final, en gris. */
export const GRUPO_A_REVISAR = 'A revisar'

/**
 * El impuesto al cheque se suma al costo bancario, aunque su grupo sea Impuestos.
 * El IVA no entra: en esa categoría se mezclan percepciones que no son un gasto del banco.
 */
export const CATEGORIA_IMPUESTO_AL_CHEQUE = 'Impuesto al cheque'

export const SIN_CATEGORIA = 'Sin categoría'

export const SIN_BANCO = 'Sin banco'

/** Meses del gráfico de entradas y salidas. */
export const MESES_EN_GRAFICO = 12

/** Desde hoy, inclusive, hasta este número de días. */
export const DIAS_PROXIMOS = 30

/** El saldo de hoy se compara contra el saldo de hace esta cantidad de días. */
export const DIAS_VARIACION_SALDO = 30

export const CACHE_TABLERO_MS = 30 * 60 * 1000

export const COLECCION_TABLERO = 'finanzasTablero'
