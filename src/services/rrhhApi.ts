import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

async function rrhhFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(resolveApiUrl(`/api/rrhh${path}`), { ...init, headers })
}

export interface RrhhEstado {
  ok: boolean
  modulo: 'rrhh'
}

export async function fetchRrhhEstado(): Promise<RrhhEstado> {
  const res = await rrhhFetch('/estado')
  if (!res.ok) throw new Error('No se pudo verificar el módulo RRHH')
  return (await res.json()) as RrhhEstado
}
