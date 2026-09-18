import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export type StTicketStatus = 'open' | 'in-progress' | 'resolved' | 'closed'
export type StTicketPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface StDepartment {
  id: number
  name: string
  company_id: number
}

export interface StPredefinedProblem {
  id: number
  title: string
  description: string
  category_id: number
  department_id: number
}

export interface StCategory {
  id: number
  name: string
  predefinedProblems: StPredefinedProblem[]
}

export interface StCatalog {
  companyId: number
  departments: StDepartment[]
  categories: StCategory[]
}

export interface StAttachment {
  id: number
  ticket_id: number
  file_name: string
  file_path: string
  file_type: string
  url?: string
}

export interface StTicket {
  stTicketId: number
  title: string
  description: string
  priority: StTicketPriority
  status: StTicketStatus
  departmentId: number
  departmentName?: string | null
  categoryId: number
  categoryName?: string | null
  requesterNombre: string
  attachments: StAttachment[]
  createdAt: string | null
  updatedAt: string | null
}

export interface StComment {
  id: number
  ticket_id: number
  texto: string
  created_at: string
  authorLabel: string
  isRequester?: boolean
  authorRole?: string | null
  isStaff?: boolean
}

export class StTicketsApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function authHeaders(): Promise<Headers> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new StTicketsApiError('No autenticado', 401)
  return new Headers({ Authorization: `Bearer ${token}`, Accept: 'application/json' })
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = await authHeaders()
  new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  const res = await fetch(resolveApiUrl(`/api/st-tickets${path}`), { ...init, headers })
  const body = await res.json().catch(() => ({})) as Record<string, unknown>
  if (!res.ok) {
    throw new StTicketsApiError(
      typeof body.error === 'string' ? body.error : 'No se pudo completar la operación',
      res.status,
    )
  }
  return body as T
}

export async function getStCatalog(): Promise<StCatalog> {
  const response = await request<{ data: StCatalog }>('/catalogo')
  return response.data
}

export async function listMyStTickets(): Promise<StTicket[]> {
  const response = await request<{ tickets: StTicket[] }>('/mias')
  return response.tickets
}

export async function getStTicket(stTicketId: number): Promise<StTicket> {
  const response = await request<{
    data: Record<string, unknown>
    link: StTicket
  }>(`/${stTicketId}`)
  return {
    ...response.link,
    title: String(response.data.title ?? response.link.title),
    description: String(response.data.description ?? response.link.description),
    priority: (response.data.priority ?? response.link.priority) as StTicketPriority,
    status: (response.data.status ?? response.link.status) as StTicketStatus,
    departmentName: String(response.data.department_name ?? response.link.departmentName ?? ''),
    categoryName: String(response.data.category_name ?? response.link.categoryName ?? ''),
  }
}

export async function createStTicket(form: FormData) {
  return request<{ stTicketId: number; status: StTicketStatus }>('/solicitudes', {
    method: 'POST',
    body: form,
  })
}

export async function getStComments(stTicketId: number): Promise<StComment[]> {
  const response = await request<{ data: StComment[] }>(`/${stTicketId}/comentarios`)
  return response.data
}

export async function addStComment(stTicketId: number, texto: string): Promise<StComment> {
  const response = await request<{ data: StComment }>(`/${stTicketId}/comentarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto }),
  })
  return response.data
}

export async function addStAttachments(stTicketId: number, files: File[]): Promise<StAttachment[]> {
  const form = new FormData()
  files.forEach((file) => form.append('attachments', file))
  const response = await request<{ data: StAttachment[] }>(`/${stTicketId}/adjuntos`, {
    method: 'POST',
    body: form,
  })
  return response.data
}

export async function updateStTicketStatus(
  stTicketId: number,
  accion: 'reabrir' | 'cerrar',
): Promise<StTicketStatus> {
  const response = await request<{ data: { status: StTicketStatus } }>(`/${stTicketId}/estado`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion }),
  })
  return response.data.status
}

/**
 * ST acepta 50 MB, pero BacarNet limita a 25 MB para dejar margen bajo el
 * límite del request HTTP de Cloud Functions 2nd gen.
 */
export const ST_MAX_FILE_BYTES = 25 * 1024 * 1024
export const ST_FILE_ACCEPT =
  '.jpeg,.jpg,.png,.gif,.webp,.heic,.heif,.avif,.pdf,.doc,.docx,.xls,.xlsx,.mp4,.mov,.avi,.wmv,.mkv'
