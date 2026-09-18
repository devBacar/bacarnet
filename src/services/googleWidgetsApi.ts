import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export const GOOGLE_RECONNECT_REQUIRED = 'google_reconnect_required' as const

export interface WidgetGmailMessage {
  id: string
  from: string
  subject: string
}

export interface WidgetGmailMessageDetail {
  id: string
  from: string
  subject: string
  date: string | null
  bodyText: string
  bodyHtml: string | null
  gmailWebUrl: string
}

export interface WidgetCalendarEvent {
  id: string
  summary: string
  startTime: string
}

export interface WidgetCalendarAttendee {
  email: string
  displayName: string | null
  responseStatus: string
}

export interface WidgetCalendarEventDetail {
  id: string
  summary: string
  start: string | null
  end: string | null
  allDay: boolean
  location: string | null
  description: string | null
  attendees: WidgetCalendarAttendee[]
  calendarWebUrl: string | null
}

export class GoogleWidgetsApiError extends Error {
  readonly code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'GoogleWidgetsApiError'
    this.code = code
  }
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) {
    throw new GoogleWidgetsApiError('No autenticado')
  }

  return fetch(resolveApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

async function parseApiError(res: Response): Promise<GoogleWidgetsApiError> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
  return new GoogleWidgetsApiError(
    body.error ?? `Error ${res.status}`,
    body.code,
  )
}

export async function fetchGoogleWidgetsStatus(): Promise<{ connected: boolean }> {
  const res = await authFetch('/api/me/google/status')
  if (!res.ok) {
    throw await parseApiError(res)
  }
  return (await res.json()) as { connected: boolean }
}

export async function startGoogleWidgetsOAuth(returnTo = '/intranet'): Promise<void> {
  const res = await authFetch('/api/me/google/oauth/start', {
    method: 'POST',
    body: JSON.stringify({ returnTo }),
  })
  if (!res.ok) {
    throw await parseApiError(res)
  }
  const body = (await res.json()) as { authorizeUrl?: string }
  if (!body.authorizeUrl) {
    throw new GoogleWidgetsApiError('No se recibió la URL de autorización')
  }
  window.location.assign(body.authorizeUrl)
}

export async function disconnectGoogleWidgets(): Promise<void> {
  const res = await authFetch('/api/me/google/connection', { method: 'DELETE' })
  if (!res.ok) {
    throw await parseApiError(res)
  }
}

export async function fetchWidgetGmailMessages(): Promise<WidgetGmailMessage[]> {
  const res = await authFetch('/api/me/gmail/messages')
  if (!res.ok) {
    throw await parseApiError(res)
  }
  const body = (await res.json()) as { messages?: WidgetGmailMessage[] }
  return body.messages ?? []
}

export async function fetchWidgetCalendarEvents(): Promise<WidgetCalendarEvent[]> {
  const res = await authFetch('/api/me/calendar/eventos')
  if (!res.ok) {
    throw await parseApiError(res)
  }
  const body = (await res.json()) as { events?: WidgetCalendarEvent[] }
  return body.events ?? []
}

export async function fetchWidgetGmailMessageDetail(
  messageId: string,
): Promise<WidgetGmailMessageDetail> {
  const res = await authFetch(`/api/me/gmail/messages/${encodeURIComponent(messageId)}`)
  if (!res.ok) {
    throw await parseApiError(res)
  }
  const body = (await res.json()) as { message?: WidgetGmailMessageDetail }
  if (!body.message) {
    throw new GoogleWidgetsApiError('Correo no encontrado')
  }
  return body.message
}

export async function fetchWidgetCalendarEventDetail(
  eventId: string,
): Promise<WidgetCalendarEventDetail> {
  const res = await authFetch(`/api/me/calendar/eventos/${encodeURIComponent(eventId)}`)
  if (!res.ok) {
    throw await parseApiError(res)
  }
  const body = (await res.json()) as { event?: WidgetCalendarEventDetail }
  if (!body.event) {
    throw new GoogleWidgetsApiError('Evento no encontrado')
  }
  return body.event
}

export function isGoogleReconnectError(err: unknown): boolean {
  return (
    err instanceof GoogleWidgetsApiError && err.code === GOOGLE_RECONNECT_REQUIRED
  )
}
