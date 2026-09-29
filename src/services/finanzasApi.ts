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
  descubiertoVigenteDesde: string | null
  descubiertoActualizadoEl: string | null
  descubiertoActualizadoPor: string | null
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

export interface CashflowDetalleItem {
  descripcion: string
  cuentaId: string
  bancoNombre: string
  centavos: number
  cantidad: number
}

export interface CashflowCategoriaItem {
  categoriaId: string | null
  nombre: string
  color: string | null
  centavos: number
  /** Porcentaje sobre el total del grupo. */
  porcentaje: number
  /** Textos del banco que componen la categoría, por cuenta. Máximo 15. */
  detalle: CashflowDetalleItem[]
  /** Cuántos textos más hay que no vinieron en `detalle`. */
  detalleRestantes: number
}

export interface CashflowGrupoItem {
  /** Nombre del grupo, o "Sin categoría". */
  grupo: string
  sinCategoria: boolean
  color: string | null
  centavos: number
  /** Porcentaje sobre el total de entradas o de salidas. */
  porcentaje: number
  categorias: CashflowCategoriaItem[]
}

export interface CashflowBancoFila {
  bancoNombre: string
  saldoInicioCentavos: number | null
  entradasCentavos: number
  salidasCentavos: number
  saldoFinCentavos: number | null
  faltanteCentavos: number
}

export interface CashflowAviso {
  bancoNombre: string
  faltanteCentavos: number
  texto: string
}

export interface CashflowDiario {
  fecha: string
  moneda: FinanzasMoneda
  saldoInicial: { fechaId: string; centavos: number } | null
  entradasCentavos: number
  salidasCentavos: number
  saldoFinal: { estado: 'cerrado' | 'en_curso' | 'pendiente'; centavos: number | null }
  /** 'banco' si todas las cuentas usaron el cierre diario del banco. */
  origenSaldos: 'banco' | 'cierre15'
  bancos: CashflowBancoFila[]
  avisos: CashflowAviso[]
  entradas: CashflowGrupoItem[]
  salidas: CashflowGrupoItem[]
}

export async function fetchCashflowDiario(
  fecha: string,
  moneda: FinanzasMoneda,
): Promise<CashflowDiario> {
  const params = new URLSearchParams({ fecha, moneda })
  const res = await finanzasFetch(`/cashflow?${params.toString()}`)
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'No se pudo calcular el cashflow')
  }
  return res.json() as Promise<CashflowDiario>
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

/** Acuerdo de descubierto de una CC (null = sin acuerdo). Solo líder de Finanzas o super admin. */
export async function patchFinanzasDescubierto(
  cuentaId: string,
  body: { descubiertoCentavos: number | null; vigenteDesde: string | null },
): Promise<FinanzasCuenta> {
  const res = await finanzasFetch(`/cuentas/${encodeURIComponent(cuentaId)}/descubierto`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? 'No se pudo guardar el descubierto')
  }
  const data = (await res.json()) as { cuenta: FinanzasCuenta }
  return data.cuenta
}
