/** IDs de widgets configurables en la home. */
export type HomeWidgetId = 'weather' | 'dollar' | 'systemsShift'

export type HomeWidgetPreferences = Record<HomeWidgetId, boolean>

export const DEFAULT_HOME_WIDGET_PREFERENCES: HomeWidgetPreferences = {
  weather: true,
  dollar: true,
  systemsShift: true,
}

export interface HomeWidgetDefinition {
  id: HomeWidgetId
  label: string
  description: string
}

/** Registro extensible: agregar entradas al sumar widgets nuevos en la home. */
export const HOME_WIDGETS: HomeWidgetDefinition[] = [
  {
    id: 'weather',
    label: 'Clima',
    description: 'Temperatura actual en Córdoba',
  },
  {
    id: 'dollar',
    label: 'Dólar',
    description: 'Cotizaciones en vivo (oficial, blue, MEP)',
  },
  {
    id: 'systemsShift',
    label: 'Turno de Sistemas',
    description: 'Quién cubre Sistemas esta semana (columna lateral)',
  },
]

export function resolveHomeWidgetPreferences(
  raw: Partial<HomeWidgetPreferences> | undefined | null,
): HomeWidgetPreferences {
  return {
    weather: raw?.weather !== false,
    dollar: raw?.dollar !== false,
    systemsShift: raw?.systemsShift !== false,
  }
}
