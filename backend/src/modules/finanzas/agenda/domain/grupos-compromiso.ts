/** Lista editable de grupos de la planilla mensual. El orden es el de la hoja. */
export const GRUPOS_COMPROMISO = [
  'Inversores USD',
  'Inversores pesos',
  'Préstamos bancarios',
  'Bancos',
  'Inversiones bursátiles',
  'Impositivo',
  'Gastos de personal',
  'Otros egresos',
] as const

export type GrupoCompromiso = (typeof GRUPOS_COMPROMISO)[number]

export const GRUPO_COMPROMISO_DEFAULT: GrupoCompromiso = 'Otros egresos'

export function esGrupoCompromiso(value: string): value is GrupoCompromiso {
  return (GRUPOS_COMPROMISO as readonly string[]).includes(value)
}
