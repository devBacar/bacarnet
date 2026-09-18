import { auth } from './firebase'
import type { HelpdeskMinutaDiagnostico } from '../types/helpdeskMinutaDiagnostico'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export type HelpdeskUrgencia = 'baja' | 'media' | 'alta'

export interface HelpdeskSlotDisponibilidad {
  fecha: string
  hora: string
  libre: boolean
}

export interface HelpdeskDisponibilidadInicialResponse {
  slots: HelpdeskSlotDisponibilidad[]
}

export interface HelpdeskCrearSolicitudPayload {
  token: string
  problematica: string
  urgencia: HelpdeskUrgencia
  fecha: string
  hora: string
}

export interface HelpdeskCrearSolicitudSuccess {
  ticketId: string
  areaNombre: string
  requesterNombre: string
}

export type HelpdeskReunionEstado = 'pendiente' | 'confirmada' | 'rechazada'

export interface HelpdeskReunionResumen {
  id: string
  tipo: string
  fecha: string
  hora: string
  estado: HelpdeskReunionEstado
  minuta: {
    texto: string
    autorNombre: string
    updatedAt: string | null
  } | null
  minutaDiagnostico: HelpdeskMinutaDiagnostico | null
  createdAt: string | null
}

export const HELPDESK_ANALISIS_DEFAULT_APROBADOR = 'pablo.magnin@bacarsa.com.ar'

export type HelpdeskMisProyectoRolAcceso = 'propio' | 'lector' | 'editor'

export interface HelpdeskColaboradorSolicitanteDto {
  email: string
  uid: string | null
  nombre: string
  rol: 'lector' | 'editor'
  addedAt: string | null
}

export interface HelpdeskColaboradorSistemasDto {
  teamMemberId: string
  nombre: string
  email: string
  addedByEmail: string
  addedAt: string | null
}

export interface HelpdeskMisSolicitudTicket {
  id: string
  areaNombre: string
  problematica: string
  urgencia: HelpdeskUrgencia
  estadoIdx: number
  estado: string | null
  createdAt: string | null
  asignadoATeamId: string | null
  asignadoNombre: string | null
  cancelado?: boolean
  canceladoMotivo?: string | null
  canceladoPor?: string | null
  reuniones: HelpdeskReunionResumen[]
  miRolAcceso?: HelpdeskMisProyectoRolAcceso
  colaboradoresSolicitante?: HelpdeskColaboradorSolicitanteDto[]
}

export interface HelpdeskMisSolicitudesResponse {
  tickets: HelpdeskMisSolicitudTicket[]
}

export class HelpdeskApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'HelpdeskApiError'
    this.status = status
    this.code = code
  }
}

const GENERIC_ERROR_MESSAGE = 'No se pudo completar la operación. Intentá de nuevo más tarde.'

async function parseJsonBody(res: Response): Promise<Record<string, unknown>> {
  try {
    const data = await res.json()
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data as Record<string, unknown>
    }
  } catch {
    /* respuesta vacía o no JSON */
  }
  return {}
}

function messageFromBody(body: Record<string, unknown>, fallback: string): string {
  if (typeof body.mensaje === 'string' && body.mensaje.trim()) {
    return body.mensaje.trim()
  }
  if (typeof body.error === 'string' && body.error.trim() && body.error !== 'slot_ocupado') {
    return body.error.trim()
  }
  return fallback
}

async function handleHelpdeskResponse<T>(res: Response): Promise<T> {
  const body = await parseJsonBody(res)

  if (res.status === 401) {
    throw new HelpdeskApiError(messageFromBody(body, GENERIC_ERROR_MESSAGE), 401)
  }

  if (res.status === 409 && body.error === 'slot_ocupado') {
    throw new HelpdeskApiError(
      messageFromBody(
        body,
        'Ese horario se ocupó mientras completabas el formulario, elegí otro.',
      ),
      409,
      'slot_ocupado',
    )
  }

  if (!res.ok) {
    throw new HelpdeskApiError(messageFromBody(body, GENERIC_ERROR_MESSAGE), res.status)
  }

  return body as T
}

function helpdeskUrl(path: string, searchParams?: Record<string, string>): string {
  const url = new URL(`${API_BASE}${path}`, window.location.origin)
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value)
    }
  }
  return url.toString()
}

export async function fetchDisponibilidadInicial(
  token: string,
  semanaOffset = 0,
): Promise<HelpdeskDisponibilidadInicialResponse> {
  const res = await fetch(
    helpdeskUrl('/api/helpdesk/disponibilidad-inicial', {
      token,
      semanaOffset: String(semanaOffset),
    }),
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
    },
  )
  return handleHelpdeskResponse<HelpdeskDisponibilidadInicialResponse>(res)
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) {
    throw new HelpdeskApiError('No autenticado', 401)
  }
  return { Authorization: `Bearer ${token}` }
}

export interface HelpdeskTeamMemberDto {
  id: string
  nombre: string
  email: string
  rol: string
  primeraReunion: boolean
  responsablePrincipal: boolean
}

export type HelpdeskEmailLogSourceDto = 'bacarnet' | 'n8n_callback' | null

export interface HelpdeskEmailLogEntry {
  id: string
  fecha: string | null
  tipo: string
  destinatarios: string[]
  source?: HelpdeskEmailLogSourceDto
}

export interface HelpdeskPanelTicket {
  id: string
  areaNombre: string
  urgencia: HelpdeskUrgencia
  estadoIdx: number
  estado: string | null
  createdAt: string | null
  asignadoATeamId: string | null
  asignadoNombre?: string | null
  requesterNombre: string
  requesterEmail: string
  problematica: string
  reuniones: HelpdeskReunionResumen[]
  emailLog: HelpdeskEmailLogEntry[]
  cancelado?: boolean
  canceladoMotivo?: string | null
  canceladoPor?: string | null
  canceladoFecha?: string | null
  colaboradoresSistemas?: HelpdeskColaboradorSistemasDto[]
}

export interface HelpdeskAnalisisDto {
  id: string
  archivoDriveId: string
  archivoDriveLink: string
  subidoPorNombre: string
  subidoPorEmail: string
  subidoFecha: string
  aprobadoresEmails: string[]
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  decididoPorEmail: string | null
  decididoFecha: string | null
  comentarioDecision: string | null
}

export interface HelpdeskNotaDto {
  id: string
  autorNombre: string
  texto: string
  createdAt: string | null
}

export interface HelpdeskTicketDetail extends HelpdeskPanelTicket {
  notas: HelpdeskNotaDto[]
  analisis: HelpdeskAnalisisDto[]
}

export type HelpdeskVistoSeccion =
  | 'seguimiento'
  | 'analisis'
  | 'reuniones'
  | 'bitacora'
  | 'correos'

export type HelpdeskTicketNovedades = Record<HelpdeskVistoSeccion, boolean>

export interface HelpdeskAnalisisPendienteItem {
  ticketId: string
  analisisId: string
  analisis: HelpdeskAnalisisDto
  ticket: {
    id: string
    areaNombre: string
    problematica: string
    requesterNombre: string
    estadoIdx: number
  }
}

async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(helpdeskUrl(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(await authHeaders()),
      ...init?.headers,
    },
  })
  return handleHelpdeskResponse<T>(res)
}

export async function fetchHelpdeskTeam(): Promise<{ members: HelpdeskTeamMemberDto[] }> {
  return authFetch('/api/helpdesk/team')
}

export async function fetchHelpdeskTickets(input?: {
  estadoIdx?: number
  urgencia?: HelpdeskUrgencia
}): Promise<{ tickets: HelpdeskPanelTicket[] }> {
  const params: Record<string, string> = {}
  if (input?.estadoIdx !== undefined) params.estadoIdx = String(input.estadoIdx)
  if (input?.urgencia) params.urgencia = input.urgencia
  const res = await fetch(helpdeskUrl('/api/helpdesk/tickets', params), {
    method: 'GET',
    headers: { Accept: 'application/json', ...(await authHeaders()) },
  })
  return handleHelpdeskResponse<{ tickets: HelpdeskPanelTicket[] }>(res)
}

export async function fetchHelpdeskTicketDetail(
  ticketId: string,
): Promise<{ ticket: HelpdeskTicketDetail; novedades: HelpdeskTicketNovedades | null }> {
  return authFetch(`/api/helpdesk/tickets/${encodeURIComponent(ticketId)}`)
}

export async function patchHelpdeskTicketVistoPor(
  ticketId: string,
  seccion: HelpdeskVistoSeccion,
): Promise<{ ok: boolean }> {
  return authFetch(`/api/helpdesk/tickets/${encodeURIComponent(ticketId)}/visto-por`, {
    method: 'PATCH',
    body: JSON.stringify({ seccion }),
  })
}

export async function fetchDisponibilidadTeamMember(
  teamMemberId: string,
  semanaOffset = 0,
): Promise<HelpdeskDisponibilidadInicialResponse> {
  const res = await fetch(
    helpdeskUrl(`/api/helpdesk/disponibilidad/${encodeURIComponent(teamMemberId)}`, {
      semanaOffset: String(semanaOffset),
    }),
    {
      method: 'GET',
      headers: { Accept: 'application/json', ...(await authHeaders()) },
    },
  )
  return handleHelpdeskResponse<HelpdeskDisponibilidadInicialResponse>(res)
}

export async function patchHelpdeskTicketEstado(
  ticketId: string,
  estadoIdx: number,
): Promise<{ ticketId: string; estadoIdx: number }> {
  return authFetch(`/api/helpdesk/tickets/${encodeURIComponent(ticketId)}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ estadoIdx }),
  })
}

export async function patchHelpdeskTicketAsignado(
  ticketId: string,
  teamMemberId: string,
): Promise<{ ticketId: string; asignadoATeamId: string }> {
  return authFetch(`/api/helpdesk/tickets/${encodeURIComponent(ticketId)}/asignado`, {
    method: 'PATCH',
    body: JSON.stringify({ teamMemberId }),
  })
}

export async function postHelpdeskColaboradorSistemas(
  ticketId: string,
  teamMemberId: string,
): Promise<{ ticketId: string; teamMemberId: string }> {
  return authFetch(
    `/api/helpdesk/tickets/${encodeURIComponent(ticketId)}/colaboradores-sistemas`,
    {
      method: 'POST',
      body: JSON.stringify({ teamMemberId }),
    },
  )
}

export async function deleteHelpdeskColaboradorSistemas(
  ticketId: string,
  teamMemberId: string,
): Promise<{ ticketId: string; teamMemberId: string; removed: boolean }> {
  return authFetch(
    `/api/helpdesk/tickets/${encodeURIComponent(ticketId)}/colaboradores-sistemas/${encodeURIComponent(teamMemberId)}`,
    { method: 'DELETE' },
  )
}

export async function postHelpdeskColaboradorSolicitante(
  ticketId: string,
  payload: { email: string; rol: 'lector' | 'editor' },
): Promise<{ ticketId: string; email: string; rol: string }> {
  return authFetch(`/api/helpdesk/tickets/${encodeURIComponent(ticketId)}/colaboradores`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function deleteHelpdeskColaboradorSolicitante(
  ticketId: string,
  email: string,
): Promise<{ ticketId: string; email: string; removed: boolean }> {
  return authFetch(
    `/api/helpdesk/tickets/${encodeURIComponent(ticketId)}/colaboradores/${encodeURIComponent(email)}`,
    { method: 'DELETE' },
  )
}

export async function postHelpdeskTicketNota(
  ticketId: string,
  texto: string,
): Promise<{ notaId: string; ticketId: string }> {
  return authFetch(`/api/helpdesk/tickets/${encodeURIComponent(ticketId)}/notas`, {
    method: 'POST',
    body: JSON.stringify({ texto }),
  })
}

export async function postHelpdeskTicketReunion(
  ticketId: string,
  payload: { tipo: string; teamMemberId: string; fecha: string; hora: string },
): Promise<{ reunionId: string; ticketId: string }> {
  return authFetch(`/api/helpdesk/tickets/${encodeURIComponent(ticketId)}/reuniones`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function deleteHelpdeskTicket(
  ticketId: string,
): Promise<{ ticketId: string; deleted: boolean }> {
  return authFetch(`/api/helpdesk/tickets/${encodeURIComponent(ticketId)}`, {
    method: 'DELETE',
  })
}

export async function patchHelpdeskReunionMinuta(
  ticketId: string,
  reunionId: string,
  payload: { texto: string } | { minutaDiagnostico: HelpdeskMinutaDiagnostico },
): Promise<{ ticketId: string; reunionId: string }> {
  return authFetch(
    `/api/helpdesk/tickets/${encodeURIComponent(ticketId)}/reuniones/${encodeURIComponent(reunionId)}/minuta`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  )
}

export async function fetchMisSolicitudes(): Promise<HelpdeskMisSolicitudesResponse> {
  const res = await fetch(helpdeskUrl('/api/helpdesk/tickets/mias'), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(await authHeaders()),
    },
  })
  return handleHelpdeskResponse<HelpdeskMisSolicitudesResponse>(res)
}

export interface HelpdeskCampanaAuditoriaRow {
  nombre: string | null
  area: string | null
  email: string | null
  enviado: boolean | null
  fecha_envio: string | null
  respondido: boolean | null
  fecha_respuesta: string | null
  link: string | null
  respondio_correo: boolean | null
  respondio_formulario: boolean | null
  fecha_formulario: string | null
  ticket_id: string | null
  campana_cumplida: boolean | null
  respondido_tabla_n8n: boolean | null
}

export async function fetchCampanaAuditoria(): Promise<{ rows: HelpdeskCampanaAuditoriaRow[] }> {
  return authFetch('/api/helpdesk/campana/auditoria')
}

export interface HelpdeskCampanaArchivoFila {
  area: string | null
  jefe: string | null
  email: string | null
  enviado: boolean | null
  fechaEnvio: string | null
  respondido: boolean | null
  fechaRespuesta: string | null
}

export interface HelpdeskCampanaArchivoResumen {
  totalAreas: number
  respondieron: number
  sinResponder: number
}

export interface HelpdeskCampanaArchivoListItem {
  id: string
  archivadoEn: string
  archivadoPorEmail: string
  anio: number
  mes: number
  semanaIso: number
  resumen: HelpdeskCampanaArchivoResumen
}

export interface HelpdeskCampanaArchivoDetail extends HelpdeskCampanaArchivoListItem {
  filas: HelpdeskCampanaArchivoFila[]
  proyectosSnapshot: unknown | null
}

export async function fetchCampanaArchivos(): Promise<{ archivos: HelpdeskCampanaArchivoListItem[] }> {
  return authFetch('/api/helpdesk/campana/archivos')
}

export async function fetchCampanaArchivoById(archivoId: string): Promise<HelpdeskCampanaArchivoDetail> {
  return authFetch(`/api/helpdesk/campana/archivos/${encodeURIComponent(archivoId)}`)
}

export async function postCampanaArchivar(): Promise<{
  id: string
  anio: number
  mes: number
  semanaIso: number
  resumen: HelpdeskCampanaArchivoResumen
}> {
  return authFetch('/api/helpdesk/campana/archivar', { method: 'POST', body: '{}' })
}

export async function downloadCampanaAuditoriaPdf(archivoId?: string): Promise<Blob> {
  const query = archivoId ? `?archivoId=${encodeURIComponent(archivoId)}` : ''
  const res = await fetch(helpdeskUrl(`/api/helpdesk/campana/auditoria/pdf${query}`), {
    headers: {
      Accept: 'application/pdf',
      ...(await authHeaders()),
    },
  })
  if (!res.ok) {
    let message = 'No se pudo generar el PDF'
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      /* ignore */
    }
    throw new HelpdeskApiError(message, res.status)
  }
  return res.blob()
}

export async function patchHelpdeskTicketCancelacion(
  ticketId: string,
  payload: { cancelado: boolean; motivo?: string },
): Promise<{ ticketId: string; cancelado: boolean }> {
  return authFetch(`/api/helpdesk/tickets/${encodeURIComponent(ticketId)}/cancelacion`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function postHelpdeskTicketAnalisis(
  ticketId: string,
  file: File,
  aprobadoresEmails: string,
): Promise<{ analisisId: string }> {
  const token = await authHeaders()
  const form = new FormData()
  form.append('file', file)
  form.append('aprobadoresEmails', aprobadoresEmails)
  const res = await fetch(helpdeskUrl(`/api/helpdesk/tickets/${encodeURIComponent(ticketId)}/analisis`), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...token,
    },
    body: form,
  })
  const body = await handleHelpdeskResponse<{ analisisId: string }>(res)
  return body
}

export async function fetchAnalisisPendientes(): Promise<{ items: HelpdeskAnalisisPendienteItem[] }> {
  return authFetch('/api/helpdesk/analisis-pendientes')
}

export interface HelpdeskBitacoraEntradaDto {
  id: string
  autorNombre: string
  autorEmail: string
  tipo: 'avance' | 'comentario'
  texto: string
  adjuntoDriveLink: string | null
  createdAt: string | null
}

export async function fetchHelpdeskTicketBitacora(
  ticketId: string,
): Promise<{ entradas: HelpdeskBitacoraEntradaDto[] }> {
  return authFetch(`/api/helpdesk/tickets/${encodeURIComponent(ticketId)}/bitacora`)
}

export async function postHelpdeskTicketBitacora(
  ticketId: string,
  input: { texto: string; file?: File },
): Promise<{ entradaId: string; ticketId: string; tipo: string }> {
  const token = await authHeaders()
  const form = new FormData()
  form.append('texto', input.texto)
  if (input.file) form.append('file', input.file)
  const res = await fetch(
    helpdeskUrl(`/api/helpdesk/tickets/${encodeURIComponent(ticketId)}/bitacora`),
    {
      method: 'POST',
      headers: { Accept: 'application/json', ...token },
      body: form,
    },
  )
  return handleHelpdeskResponse(res)
}

export async function patchAnalisisDecision(
  ticketId: string,
  analisisId: string,
  payload: { decision: 'aprobado' | 'rechazado'; comentario?: string },
): Promise<{ ticketId: string; analisisId: string; decision: string }> {
  return authFetch(
    `/api/helpdesk/tickets/${encodeURIComponent(ticketId)}/analisis/${encodeURIComponent(analisisId)}/decision`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  )
}

export async function crearSolicitud(
  payload: HelpdeskCrearSolicitudPayload,
): Promise<HelpdeskCrearSolicitudSuccess> {
  const res = await fetch(helpdeskUrl('/api/helpdesk/solicitudes'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  return handleHelpdeskResponse<HelpdeskCrearSolicitudSuccess>(res)
}

export { GENERIC_ERROR_MESSAGE as HELPDESK_GENERIC_ERROR_MESSAGE }
