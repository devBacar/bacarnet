import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export interface TransferenciaConfeccionadaItem {
  id: string
  compromisoPagoId: string
  tipo: string
  cuentaDebitoId: string
  cuentaCreditoCbu: string
  montoCentavos: number
  operationId: string
  processId: string | null
  estado: string
  erroresInterbanking: string[] | null
}

async function transferenciasFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  return fetch(resolveApiUrl(`/api/finanzas/transferencias${path}`), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
}

export type TransferenciaEstadoUi =
  | 'confeccionada'
  | 'pendiente_proceso'
  | 'rechazada'
  | 'efectivizada'
  | 'cancelada'

export type TransferenciaTipoUi =
  | 'cuentas_propias'
  | 'sueldos'
  | 'proveedores'
  | 'terceros'
  | 'pagos_arca'

export interface TransferenciaHistorialItem {
  id: string
  estadoAnterior: string | null
  estadoNuevo: string
  fecha: string | null
  origen: string
  nota: string | null
}

export interface TransferenciaCandidatoMovimiento {
  id: string
  fechaProceso: string
  montoCentavos: number
  descripcion: string
}

export interface TransferenciaListItem {
  id: string
  compromisoPagoId: string
  tipo: TransferenciaTipoUi | string
  estado: TransferenciaEstadoUi | string
  montoCentavos: number
  concepto: string | null
  fechaConfeccion: string | null
  operationId: string
  cuentaDebitoId: string
  direccion: string
  erroresInterbanking: string[] | null
  puedeCancelar: boolean
  movimientoId: string | null
  requiereConfirmacionManual: boolean
  candidatos: TransferenciaCandidatoMovimiento[]
}

export interface TransferenciasListFilters {
  estado?: string
  cuentaId?: string
  tipo?: string
  desde?: string
  hasta?: string
}

export async function fetchTransferencias(
  filters: TransferenciasListFilters = {},
): Promise<TransferenciaListItem[]> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value?.trim()) params.set(key, value.trim())
  }
  const qs = params.toString()
  const res = await transferenciasFetch(qs ? `/?${qs}` : '/')
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string
    transferencias?: TransferenciaListItem[]
  }
  if (!res.ok) throw new Error(payload.error ?? 'No se pudo cargar el historial de transferencias')
  return payload.transferencias ?? []
}

export async function fetchTransferenciaHistorial(
  transferenciaId: string,
): Promise<TransferenciaHistorialItem[]> {
  const res = await transferenciasFetch(`/${encodeURIComponent(transferenciaId)}/historial`)
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string
    historial?: TransferenciaHistorialItem[]
  }
  if (!res.ok) throw new Error(payload.error ?? 'No se pudo leer el historial')
  return payload.historial ?? []
}

export async function confirmarMovimientoTransferencia(
  transferenciaId: string,
  movimientoId: string,
): Promise<void> {
  const res = await transferenciasFetch(
    `/${encodeURIComponent(transferenciaId)}/confirmar-movimiento`,
    {
      method: 'POST',
      body: JSON.stringify({ movimientoId }),
    },
  )
  const payload = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(payload.error ?? 'No se pudo confirmar el movimiento')
}

export async function cancelarTransferenciaConfeccionada(transferenciaId: string): Promise<{
  transferencia: TransferenciaConfeccionadaItem
  compromiso: {
    id: string
    estado: string
    transferenciaConfeccionadaId: string | null
  }
  nota: string
}> {
  const res = await transferenciasFetch(`/${encodeURIComponent(transferenciaId)}/cancelar`, {
    method: 'POST',
    body: '{}',
  })
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string
    transferencia?: TransferenciaConfeccionadaItem
    compromiso?: {
      id: string
      estado: string
      transferenciaConfeccionadaId: string | null
    }
    nota?: string
  }
  if (!res.ok || !payload.transferencia || !payload.compromiso) {
    throw new Error(payload.error ?? 'No se pudo marcar la transferencia como cancelada')
  }
  return {
    transferencia: payload.transferencia,
    compromiso: payload.compromiso,
    nota: payload.nota ?? '',
  }
}

export async function confeccionarTransferencia(body: {
  compromisoPagoId: string
  cuentaCreditoCbu: string
  cuentaDebitoId?: string
  tipo?: 'cuentas_propias' | 'proveedores'
}): Promise<{ transferencia: TransferenciaConfeccionadaItem; provider: string }> {
  const res = await transferenciasFetch('/confeccionar', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string
    errores?: string[]
    transferencia?: TransferenciaConfeccionadaItem
  }
  if (!res.ok) {
    throw new Error(payload.errores?.[0] ?? payload.error ?? 'No se pudo confeccionar la transferencia')
  }
  return payload as { transferencia: TransferenciaConfeccionadaItem; provider: string }
}
