import { getEnv } from '../../config/env.js'
import type { StUploadFile } from './multipart.js'

export class StApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
  const raw = await res.text()
  let body: Record<string, unknown> = {}
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch {
    // ST debería devolver JSON; conservamos el status si no lo hace.
  }
  if (!res.ok) {
    const message =
      (typeof body.message === 'string' && body.message) ||
      (typeof body.error === 'string' && body.error) ||
      `ST respondió ${res.status}`
    throw new StApiError(message, res.status)
  }
  return body as T
}

async function stFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { stTicketsBaseUrl, stTicketsApiKey } = getEnv()
  if (!stTicketsBaseUrl || !stTicketsApiKey) {
    throw new StApiError('Integración con ST no configurada', 503)
  }
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  headers.set('X-Api-Key', stTicketsApiKey)
  const res = await fetch(`${stTicketsBaseUrl}${path}`, { ...init, headers })
  return parseResponse<T>(res)
}

function multipartBody(
  fields: Record<string, string | number | undefined>,
  files: StUploadFile[],
): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== '') form.append(key, String(value))
  }
  for (const file of files) {
    const bytes = new Uint8Array(file.buffer.length)
    bytes.set(file.buffer)
    form.append('attachments', new Blob([bytes], { type: file.mimetype }), file.originalname)
  }
  return form
}

export function fetchStCatalog() {
  return stFetch<Record<string, unknown>>('/api/integrations/bacarnet/catalogo')
}

export function createStTicket(fields: Record<string, string>, files: StUploadFile[]) {
  return stFetch<{ stTicketId: number; status: string; attachments?: unknown[] }>(
    '/api/integrations/bacarnet/tickets',
    { method: 'POST', body: multipartBody(fields, files) },
  )
}

export function fetchStTicket(stTicketId: number) {
  return stFetch<{ success: true; data: Record<string, unknown> }>(
    `/api/integrations/bacarnet/tickets/${stTicketId}`,
  )
}

export function fetchStComments(stTicketId: number, requesterEmail: string) {
  const email = encodeURIComponent(requesterEmail)
  return stFetch<{ success: true; data: unknown[] }>(
    `/api/integrations/bacarnet/tickets/${stTicketId}/comentarios?requesterEmail=${email}`,
  )
}

export function addStComment(stTicketId: number, requesterEmail: string, texto: string) {
  return stFetch<{ success: true; data: Record<string, unknown> }>(
    `/api/integrations/bacarnet/tickets/${stTicketId}/comentarios`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterEmail, texto }),
    },
  )
}

export function addStAttachments(
  stTicketId: number,
  requesterEmail: string,
  files: StUploadFile[],
) {
  return stFetch<{ success: true; data: unknown[] }>(
    `/api/integrations/bacarnet/tickets/${stTicketId}/adjuntos`,
    { method: 'POST', body: multipartBody({ requesterEmail }, files) },
  )
}

export function updateStStatus(
  stTicketId: number,
  requesterEmail: string,
  accion: string,
) {
  return stFetch<{ success: true; data: { status: string } }>(
    `/api/integrations/bacarnet/tickets/${stTicketId}/estado`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterEmail, accion }),
    },
  )
}
