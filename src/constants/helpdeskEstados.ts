/** Debe coincidir con HELPDESK_TICKET_ESTADOS del backend. */
export const HELPDESK_TICKET_ESTADOS = [
  'Solicitud recibida',
  'Reunión inicial agendada',
  'En proceso de planificación',
  'En proceso de desarrollo',
  'En proceso de implementación',
  'Finalizada',
] as const

export const HELPDESK_FINAL_ESTADO_IDX = HELPDESK_TICKET_ESTADOS.length - 1
