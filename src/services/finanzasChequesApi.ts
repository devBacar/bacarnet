import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export type ChequeDireccion = 'recibido' | 'emitido'

export type ChequeEstadoRecibido =
  | 'en_cartera'
  | 'depositado'
  | 'endosado'
  | 'vendido'
  | 'acreditado'
  | 'rechazado'

export type ChequeEstadoEmitido = 'emitido' | 'entregado' | 'debitado' | 'anulado' | 'rechazado'

export type ChequeEstado = ChequeEstadoRecibido | ChequeEstadoEmitido

export interface ChequeListItem {
  id: string
  direccion: ChequeDireccion
  numero: string
  bancoEmisor: string
  libradorNombre: string
  libradorCuit: string
  beneficiarioNombre: string
  beneficiarioCuit: string
  cuentaId: string | null
  montoCentavos: number
  fechaEmision: string | null
  fechaPago: string | null
  tipo: 'fisico' | 'echeq'
  estadoActual: ChequeEstado
  estadoLabel: string
  compromisoPagoId: string | null
  cobroOrigenId: string | null
  endosadoA: string | null
  vendidoA: string | null
  vendidoConResponsabilidad: boolean | null
  motivoRechazo: string | null
  compromisoResumen: { id: string; concepto: string; proveedorONombre: string } | null
  cobroResumen: { id: string; clienteONombre: string } | null
  cuentaResumen: {
    id: string
    bancoNombre: string
    tipo: string
    tipoLabel: string
  } | null
}

export interface ChequeHistorialItem {
  id: string
  estadoAnterior: ChequeEstado | null
  estadoNuevo: ChequeEstado
  estadoAnteriorLabel: string | null
  estadoNuevoLabel: string
  fecha: string | null
  usuario: string
  nota: string | null
}

export interface ChequeDetail extends ChequeListItem {
  historial: ChequeHistorialItem[]
}

async function chequesFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  return fetch(resolveApiUrl(`/api/finanzas/cheques${path}`), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
}

export async function fetchCheques(params: {
  direccion?: ChequeDireccion
  estado?: ChequeEstado
  banco?: string
  fechaPagoDesde?: string
  fechaPagoHasta?: string
}): Promise<ChequeListItem[]> {
  const q = new URLSearchParams()
  if (params.direccion) q.set('direccion', params.direccion)
  if (params.estado) q.set('estado', params.estado)
  if (params.banco?.trim()) q.set('banco', params.banco.trim())
  if (params.fechaPagoDesde) q.set('fechaPagoDesde', params.fechaPagoDesde)
  if (params.fechaPagoHasta) q.set('fechaPagoHasta', params.fechaPagoHasta)
  const qs = q.toString()
  const res = await chequesFetch(qs ? `?${qs}` : '')
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'No se pudieron cargar los cheques')
  }
  const data = (await res.json()) as { cheques: ChequeListItem[] }
  return data.cheques.map((c) => ({
    ...c,
    direccion: c.direccion ?? 'recibido',
  }))
}

export async function fetchChequeDetail(id: string): Promise<ChequeDetail> {
  const res = await chequesFetch(`/${id}`)
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'No se pudo cargar el cheque')
  }
  const data = (await res.json()) as { cheque: ChequeDetail }
  return { ...data.cheque, direccion: data.cheque.direccion ?? 'recibido' }
}

export async function createCheque(body: Record<string, unknown>): Promise<ChequeDetail> {
  const res = await chequesFetch('', { method: 'POST', body: JSON.stringify(body) })
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? 'No se pudo crear el cheque')
  }
  const data = (await res.json()) as { cheque: ChequeDetail }
  return data.cheque
}

async function postAction(id: string, action: string, body: Record<string, unknown> = {}) {
  const res = await chequesFetch(`/${id}/${action}`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? 'No se pudo aplicar la acción')
  }
  const data = (await res.json()) as { cheque: ChequeDetail }
  return data.cheque
}

export const depositarCheque = (id: string, nota?: string) =>
  postAction(id, 'depositar', nota ? { nota } : {})

export const endosarCheque = (
  id: string,
  body: { endosadoA: string; compromisoPagoId?: string; nota?: string },
) => postAction(id, 'endosar', body)

export const venderCheque = (
  id: string,
  body: { vendidoA: string; vendidoConResponsabilidad: boolean; nota?: string },
) => postAction(id, 'vender', body)

export const rechazarCheque = (
  id: string,
  body: { motivoRechazo: string; nota?: string },
) => postAction(id, 'rechazar', body)

export const entregarChequeEmitido = (id: string, nota?: string) =>
  postAction(id, 'entregar', nota ? { nota } : {})

export const debitarChequeEmitido = (id: string, nota?: string) =>
  postAction(id, 'debitar', nota ? { nota } : {})

export const anularChequeEmitido = (id: string, nota?: string) =>
  postAction(id, 'anular', nota ? { nota } : {})

export async function fetchAgendaCompromisos(): Promise<
  Array<{ id: string; concepto: string; proveedorONombre: string }>
> {
  const res = await fetch(resolveApiUrl('/api/finanzas/agenda/compromisos'), {
    headers: { Authorization: `Bearer ${await auth.currentUser!.getIdToken()}` },
  })
  if (!res.ok) return []
  const data = (await res.json()) as {
    compromisos: Array<{ id: string; concepto: string; proveedorONombre: string }>
  }
  return data.compromisos
}

export async function fetchAgendaCobros(): Promise<Array<{ id: string; clienteONombre: string }>> {
  const user = auth.currentUser
  if (!user) return []
  const res = await fetch(resolveApiUrl('/api/finanzas/agenda/cobros'), {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  })
  if (!res.ok) return []
  const data = (await res.json()) as { cobros: Array<{ id: string; clienteONombre: string }> }
  return data.cobros
}
