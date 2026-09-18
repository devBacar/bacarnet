import type { Timestamp } from 'firebase-admin/firestore'

export const HELPDESK_TEAM_COLLECTION = 'helpdeskTeam'
export const HELPDESK_TICKETS_COLLECTION = 'helpdeskTickets'
export const HELPDESK_EMAIL_LOG_COLLECTION = 'helpdeskEmailLog'
export const HELPDESK_USED_TOKENS_COLLECTION = 'helpdeskUsedTokens'

export const HELPDESK_REUNIONES_SUBCOLLECTION = 'reuniones'
export const HELPDESK_NOTAS_SUBCOLLECTION = 'notas'
export const HELPDESK_ANALISIS_SUBCOLLECTION = 'analisis'
export const HELPDESK_BITACORA_SUBCOLLECTION = 'bitacora'

/** Carpeta Drive "Proyectos - análisis" (Sistemas). Override: HELPDESK_ANALISIS_DRIVE_FOLDER_ID */
export const HELPDESK_ANALISIS_DRIVE_FOLDER_ID_DEFAULT = '1SUza1HVVaLOR5GPyeDXlxDMpYue5NYvL'

export const HELPDESK_ANALISIS_DEFAULT_APROBADOR = 'pablo.magnin@bacarsa.com.ar'

export const HELPDESK_TICKET_ESTADOS = [
  'Proyecto recibido',
  'Reunión inicial agendada',
  'Realizando análisis',
  'En proceso de planificación y desarrollo',
  'En proceso de implementación',
  'Finalizado',
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

export interface HelpdeskColaboradorSistemas {
  teamMemberId: string
  nombre: string
  email: string
  addedByEmail: string
  addedAt?: Timestamp
}

export type HelpdeskColaboradorSolicitanteRol = 'lector' | 'editor'

export interface HelpdeskColaboradorSolicitante {
  email: string
  uid: string | null
  nombre: string
  rol: HelpdeskColaboradorSolicitanteRol
  addedAt?: Timestamp
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
  cancelado?: boolean
  canceladoMotivo?: string | null
  canceladoPor?: string | null
  canceladoFecha?: Timestamp | null
  createdAt?: Timestamp
  /** Último cambio de estadoIdx o asignadoATeamId (seguimiento). */
  seguimientoUpdatedAt?: Timestamp
  colaboradoresSistemas?: HelpdeskColaboradorSistemas[]
  colaboradoresSolicitante?: HelpdeskColaboradorSolicitante[]
  colaboradorUids?: string[]
  colaboradorEmails?: string[]
}

export type HelpdeskAnalisisEstado = 'pendiente' | 'aprobado' | 'rechazado'

export type HelpdeskBitacoraTipo = 'avance' | 'comentario'

export interface HelpdeskBitacoraEntrada {
  autorNombre: string
  autorEmail: string
  tipo: HelpdeskBitacoraTipo
  texto: string
  adjuntoDriveLink?: string | null
  createdAt?: Timestamp
}

export interface HelpdeskAnalisis {
  archivoDriveId: string
  archivoDriveLink: string
  subidoPorNombre: string
  subidoPorEmail: string
  subidoFecha: Timestamp
  aprobadoresEmails: string[]
  estado: HelpdeskAnalisisEstado
  decididoPorEmail?: string | null
  decididoFecha?: Timestamp | null
  comentarioDecision?: string | null
}

export type HelpdeskReunionEstado = 'pendiente' | 'confirmada' | 'rechazada'

export interface HelpdeskReunionMinuta {
  texto: string
  autorNombre: string
  updatedAt?: Timestamp
}

export type HelpdeskMinutaImpacto = 'Alto' | 'Medio' | 'Bajo'
export type HelpdeskMinutaFactibilidad = 'Alta' | 'Media' | 'Baja'
export type HelpdeskMinutaUrgenciaIniciativa = 'Crítico' | 'Deseable' | 'Posponible'
export type HelpdeskMinutaVeredicto = 'Viable' | 'Viable con condiciones' | 'No viable'

export interface HelpdeskMinutaProcesoEvaluado {
  procesoEvaluado: string
  descripcionBreve: string
  problemasIdentificados: string
  metricasActuales: string
}

export interface HelpdeskMinutaIniciativa {
  nombre: string
  beneficioEsperado: string
  recursosRequeridos: string
  impactoEstimado: HelpdeskMinutaImpacto
  factibilidad: HelpdeskMinutaFactibilidad
  costoEsfuerzo: HelpdeskMinutaImpacto
  urgencia: HelpdeskMinutaUrgenciaIniciativa
  veredicto: HelpdeskMinutaVeredicto
}

export interface HelpdeskMinutaDiagnostico {
  fecha: string
  facilitador: string
  participantes: string
  objetivoSesion: string
  alcance: string
  procesosEvaluados: HelpdeskMinutaProcesoEvaluado[]
  iniciativasPropuestas: HelpdeskMinutaIniciativa[]
  proyectosAprobados: string
  responsables: string
  accionesInmediatas: string
  fechaSeguimiento?: string
  /** Borrador automático al crear ticket; pasa a false al guardar edición de Sistemas. */
  generadoPorIA?: boolean
  autorNombre?: string
  updatedAt?: Timestamp
}

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
  minuta?: HelpdeskReunionMinuta | null
  minutaDiagnostico?: HelpdeskMinutaDiagnostico | null
  createdAt?: Timestamp
  /** Última vez que cambió el estado de la reunión (confirmada/rechazada). */
  estadoUpdatedAt?: Timestamp
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
  | 'analisis_pendiente_aprobacion'
  | 'analisis_aprobado'
  | 'analisis_rechazado'
  | 'aviso_interno_ticket'
  | 'aviso_interno_reunion'
  | 'colaborador_sistemas_agregado'
  | 'colaborador_solicitante_agregado'

export type HelpdeskEmailLogSource = 'bacarnet' | 'n8n_callback'

export interface HelpdeskEmailLog {
  fecha: Timestamp
  tipo: HelpdeskEmailLogTipo
  destinatarios: string[]
  area?: string | null
  areaId?: string | null
  ticketId?: string | null
  respondido: boolean | null
  fechaRespuesta: Timestamp | null
  /** bacarnet = registro al disparar aviso; n8n_callback = webhook externo (legacy/complementario). */
  source?: HelpdeskEmailLogSource | null
}

const HELPDESK_EMAIL_LOG_TIPOS: HelpdeskEmailLogTipo[] = [
  'difusion_inicial',
  'invitacion_reunion',
  'actualizacion_estado',
  'recordatorio',
  'analisis_pendiente_aprobacion',
  'analisis_aprobado',
  'analisis_rechazado',
  'aviso_interno_ticket',
  'aviso_interno_reunion',
  'colaborador_sistemas_agregado',
  'colaborador_solicitante_agregado',
]

export function isValidHelpdeskEmailLogTipo(value: unknown): value is HelpdeskEmailLogTipo {
  return (
    typeof value === 'string' &&
    (HELPDESK_EMAIL_LOG_TIPOS as string[]).includes(value)
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
