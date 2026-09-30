import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

/** Misma lista y orden que backend/src/modules/finanzas/agenda/domain/grupos-compromiso.ts */
export const GRUPOS_COMPROMISO = [
  'Inversores USD',
  'Inversores pesos',
  'Préstamos bancarios',
  'Bancos',
  'Inversiones bursátiles',
  'Impositivo',
  'Gastos de personal',
  'Otros egresos',
] as const

export type GrupoCompromiso = (typeof GRUPOS_COMPROMISO)[number]
export type MonedaCompromiso = 'ARS' | 'USD'
export type MedioPagoCompromiso = 'transferencia' | 'cheque' | 'efectivo'
export type TipoColumnaDia = 'habil' | 'finde' | 'feriado'

export const COMPROMISOS_MES_QUERY_KEY = ['finanzas', 'compromisos-mes'] as const

export interface MontosMoneda {
  ars: number
  usd: number
}

export interface ColumnaDiaMes {
  fecha: string
  tipo: TipoColumnaDia
  esHoy: boolean
  fechas: string[]
}

export interface CeldaDiaMes {
  planificadoCentavos: number
  pagadoCentavos: number
  corrido: boolean
}

export interface FilaCompromisoMes {
  compromisoId: string
  concepto: string
  proveedorONombre: string
  moneda: MonedaCompromiso
  deudaTotalCentavos: number | null
  importeCentavos: number
  cuota: string | null
  cuotaNumero: number | null
  cuotaTotal: number | null
  observacion: string | null
  fechaVencimiento: string
  medioPago: MedioPagoCompromiso
  porDia: Record<string, CeldaDiaMes>
  acumuladoCentavos: number
  diferenciaCentavos: number
  estado: string
}

export interface GrupoCompromisoMes {
  grupo: string
  filas: FilaCompromisoMes[]
  subtotalPorDia: Record<string, MontosMoneda>
  subtotal: {
    importe: MontosMoneda
    acumulado: MontosMoneda
    diferencia: MontosMoneda
  }
}

export interface PlanillaCompromisosMes {
  mes: string
  tipoCambio: number | null
  dias: ColumnaDiaMes[]
  grupos: GrupoCompromisoMes[]
  totalEgresosPorDia: Record<string, MontosMoneda & { arsConvertido: number }>
}

export interface CompromisoMesInput {
  concepto: string
  proveedorONombre: string
  grupo: string
  moneda: MonedaCompromiso
  montoCentavos: number
  fechaVencimiento: string
  deudaTotalCentavos: number | null
  cuotaNumero: number | null
  cuotaTotal: number | null
  observacion: string | null
  medioPago: MedioPagoCompromiso
}

async function mesFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  return fetch(resolveApiUrl(`/api/finanzas/compromisos-mes${path}`), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
}

async function errorDe(res: Response, fallback: string): Promise<Error> {
  const payload = (await res.json().catch(() => ({}))) as { error?: string }
  return new Error(payload.error ?? fallback)
}

export async function fetchPlanillaCompromisosMes(mes: string): Promise<PlanillaCompromisosMes> {
  const res = await mesFetch(`/?mes=${encodeURIComponent(mes)}`)
  if (!res.ok) throw await errorDe(res, 'No se pudo cargar la planilla')
  return (await res.json()) as PlanillaCompromisosMes
}

export async function guardarTipoCambioMes(mes: string, usdArs: number): Promise<void> {
  const res = await mesFetch('/tipo-cambio', {
    method: 'PUT',
    body: JSON.stringify({ mes, usdArs }),
  })
  if (!res.ok) throw await errorDe(res, 'No se pudo guardar el tipo de cambio')
}

export async function crearCompromisoMes(body: CompromisoMesInput): Promise<void> {
  const res = await mesFetch('/compromisos', { method: 'POST', body: JSON.stringify(body) })
  if (!res.ok) throw await errorDe(res, 'No se pudo crear el compromiso')
}

export async function editarCompromisoMes(id: string, body: CompromisoMesInput): Promise<void> {
  const res = await mesFetch(`/compromisos/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
  if (!res.ok) throw await errorDe(res, 'No se pudo editar el compromiso')
}
