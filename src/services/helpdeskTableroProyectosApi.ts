import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

async function authFetch<T>(path: string): Promise<T> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('No autenticado')
  const res = await fetch(resolveApiUrl(path), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
  return body
}

export interface TableroProyectosVeredictos {
  total: number
  viable: number
  viableConCondiciones: number
  noViable: number
}

export interface TableroProyectosTicketRow {
  ticketId: string
  area: string
  urgencia: 'baja' | 'media' | 'alta'
  estadoIdx: number
  estado: string | null
  responsableTeamId: string | null
  responsableNombre: string | null
  cancelado: boolean
  createdAt: string | null
  diasSinActividad: number
  minutaResumen: {
    objetivoSesion: string
    procesosEvaluadosCount: number
    procesosResumen: string
  } | null
  analisisResumen: {
    iniciativasTotal: number
    veredictos: TableroProyectosVeredictos
    iniciativasResumen: string
  } | null
  bitacoraResumen: { texto: string; fecha: string | null } | null
  finalizadoAt: string | null
}

export async function fetchTableroProyectos(): Promise<{ tickets: TableroProyectosTicketRow[] }> {
  return authFetch('/api/helpdesk/tablero-proyectos')
}
