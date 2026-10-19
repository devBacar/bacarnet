import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export type MedioPago = 'transferencia' | 'cheque' | 'efectivo'
export type VencimientoAlerta = 'vencido' | 'proximo' | 'neutro'
export type PrioridadUrgencia = 'alta' | 'media' | 'baja'
export type CompromisosAgendaVista = 'pendientes' | 'pagados'
export type CobrosAgendaVista = 'esperados' | 'cobrados'

export interface ChequeVinculoResumen {
  id: string
  numero: string
  estadoActual: string
  estadoLabel: string
}

export type CompromisoEstadoAgenda =
  | 'pendiente'
  | 'vencido'
  | 'confeccionada_pendiente_autorizacion'
  | 'pagado'

export interface CompromisoAgendaItem {
  id: string
  concepto: string
  proveedorONombre: string
  montoCentavos: number
  fechaVencimiento: string | null
  urgenciaManual: PrioridadUrgencia | null
  medioPago: MedioPago
  chequeId: string | null
  cheque: ChequeVinculoResumen | null
  transferenciaConfeccionadaId: string | null
  estado: CompromisoEstadoAgenda | string
  cuentaId: string | null
  fechaPago: string | null
  updatedAt?: string | null
  alertaVencimiento: VencimientoAlerta
  esViatico?: boolean
  beneficiarioEmpleado?: string | null
  grupo?: string
  moneda?: 'ARS' | 'USD'
  deudaTotalCentavos?: number | null
  cuotaNumero?: number | null
  cuotaTotal?: number | null
  observacion?: string | null
  acumuladoCentavos?: number
  restanteCentavos?: number
  /** 'vientri' si vino de la carga diaria de Vientri: comprobante, proveedor, importe y moneda no se editan acá. */
  origen?: 'vientri' | null
  vientri?: VientriEnAgendaItem | null
  posibleDuplicado?: { id: string; descripcion: string } | null
}

export interface VientriEnAgendaItem {
  comprobante: string
  tipo: string | null
  cuit: string | null
  totalCentavos: number
  fechaVencimiento: string
  fechaDatos: string
  sinFechaDePago?: boolean
}

export interface CobroAgendaItem {
  id: string
  clienteONombre: string
  montoCentavos: number
  fechaEsperada: string | null
  urgenciaManual: PrioridadUrgencia | null
  chequeId: string | null
  cheque: ChequeVinculoResumen | null
  estado: string
  cuentaId: string | null
  fechaConfirmado: string | null
  updatedAt?: string | null
  alertaVencimiento: VencimientoAlerta
  moneda?: 'ARS' | 'USD'
  comprobante?: string | null
  origen?: 'vientri' | null
  vientri?: VientriEnAgendaItem | null
  posibleDuplicado?: { id: string; descripcion: string } | null
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

export async function fetchCompromisosAgenda(
  vista: CompromisosAgendaVista = 'pendientes',
): Promise<CompromisoAgendaItem[]> {
  const res = await agendaFetch(`/compromisos?vista=${encodeURIComponent(vista)}`)
  if (!res.ok) throw new Error('No se pudieron cargar los compromisos')
  const data = (await res.json()) as { compromisos: CompromisoAgendaItem[] }
  return data.compromisos
}

export async function fetchCobrosAgenda(vista: CobrosAgendaVista = 'esperados'): Promise<CobroAgendaItem[]> {
  const res = await agendaFetch(`/cobros?vista=${encodeURIComponent(vista)}`)
  if (!res.ok) throw new Error('No se pudieron cargar los cobros')
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

export async function patchCompromisoAgenda(id: string, body: Record<string, unknown>) {
  const res = await agendaFetch(`/compromisos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? 'No se pudo editar el compromiso')
  }
}

export async function patchCompromisoUrgencia(id: string, urgenciaManual: PrioridadUrgencia | null) {
  const res = await agendaFetch(`/compromisos/${id}/prioridad`, {
    method: 'PATCH',
    body: JSON.stringify({ urgenciaManual }),
  })
  if (!res.ok) throw new Error('No se pudo actualizar la urgencia')
}

export async function patchCobroUrgencia(id: string, urgenciaManual: PrioridadUrgencia | null) {
  const res = await agendaFetch(`/cobros/${id}/prioridad`, {
    method: 'PATCH',
    body: JSON.stringify({ urgenciaManual }),
  })
  if (!res.ok) throw new Error('No se pudo actualizar la urgencia')
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

export async function fetchCobroHistorial(id: string): Promise<HistorialAgendaItem[]> {
  const res = await agendaFetch(`/cobros/${id}/historial`)
  if (!res.ok) return []
  const data = (await res.json()) as { historial: HistorialAgendaItem[] }
  return data.historial
}

export interface PagoHechoItem {
  compromisoId: string
  fecha: string
  proveedorONombre: string
  concepto: string
  cuota: string | null
  montoCentavos: number
  moneda: 'ARS' | 'USD'
  medio: MedioPago
  comoSePago: string
  link: string | null
}

export async function fetchPagosHechos(mes: string): Promise<{ desde: string; hasta: string; pagos: PagoHechoItem[] }> {
  const res = await agendaFetch(`/pagos-hechos?mes=${encodeURIComponent(mes)}`)
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? 'No se pudieron cargar los pagos hechos')
  }
  return (await res.json()) as { desde: string; hasta: string; pagos: PagoHechoItem[] }
}
