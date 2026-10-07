import { auth } from './firebase'

export interface BoardDto {
  id: string
  name: string
  modifiedTime: string | null
  entryPath: string
  /** Tablero React con ruta propia (lo marca el backend). */
  tipo?: 'rrhh'
}

export interface ListBoardsResult {
  containerFolderId: string
  boards: BoardDto[]
}

export interface BoardAccessUserDto {
  uid: string
  email: string
  displayName: string
  grantedAt?: string | null
}

export interface BoardAccessListResult {
  boardFolderId: string
  boardName: string
  allowedUsers: BoardAccessUserDto[]
}

const SESSION_RENEW_MS = 15 * 60 * 1000

let renewTimer: ReturnType<typeof setInterval> | null = null

async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('No autenticado')
  return { Authorization: `Bearer ${token}` }
}

async function parseApiResponse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
  return body
}

export async function fetchBoardsVisibility(): Promise<{ visible: boolean }> {
  const res = await fetch('/api/boards/visibility', {
    headers: await authHeaders(),
    credentials: 'include',
  })
  return parseApiResponse<{ visible: boolean }>(res)
}

export async function ensureBoardSession(): Promise<void> {
  const res = await fetch('/api/boards/session', {
    method: 'POST',
    headers: await authHeaders(),
    credentials: 'include',
  })
  await parseApiResponse(res)
}

export function startBoardSessionRenewal(): void {
  stopBoardSessionRenewal()
  void ensureBoardSession().catch(() => {})
  renewTimer = setInterval(() => {
    void ensureBoardSession().catch(() => {})
  }, SESSION_RENEW_MS)
}

export function stopBoardSessionRenewal(): void {
  if (renewTimer) {
    clearInterval(renewTimer)
    renewTimer = null
  }
}

export async function listBoards(): Promise<ListBoardsResult> {
  const res = await fetch('/api/boards', {
    headers: await authHeaders(),
    credentials: 'include',
  })
  return parseApiResponse<ListBoardsResult>(res)
}

export async function listBoardAccess(boardFolderId: string): Promise<BoardAccessListResult> {
  const res = await fetch(`/api/boards/${encodeURIComponent(boardFolderId)}/access`, {
    headers: await authHeaders(),
    credentials: 'include',
  })
  return parseApiResponse<BoardAccessListResult>(res)
}

export async function grantBoardAccess(
  boardFolderId: string,
  email: string,
  reason: string,
): Promise<{ granted: boolean; allowedUsers: BoardAccessUserDto[] }> {
  const res = await fetch(`/api/boards/${encodeURIComponent(boardFolderId)}/access`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, reason }),
  })
  return parseApiResponse(res)
}

export async function revokeBoardAccess(
  boardFolderId: string,
  uid: string,
  reason: string,
): Promise<{ revoked: boolean; allowedUsers: BoardAccessUserDto[] }> {
  const res = await fetch(
    `/api/boards/${encodeURIComponent(boardFolderId)}/access/${encodeURIComponent(uid)}`,
    {
      method: 'DELETE',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ reason }),
    },
  )
  return parseApiResponse(res)
}

export async function recordBoardOpen(
  boardFolderId: string,
): Promise<{ id: string; name: string }> {
  const res = await fetch(`/api/boards/${encodeURIComponent(boardFolderId)}/open`, {
    method: 'POST',
    headers: await authHeaders(),
    credentials: 'include',
  })
  return parseApiResponse<{ id: string; name: string }>(res)
}

export function boardEntryUrl(boardFolderId: string, entryPath = 'index.html'): string {
  return `/api/boards/${encodeURIComponent(boardFolderId)}/${entryPath}`
}
