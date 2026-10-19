import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export interface PersonaRef {
  vientriId: number
  nombre: string | null
  cuit: string | null
}

export type EstadoChequeVientri =
  | 'en_cartera'
  | 'depositado'
  | 'vendido'
  | 'rechazado'
  | 'entregado'
  | 'pendiente_debito'
  | 'debitado'
  | 'anulado'
  | 'otro'

export const ESTADO_CHEQUE_VIENTRI_LABELS: Record<EstadoChequeVientri, string> = {
  en_cartera: 'En cartera',
  depositado: 'Depositado',
  vendido: 'Vendido',
  rechazado: 'Rechazado',
  entregado: 'Entregado a proveedor',
  pendiente_debito: 'Falta debitar',
  debitado: 'Debitado',
  anulado: 'Anulado',
  otro: 'Otro',
}

export interface VientriCheque {
  id: string
  direccion: 'emitido' | 'recibido'
  tipo: 'echeq' | 'fisico'
  numero: string
  bancoNombre: string | null
  montoCentavos: number
  fechaEmision: string | null
  fechaVencimiento: string | null
  fechaRecibido: string | null
  fechaDeposito: string | null
  fechaEntregado: string | null
  fechaConciliado: string | null
  estado: EstadoChequeVientri
  estadoVientri: string
  librador: PersonaRef | null
  entregadoPor: PersonaRef | null
  entregadoA: PersonaRef | null
  destinatario: string | null
  fuentes: string[]
  revisar: string[]
}

export interface VientriPendiente {
  id: string
  lado: 'pagar' | 'cobrar' | 'revisar'
  tipo: string | null
  comprobante: string
  persona: PersonaRef | null
  fecha: string | null
  fechaVencimiento: string | null
  totalCentavos: number
  pendienteCentavos: number
  moneda: string | null
  fechaProntoPago: string | null
  descuentoProntoPago: number | null
  prestamo: boolean
  revisar: string[]
}

export interface Pagina<T> {
  total: number
  totalCentavos: number
  page: number
  pages: number
  items: T[]
}

export interface EstadoVientri {
  fechaDatos: string | null
  archivo?: string | null
  importadoAt: string | null
  importacionId: string | null
  ok: boolean
  mensaje: string | null
  resumen: Record<string, unknown> | null
}

async function vientriFetch<T>(path: string): Promise<T> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  const res = await fetch(resolveApiUrl(`/api/finanzas/vientri${path}`), {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok || !body) throw new Error(body?.error ?? 'No se pudieron leer los datos de Vientri')
  return body
}

function qs(params: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') u.set(k, String(v))
  const s = u.toString()
  return s ? `?${s}` : ''
}

export async function fetchEstadoVientri(): Promise<EstadoVientri | null> {
  const r = await vientriFetch<{ estado: EstadoVientri | null }>('/estado')
  return r.estado
}

export function fetchChequesVientri(f: { direccion: 'emitido' | 'recibido'; estado?: string; q?: string; page?: number }) {
  return vientriFetch<Pagina<VientriCheque>>(`/cheques${qs(f)}`)
}

export function fetchPendientesVientri(f: { lado: 'pagar' | 'cobrar' | 'revisar'; q?: string; page?: number }) {
  return vientriFetch<Pagina<VientriPendiente>>(`/pendientes${qs(f)}`)
}

export interface ResultadoTraerVientri {
  estado: 'importado' | 'sin_novedades' | 'sin_archivo' | 'ocupado' | 'error'
  mensaje: string
  fechaDatos: string | null
}

/** Trae la última copia de Vientri desde Drive (si hay una nueva). Pide permiso de cheques. */
export async function traerVientriAhora(): Promise<ResultadoTraerVientri> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  const res = await fetch(resolveApiUrl('/api/finanzas/vientri/traer-ahora'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = (await res.json().catch(() => null)) as (ResultadoTraerVientri & { error?: string }) | null
  if (!body) throw new Error('No se pudieron traer los datos de Vientri')
  if (!res.ok) throw new Error(body.error ?? body.mensaje ?? 'No se pudieron traer los datos de Vientri')
  return body
}

export interface ChequeParaLimpiar {
  clave: string
  direccion: 'emitido' | 'recibido'
  numero: string
  bancoNombre: string | null
  montoCentavos: number
  fechaVencimiento: string | null
  estadoVientri: string
  librador: string | null
  motivo: string
}

export function fetchLimpiezaVientri() {
  return vientriFetch<{ fechaDatos: string | null; desde: string | null; items: ChequeParaLimpiar[] }>('/limpieza')
}
