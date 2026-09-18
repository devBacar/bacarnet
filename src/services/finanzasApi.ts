import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export type FinanzasTipoCuenta = 'CA' | 'CC' | 'USD'
export type FinanzasMoneda = 'ARS' | 'USD'
export type FinanzasSemaforo = 'verde' | 'amarillo' | 'rojo'

export interface FinanzasCuenta {
  id: string
  bancoNombre: string
  tipo: FinanzasTipoCuenta
  tipoLabel: string
  moneda: FinanzasMoneda
  saldoActualCentavos: number
  descubiertoCentavos: number | null
  descubierto: {
    porcentajeUsado: number | null
    semaforo: FinanzasSemaforo | null
    superado: boolean
  } | null
}

export interface FinanzasCuentasResponse {
  cuentas: FinanzasCuenta[]
  totales: {
    arsCentavos: number
    usdCentavos: number
  }
}

async function finanzasFetch(path: string): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  return fetch(resolveApiUrl(`/api/finanzas${path}`), {
    headers: { Authorization: `Bearer ${token}` },
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
