import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export type MedioPago = 'transferencia' | 'cheque' | 'efectivo'
export type VencimientoAlerta = 'vencido' | 'proximo' | 'neutro'

export interface ChequeVinculoResumen {
  id: string
  numero: string
  estadoActual: string
  estadoLabel: string
}

export interface CompromisoAgendaItem {
  id: string
  concepto: string
  proveedorONombre: string
  montoCentavos: number
  fechaVencimiento: string | null
  prioridad: number
  medioPago: MedioPago
  chequeId: string | null
  cheque: ChequeVinculoResumen | null
  estado: string
  cuentaId: string | null
  fechaPago: string | null
  alertaVencimiento: VencimientoAlerta
}

export interface CobroAgendaItem {
  id: string
  clienteONombre: string
  montoCentavos: number
  fechaEsperada: string | null
  prioridad: number
  chequeId: string | null
  cheque: ChequeVinculoResumen | null
  estado: string
  cuentaId: string | null
  fechaConfirmado: string | null
  alertaVencimiento: VencimientoAlerta
}

export interface HistorialAgendaItem {
  id: string
  estadoAnterior: string | null
  estadoNuevo: string
  fecha: string | null
  usuario: string
  nota: string | null
}

async function agendaFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  return fetch(resolveApiUrl(`/api/finanzas/agenda${path}`), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
}

export async function fetchCompromisosAgenda(): Promise<CompromisoAgendaItem[]> {
  const res = await agendaFetch('/compromisos')
  if (!res.ok) throw new Error('No se pudieron cargar los pagos pendientes')
  const data = (await res.json()) as { compromisos: CompromisoAgendaItem[] }
  return data.compromisos
}

export async function fetchCobrosAgenda(): Promise<CobroAgendaItem[]> {
  const res = await agendaFetch('/cobros')
  if (!res.ok) throw new Error('No se pudieron cargar los cobros esperados')
  const data = (await res.json()) as { cobros: CobroAgendaItem[] }
  return data.cobros
}

export async function createCompromisoAgenda(body: Record<string, unknown>) {
  const res = await agendaFetch('/compromisos', { method: 'POST', body: JSON.stringify(body) })
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? 'No se pudo crear el compromiso')
  }
  return res.json()
}

export async function createCobroAgenda(body: Record<string, unknown>) {
  const res = await agendaFetch('/cobros', { method: 'POST', body: JSON.stringify(body) })
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? 'No se pudo crear el cobro')
  }
  return res.json()
}

export async function patchCompromisoPrioridad(id: string, prioridad: number) {
  const res = await agendaFetch(`/compromisos/${id}/prioridad`, {
    method: 'PATCH',
    body: JSON.stringify({ prioridad }),
  })
  if (!res.ok) throw new Error('No se pudo actualizar la prioridad')
}

export async function patchCobroPrioridad(id: string, prioridad: number) {
  const res = await agendaFetch(`/cobros/${id}/prioridad`, {
    method: 'PATCH',
    body: JSON.stringify({ prioridad }),
  })
  if (!res.ok) throw new Error('No se pudo actualizar la prioridad')
}

export async function marcarCompromisoPagado(id: string, body: Record<string, unknown>) {
  const res = await agendaFetch(`/compromisos/${id}/marcar-pagado`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? 'No se pudo marcar como pagado')
  }
}

export async function confirmarCobroAgenda(id: string, body: Record<string, unknown>) {
  const res = await agendaFetch(`/cobros/${id}/confirmar`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? 'No se pudo confirmar el cobro')
  }
}

export async function fetchCompromisoHistorial(id: string): Promise<HistorialAgendaItem[]> {
  const res = await agendaFetch(`/compromisos/${id}/historial`)
  if (!res.ok) return []
  const data = (await res.json()) as { historial: HistorialAgendaItem[] }
  return data.historial
}
