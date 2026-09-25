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
