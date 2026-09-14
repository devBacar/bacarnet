/** Debe coincidir con HELPDESK_TICKET_ESTADOS del backend. */
export const HELPDESK_TICKET_ESTADOS = [
  'Proyecto recibido',
  'Reunión inicial agendada',
  'Realizando análisis',
  'En proceso de planificación y desarrollo',
  'En proceso de implementación',
  'Finalizado',
] as const

export const HELPDESK_FINAL_ESTADO_IDX = HELPDESK_TICKET_ESTADOS.length - 1
