/**
 * Fuente única del horario de turnos helpdesk (disponibilidad API + grillas UI).
 * Último turno ofrecido: 15:00 (no se ofrecen 16:00 ni 17:00).
 */
export const HELPDESK_BUSINESS_HOUR_START = 9

/** Límite exclusivo en bucles `hour < end` → horas 9..15 inclusive. */
export const HELPDESK_BUSINESS_HOUR_END_EXCLUSIVE = 16

export const HELPDESK_BUSINESS_DAYS_COUNT = 5

export const HELPDESK_BUSINESS_HOURS: readonly number[] = Array.from(
  { length: HELPDESK_BUSINESS_HOUR_END_EXCLUSIVE - HELPDESK_BUSINESS_HOUR_START },
  (_, index) => HELPDESK_BUSINESS_HOUR_START + index,
)

export const HELPDESK_OFFICE_HOURS_SHORT_LABEL = '9 a 15 hs'
