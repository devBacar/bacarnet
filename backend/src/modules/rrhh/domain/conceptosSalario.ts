/**
 * Conceptos de liquidación de Salario que usa el módulo RRHH.
 * Relevados del backup del 05/10/2026 (base `salario`, MySQL 5.7).
 * En horas extra: CANT = horas y MONTO = pesos. En los conceptos "INT-Días…": MONTO = días.
 */

export type GrupoHoras = 'he50' | 'he100' | 'fer' | 'noct' | 'comp'

export const CONCEPTOS_HORAS: Record<GrupoHoras, readonly string[]> = {
  /** Horas extra al 50% y su ajuste. */
  he50: ['HEX050', 'AHE050'],
  /** Horas extra al 100% y su ajuste. */
  he100: ['HEX100', 'AHE100'],
  /** Horas trabajadas en feriado, su ajuste y el día del gremio. */
  fer: ['HSVIG1', 'HSVIG0', 'HSVIG3'],
  /** Horas nocturnas (recargo) y su ajuste. */
  noct: ['HSNOCT', 'AHNOCT'],
  /** Horas compensatorias. */
  comp: ['HSCOMP'],
}

/** Tipo de ausencia → concepto de días que liquida Salario. */
export const CONCEPTOS_AUSENCIA: Record<string, string> = {
  Vacaciones: 'DSVAME',
  Enfermedad: 'DSENFE',
  'Enfermedad familiar': 'DSENFF',
  'Accidente ART': 'DSACCA',
  'Accidente empresa': 'DSACCI',
  Maternidad: 'DSMATE',
  'Fallecimiento familiar': 'DSFAFA',
  Matrimonio: 'DSMATR',
  'Nacimiento hijo': 'DSHIJO',
  'Examen/estudio': 'DSESTU',
  'Licencia gremial': 'DSLIGR',
  Mudanza: 'DSMUDA',
  'Donación sangre': 'DSSANG',
  Permiso: 'DSPERM',
  'Ausencia con aviso': 'DSAUAV',
  'Sin goce de haberes': 'LICSIN',
  'Falta injustificada': 'DSINJU',
  Suspensión: 'DSSUSP',
  'No trabajados': 'DSNOTR',
}

export type TotalLiquidacion = 'rem' | 'contrib' | 'costo'

/** Totales de la liquidación: remunerativo, contribuciones patronales y costo laboral (desde jun-26). */
export const CONCEPTOS_TOTALES: Record<string, TotalLiquidacion> = {
  '(TREM)': 'rem',
  '(TCTR)': 'contrib',
  COSTOS: 'costo',
}

/** Art. 169 LCT: la cantidad liquidada es la cantidad de feriados del mes. */
export const CONCEPTO_FERIADOS_MES = 'FERIAD'

/** Liquidación mensual. Es la única que trae horas extra (la 9 es informativa y la 4 es aguinaldo). */
export const TIPO_LIQUIDACION_MENSUAL = '3'

/** Horas por mes a partir de las cuales el dato se considera mal cargado. */
export const TOPE_HORAS_VALIDAS_MES = 400

const GRUPO_POR_CONCEPTO = new Map<string, GrupoHoras>()
for (const [grupo, conceptos] of Object.entries(CONCEPTOS_HORAS) as [GrupoHoras, readonly string[]][]) {
  for (const c of conceptos) GRUPO_POR_CONCEPTO.set(c, grupo)
}
const AUSENCIA_POR_CONCEPTO = new Map<string, string>(
  Object.entries(CONCEPTOS_AUSENCIA).map(([tipo, concepto]) => [concepto, tipo]),
)

export function grupoHorasDe(concepto: string): GrupoHoras | undefined {
  return GRUPO_POR_CONCEPTO.get(concepto)
}

export function tipoAusenciaDe(concepto: string): string | undefined {
  return AUSENCIA_POR_CONCEPTO.get(concepto)
}

export function totalDe(concepto: string): TotalLiquidacion | undefined {
  return CONCEPTOS_TOTALES[concepto]
}

/** Conceptos que el cálculo necesita leer (para filtrar filas al leer el dump). */
export const CONCEPTOS_RELEVANTES = new Set<string>([
  ...GRUPO_POR_CONCEPTO.keys(),
  ...AUSENCIA_POR_CONCEPTO.keys(),
  ...Object.keys(CONCEPTOS_TOTALES),
  CONCEPTO_FERIADOS_MES,
])

/**
 * Horas mal cargadas: más de 400 en el mes, o un ajuste (AH…) donde la cantidad es igual al importe
 * (en Salario a veces se carga el importe en el campo de horas). Se descartan las horas y se conserva el importe.
 */
export function horasInvalidas(concepto: string, horas: number, monto: number): boolean {
  if (horas > TOPE_HORAS_VALIDAS_MES) return true
  return concepto.startsWith('AH') && horas > 0 && horas === monto
}

/** Códigos de la tabla `tablas` (columna COTAB) que usa RRHH. */
export const TABLAS_CODIGOS = {
  centroCosto: 2,
  seccion: 5,
  esquemaLiquidacion: 17,
  puesto: 22,
  tipoAusencia: 30,
} as const
