import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export type CajaMoneda = 'ARS' | 'USD'
export type CajaTipo = 'principal' | 'chica'

export interface CajaItem {
  id: string
  nombre: string
  tipo: CajaTipo
  moneda: CajaMoneda
  cajaPadreId: string | null
  responsableUid: string
  saldoActualCentavos: number
}

export type CajaMovimientoTipo =
  | 'ingreso'
  | 'egreso'
  | 'fondeo_recibido'
  | 'fondeo_enviado'

export interface CajaMovimientoItem {
  id: string
  cajaId: string
  tipo: CajaMovimientoTipo
  concepto: string
  montoCentavos: number
  fecha: string | null
  comprobanteUrl: string | null
  categoria: string | null
  esViatico: boolean
  beneficiarioEmpleado: string | null
}

export interface CajaCierreItem {
  id: string
  cajaId: string
  periodoDesde: string | null
  periodoHasta: string | null
  saldoInicial: number
  totalFondeosRecibidos: number
  totalEgresos: number
  saldoTeorico: number
  efectivoContado: number | null
  diferencia: number | null
  estado: 'borrador' | 'cerrada' | 'aprobada'
  aprobadaPorUid: string | null
}

async function cajasFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  const headers = new Headers(init?.headers)
  if (!(init?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(resolveApiUrl(`/api/finanzas/cajas${path}`), { ...init, headers })
}

export async function fetchCajasAcceso(): Promise<boolean> {
  const res = await cajasFetch('/acceso')
  if (!res.ok) return false
  const data = (await res.json()) as { acceso: boolean }
  return data.acceso === true
}

/** @deprecated */
export const fetchCajaChicaAcceso = fetchCajasAcceso

export async function fetchCajas(): Promise<CajaItem[]> {
  const res = await cajasFetch('/')
  if (!res.ok) throw new Error('No se pudieron cargar las cajas')
  const data = (await res.json()) as { cajas: CajaItem[] }
  return data.cajas
}

export async function createCaja(body: {
  nombre: string
  tipo: CajaTipo
  moneda: CajaMoneda
  responsableUid: string
  saldoInicialCentavos: number
  cajaPadreId?: string | null
}): Promise<CajaItem> {
  const res = await cajasFetch('/', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = (await res.json()) as { error?: string }
    throw new Error(err.error ?? 'No se pudo crear la caja')
  }
  const data = (await res.json()) as { caja: CajaItem }
  return data.caja
}

export async function fondearCaja(
  principalId: string,
  body: { cajaChicaId: string; montoCentavos: number; concepto?: string },
): Promise<void> {
  const res = await cajasFetch(`/${principalId}/fondear`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = (await res.json()) as { error?: string }
    throw new Error(err.error ?? 'No se pudo fondear')
  }
}

export async function changeCajaResponsable(
  cajaId: string,
  body: { responsableUid: string; motivo?: string },
): Promise<CajaItem> {
  const res = await cajasFetch(`/${cajaId}/responsable`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = (await res.json()) as { error?: string }
    throw new Error(err.error ?? 'No se pudo cambiar el responsable')
  }
  const data = (await res.json()) as { caja: CajaItem }
  return data.caja
}

export async function fetchMovimientosCaja(cajaId: string): Promise<CajaMovimientoItem[]> {
  const res = await cajasFetch(`/${cajaId}/movimientos`)
  if (!res.ok) throw new Error('No se pudieron cargar los movimientos')
  const data = (await res.json()) as { movimientos: CajaMovimientoItem[] }
  return data.movimientos
}

export async function registrarMovimientoCaja(
  cajaId: string,
  input: {
    tipo: 'ingreso' | 'egreso'
    concepto: string
    montoCentavos: number
    fecha?: string
    esViatico?: boolean
    beneficiarioEmpleado?: string | null
    comprobanteFile?: File | null
  },
): Promise<CajaMovimientoItem> {
  const form = new FormData()
  form.set('tipo', input.tipo)
  form.set('concepto', input.concepto)
  form.set('montoCentavos', String(input.montoCentavos))
  if (input.fecha) form.set('fecha', input.fecha)
  if (input.esViatico) {
    form.set('esViatico', 'true')
    if (input.beneficiarioEmpleado) form.set('beneficiarioEmpleado', input.beneficiarioEmpleado)
  }
  if (input.comprobanteFile) form.set('comprobante', input.comprobanteFile)

  const res = await cajasFetch(`/${cajaId}/movimientos`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = (await res.json()) as { error?: string }
    throw new Error(err.error ?? 'No se pudo guardar')
  }
  const data = (await res.json()) as { movimiento: CajaMovimientoItem }
  return data.movimiento
}

export async function fetchCierresCaja(cajaId: string): Promise<CajaCierreItem[]> {
  const res = await cajasFetch(`/${cajaId}/cierres`)
  if (!res.ok) throw new Error('No se pudieron cargar los cierres')
  const data = (await res.json()) as { cierres: CajaCierreItem[] }
  return data.cierres
}

export async function cerrarCajaChica(
  cajaId: string,
  body: {
    periodoDesde: string
    periodoHasta: string
    efectivoContado: number
    cerrar: boolean
  },
): Promise<CajaCierreItem> {
  const res = await cajasFetch(`/${cajaId}/cerrar`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = (await res.json()) as { error?: string }
    throw new Error(err.error ?? 'No se pudo cerrar la caja')
  }
  const data = (await res.json()) as { cierre: CajaCierreItem }
  return data.cierre
}

export async function aprobarCierreCaja(cajaId: string, cierreId: string): Promise<void> {
  const res = await cajasFetch(`/${cajaId}/cierres/${cierreId}/aprobar`, { method: 'POST' })
  if (!res.ok) {
    const err = (await res.json()) as { error?: string }
    throw new Error(err.error ?? 'No se pudo aprobar')
  }
}
