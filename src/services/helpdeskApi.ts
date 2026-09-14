import { auth } from './firebase'

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
  createdAt: string | null
}

export interface HelpdeskMisSolicitudTicket {
  id: string
  areaNombre: string
  urgencia: HelpdeskUrgencia
  estadoIdx: number
  estado: string | null
  createdAt: string | null
  asignadoATeamId: string | null
  asignadoNombre: string | null
  reuniones: HelpdeskReunionResumen[]
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

export interface HelpdeskEmailLogEntry {
  id: string
  fecha: string | null
  tipo: string
  destinatarios: string[]
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
}

export interface HelpdeskNotaDto {
  id: string
  autorNombre: string
  texto: string
  createdAt: string | null
}

export interface HelpdeskTicketDetail extends HelpdeskPanelTicket {
  notas: HelpdeskNotaDto[]
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
): Promise<{ ticket: HelpdeskTicketDetail }> {
  return authFetch(`/api/helpdesk/tickets/${encodeURIComponent(ticketId)}`)
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
