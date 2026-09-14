import type { Timestamp } from 'firebase-admin/firestore'

export const HELPDESK_TEAM_COLLECTION = 'helpdeskTeam'
export const HELPDESK_TICKETS_COLLECTION = 'helpdeskTickets'
export const HELPDESK_EMAIL_LOG_COLLECTION = 'helpdeskEmailLog'
export const HELPDESK_USED_TOKENS_COLLECTION = 'helpdeskUsedTokens'

export const HELPDESK_REUNIONES_SUBCOLLECTION = 'reuniones'
export const HELPDESK_NOTAS_SUBCOLLECTION = 'notas'

export const HELPDESK_TICKET_ESTADOS = [
  'Solicitud recibida',
  'Reunión inicial agendada',
  'En proceso de planificación',
  'En proceso de desarrollo',
  'En proceso de implementación',
  'Finalizada',
] as const

export type HelpdeskTicketEstadoLabel = (typeof HELPDESK_TICKET_ESTADOS)[number]

export function isValidHelpdeskEstadoIdx(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < HELPDESK_TICKET_ESTADOS.length
  )
}

export function helpdeskEstadoLabelFromIdx(estadoIdx: number): HelpdeskTicketEstadoLabel | null {
  if (!isValidHelpdeskEstadoIdx(estadoIdx)) return null
  return HELPDESK_TICKET_ESTADOS[estadoIdx]
}

export type HelpdeskUrgencia = 'baja' | 'media' | 'alta'

export const HELPDESK_URGENCIAS: readonly HelpdeskUrgencia[] = ['baja', 'media', 'alta']

export interface HelpdeskTeamMember {
  uid?: string | null
  nombre: string
  email: string
  rol: string
  activo: boolean
  primeraReunion: boolean
  responsablePrincipal: boolean
}

export interface HelpdeskTeamMemberRecord extends HelpdeskTeamMember {
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface HelpdeskTicket {
  token: string
  requesterUid: string | null
  requesterEmail: string
  requesterNombre: string
  areaId: string
  areaNombre: string
  problematica: string
  urgencia: HelpdeskUrgencia
  estadoIdx: number
  asignadoATeamId: string | null
  createdAt?: Timestamp
}

export type HelpdeskReunionEstado = 'pendiente' | 'confirmada' | 'rechazada'

export interface HelpdeskReunion {
  tipo: string
  fecha: string
  hora: string
  conTeamId: string
  participantesTeamIds: string[]
  estado: HelpdeskReunionEstado
  calendarEventId?: string | null
  calendarHtmlLink?: string | null
  calendarOrganizerEmail?: string | null
  calendarError?: boolean
  calendarErrorMessage?: string | null
  createdAt?: Timestamp
}

export interface HelpdeskNota {
  autorNombre: string
  texto: string
  createdAt?: Timestamp
}

export type HelpdeskEmailLogTipo =
  | 'difusion_inicial'
  | 'invitacion_reunion'
  | 'actualizacion_estado'
  | 'recordatorio'

export interface HelpdeskEmailLog {
  fecha: Timestamp
  tipo: HelpdeskEmailLogTipo
  destinatarios: string[]
  area?: string | null
  areaId?: string | null
  ticketId?: string | null
  respondido: boolean | null
  fechaRespuesta: Timestamp | null
}

export function isValidHelpdeskEmailLogTipo(value: unknown): value is HelpdeskEmailLogTipo {
  return (
    value === 'difusion_inicial' ||
    value === 'invitacion_reunion' ||
    value === 'actualizacion_estado' ||
    value === 'recordatorio'
  )
}

export interface HelpdeskUsedTokenRecord {
  usedAt: Timestamp
  requesterEmail?: string
}

export interface HelpdeskAccessTokenClaims {
  uid: string | null
  email: string
  nombre: string
  areaId: string
  areaNombre: string
  jti: string
}
