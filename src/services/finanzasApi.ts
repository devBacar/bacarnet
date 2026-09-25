import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export type FinanzasTipoCuenta = 'CC' | 'USD'
export type FinanzasMoneda = 'ARS' | 'USD'
export type FinanzasOrigenSaldo = 'interbanking' | 'manual'
export type FinanzasSemaforo = 'verde' | 'amarillo' | 'rojo'

export interface FinanzasCuenta {
  id: string
  bancoNombre: string
  tipo: FinanzasTipoCuenta
  tipoLabel: string
  moneda: FinanzasMoneda
  origenSaldo: FinanzasOrigenSaldo
  saldoActualCentavos: number
  descubiertoCentavos: number | null
  saldoActualizadoManualmenteEl: string | null
  saldoActualizadoManualmentePor: string | null
  descubierto: {
    porcentajeUsado: number | null
    semaforo: FinanzasSemaforo | null
    superado?: boolean
  } | null
}

export interface FinanzasCuentasResponse {
  cuentas: FinanzasCuenta[]
  totales: {
    arsCentavos: number
    usdCentavos: number
  }
}

async function finanzasFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  return fetch(resolveApiUrl(`/api/finanzas${path}`), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
}

export async function fetchFinanzasCuentas(): Promise<FinanzasCuentasResponse> {
  const res = await finanzasFetch('/cuentas')
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'No se pudieron cargar las cuentas')
  }
  return res.json() as Promise<FinanzasCuentasResponse>
}

export async function syncFinanzasCuentas(): Promise<{ synced: number; provider: string }> {
  const res = await finanzasFetch('/cuentas/sync', { method: 'POST' })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'No se pudo sincronizar con el banco')
  }
  return res.json() as Promise<{ synced: number; provider: string }>
}

export interface FinanzasPosicionCierre {
  fechaId: string
  cerradoAt: string | null
  totales: {
    arsCentavos: number
    usdCentavos: number
  }
  bancos: Array<{
    bancoNombre: string
    arsCentavos: number
    usdCentavos: number
  }>
  syncProveedor: {
    intentado: boolean
    ok: boolean
    provider: string | null
    error: string | null
  }
}

export interface FinanzasPosicionHistorialResponse {
  cierres: FinanzasPosicionCierre[]
  retencionDias: number
  horaCierre: string
}

export async function fetchFinanzasPosicionHistorial(): Promise<FinanzasPosicionHistorialResponse> {
  const res = await finanzasFetch('/cuentas/historial')
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'No se pudo cargar el historial de posiciones')
  }
  return res.json() as Promise<FinanzasPosicionHistorialResponse>
}

export async function patchFinanzasSaldoManual(
  cuentaId: string,
  saldoActualCentavos: number,
): Promise<FinanzasCuenta> {
  const res = await finanzasFetch(`/cuentas/${encodeURIComponent(cuentaId)}/saldo-manual`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ saldoActualCentavos }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'No se pudo guardar el saldo')
  }
  const data = (await res.json()) as { cuenta: FinanzasCuenta }
  return data.cuenta
}
