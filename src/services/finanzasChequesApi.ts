import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export type ChequeEstado =
  | 'en_cartera'
  | 'depositado'
  | 'vendido'
  | 'rechazado'
  | 'pendiente'
  | 'debitado'
  | 'renovado'

export type ChequeTipo = 'echeq' | 'fisico'
export type ChequeOrigen = 'cliente' | 'tercero' | 'propio'
export type ChequeDireccion = 'recibido' | 'emitido'

/** Compromiso de Agenda que este cheque paga (si se emitió/endosó desde Hoy). */
export interface ChequePagoDe {
  compromisoId: string
  proveedorONombre: string
  concepto: string
}

export const CHEQUE_ESTADO_LABELS: Record<ChequeEstado, string> = {
  en_cartera: 'En cartera',
  depositado: 'Depositado',
  vendido: 'Vendido',
  rechazado: 'Rechazado',
  pendiente: 'Pendiente',
  debitado: 'Debitado',
  renovado: 'Renovado',
}

export const CHEQUE_DIRECCION_LABELS: Record<ChequeDireccion, string> = {
  recibido: 'Recibido',
  emitido: 'Emitido',
}

export interface ChequeListItem {
  id: string
  numero: string
  tipo: ChequeTipo
  direccion: ChequeDireccion
  origen: ChequeOrigen
  emisor: string
  emisorCuit: string
  fechaEmision: string
  fechaPago: string
  montoCentavos: number
  estado: ChequeEstado
  estadoBancario: string | null
  endosante: string | null
  bancoEmisor: string | null
  bancoEmisorCodigo: number | null
  cliente: string | null
  destinatario: string | null
  fechaRecibido: string | null
  fechaEntregado: string | null
  utilizado: boolean | null
  cmc7: string | null
  observaciones: string | null
  movimientoBancarioId: string | null
  movimientoCuentaId: string | null
  movimientoFecha: string | null
  fechaAcreditacion: string | null
  vientriSync: boolean
  vientriClave: string | null
  vientriEstadoPrevio: string | null
  vientriCmpIngreso: number | null
  vientriCmpIngresoDesc: string | null
  vientriCmpSalida: number | null
  vientriCmpSalidaDesc: string | null
  /** Ausente en respuestas viejas; null si el cheque no paga un compromiso. */
  pagoDe?: ChequePagoDe | null
  ocasionalEnriquecido?: boolean
  esProveedorFinanciero?: boolean | null
  esRenovacion?: boolean | null
  tipoProveedor?: 'financiero' | 'ficticio' | null
  operacionUsd?: { montoUsd: number; cotizacion: number } | null
  renovacionDe?: string[] | null
  renovadoPor?: string[] | null
  esInteresEncubierto?: boolean
  beneficiarioRealFinanciero?: string | null
}

export interface ChequesListResponse {
  direccion: ChequeDireccion | null
  origen: ChequeOrigen | null
  estado: ChequeEstado | null
  tipo: ChequeTipo | null
  desde: string | null
  hasta: string | null
  page: number
  limit: number
  total: number
  totalCentavos: number
  recibidosCentavos: number
  emitidosCentavos: number
  cheques: ChequeListItem[]
}

export interface ChequesListFilters {
  direccion?: ChequeDireccion | ''
  origen?: ChequeOrigen | ''
  estado?: ChequeEstado | ''
  tipo?: ChequeTipo | ''
  vinculacion?: 'vinculado' | 'sin_vincular' | ''
  comprobante?: 'con_comprobante' | 'sin_comprobante' | ''
  interesEncubierto?: 'true' | 'false' | ''
  desde?: string
  hasta?: string
  q?: string
  page?: number
  limit?: number
}

export interface ResumenDiario {
  fecha: string
  cantidadACobrar: number
  totalACobrarCentavos: number
  proximos: {
    cantidadACobrar: number
    totalACobrarCentavos: number
  }
}

export interface ImportResult {
  insertados: number
  actualizados: number
  ignorados: number
  duplicados: number
  errores: string[]
  avisos: string[]
}

async function chequesFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  return fetch(resolveApiUrl(`/api/finanzas/cheques${path}`), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  })
}

export interface ComprobantePendiente {
  vientriId: number
  tipo: string | null
  comprobante: string
  persona: { nombre: string | null; cuit: string | null } | null
  fecha: string | null
  fechaVencimiento: string | null
  totalCentavos: number
  pendienteCentavos: number
  moneda: string | null
}

export interface ChequeDetalleMovimiento {
  id: string
  fechaProceso: string
  descripcion: string
  contraparte: { nombre: string | null; cuit: string | null } | string | null
  tipo: string
  montoCentavos: number
  bancoNombre: string
  nota: string | null
}

export interface ChequeDetalleResponse {
  cheque: ChequeListItem
  movimiento: ChequeDetalleMovimiento | null
  comprobantes: {
    ingreso: ComprobantePendiente | null
    salida: ComprobantePendiente | null
  }
}

export async function fetchChequeDetalle(id: string): Promise<ChequeDetalleResponse> {
  const res = await chequesFetch(`/${encodeURIComponent(id)}/detalle`)
  const body = (await res.json().catch(() => null)) as { error?: string } & Partial<ChequeDetalleResponse> | null
  if (!res.ok || !body?.cheque) {
    throw new Error(body?.error ?? 'No se pudo obtener el detalle del cheque')
  }
  return body as ChequeDetalleResponse
}

export async function fetchChequeById(id: string): Promise<ChequeListItem> {
  const res = await chequesFetch(`/${encodeURIComponent(id)}`)
  const body = (await res.json().catch(() => null)) as { error?: string; cheque?: ChequeListItem } | null
  if (!res.ok || !body?.cheque) {
    throw new Error(body?.error ?? 'No se pudo obtener el cheque')
  }
  return body.cheque
}

export async function fetchCheques(filters: ChequesListFilters): Promise<ChequesListResponse> {
  const params = new URLSearchParams()
  if (filters.direccion) params.set('direccion', filters.direccion)
  if (filters.origen) params.set('origen', filters.origen)
  if (filters.estado) params.set('estado', filters.estado)
  if (filters.tipo) params.set('tipo', filters.tipo)
  if (filters.vinculacion) params.set('vinculacion', filters.vinculacion)
  if (filters.comprobante) params.set('comprobante', filters.comprobante)
  if (filters.interesEncubierto) params.set('interesEncubierto', filters.interesEncubierto)
  if (filters.q) params.set('q', filters.q)
  if (filters.desde) params.set('desde', filters.desde)
  if (filters.hasta) params.set('hasta', filters.hasta)
  if (filters.page) params.set('page', String(filters.page))
  if (filters.limit) params.set('limit', String(filters.limit))

  const qs = params.toString()
  const res = await chequesFetch(qs ? `?${qs}` : '')
  const body = (await res.json().catch(() => null)) as { error?: string } | ChequesListResponse | null
  if (!res.ok) {
    throw new Error(body && 'error' in body && body.error ? body.error : 'No se pudieron cargar los cheques')
  }
  return body as ChequesListResponse
}

export async function fetchResumenDiario(): Promise<ResumenDiario> {
  const res = await chequesFetch('/resumen-diario')
  const body = (await res.json().catch(() => null)) as { error?: string } | ResumenDiario | null
  if (!res.ok) {
    throw new Error(body && 'error' in body && body.error ? body.error : 'No se pudo obtener el resumen')
  }
  return body as ResumenDiario
}

export async function importChequesExcel(file: File): Promise<ImportResult> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await chequesFetch('/import', { method: 'POST', body: formData })
  const body = (await res.json().catch(() => null)) as { error?: string } | ImportResult | null
  if (!res.ok) {
    throw new Error(body && 'error' in body && body.error ? body.error : 'No se pudo importar el archivo')
  }
  return body as ImportResult
}

export interface IngresarChequesRow {
  numero: string
  emisor: string
  fechaEmision: string
  fechaPago: string
  montoPesos: string
  cmc7: string
  endosante: string
  bancoEmisor: string
  tipo: ChequeTipo
  condicion: string
}

export interface IngresarChequesPayload {
  direccion: ChequeDireccion
  origen: ChequeOrigen
  rows: IngresarChequesRow[]
}

export async function ingresarChequesPegados(payload: IngresarChequesPayload): Promise<ImportResult> {
  const res = await chequesFetch('/ingresar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = (await res.json().catch(() => null)) as { error?: string } | ImportResult | null
  if (!res.ok) {
    throw new Error(body && 'error' in body && body.error ? body.error : 'No se pudieron ingresar los cheques')
  }
  return body as ImportResult
}

// ── Cheques Ocasionales ─────────────────────────────────────────────

export interface ChequeOcasionalItem {
  numeroCheque: string
  beneficiario: string
  beneficiarioNormalizado: string
  montoCentavos: number
  fechaVencimiento: string | null
  fechaEmision: string | null
  estadoCodigo: number | null
  estado: string
  pagado: boolean
  esProveedorFinanciero: boolean
  tipoProveedor: 'financiero' | 'ficticio' | null
  esRenovacion: boolean
  renovacionDe: string[]
  renovadoPor: string[]
  operacionUsd: { montoUsd: number; cotizacion: number } | null
  obsOriginal: string
  revisar: string[]
  vientriId: number
  baja: boolean
}

export type OcasionalesFiltro = '' | 'financiero' | 'gasto_real' | 'con_renovacion' | 'con_usd'

export interface OcasionalesListResponse {
  cheques: ChequeOcasionalItem[]
  total: number
  totalCentavos: number
  page: number
  pages: number
}

export interface OcasionalesResumenResponse {
  totalCheques: number
  totalMontoCentavos?: number
  pendientesCantidad?: number
  pendientesMontoCentavos?: number
  fechasImposiblesCantidad?: number
  financieros: number
  financierosMontoCentavos?: number
  gastoRealCantidad?: number
  gastoRealMontoCentavos?: number
  conRenovacion: number
  conUsd: number
  operacionesUsdUnicas?: number
  operacionesUsdAgrupadas?: Array<{
    beneficiario: string
    beneficiarioNormalizado: string
    montoUsd: number
    cotizacion: number
    equivalenteCentavos: number
    cantidadCheques: number
    sumaChequesCentavos: number
    cheques: string[]
  }>
  totalMontoUsd?: number
  cotizacionPromedioUsd?: number
  porMes?: Array<{
    mes: string
    cantidad: number
    montoCentavos: number
  }>
  costoFinanciero: {
    cantidadCadenas: number
    capitalTotalCentavos: number
    interesTotalCentavos: number
    tasaImplicitaPromedio: number
    porBeneficiario: Array<{
      beneficiario: string
      cadenas: number
      capitalCentavos: number
      interesCentavos: number
      tasaImplicita: number
    }>
  }
}

export interface EslabonDetalleRef {
  numeroCheque: string
  montoCentavos: number | null
  fechaVencimiento: string | null
  estado: string | null
}

export interface OcasionalDetalleResponse {
  cheque: ChequeOcasionalItem
  clasificacion?: ChequeClasificado | null
  cadena?: CadenaRenovacion | null
  renovacionDeDetalle?: EslabonDetalleRef[]
  renovadoPorDetalle?: EslabonDetalleRef[]
}

export interface OperacionUsdItem {
  montoUsd: number
  cotizacion: number
}

export interface CostoEslabonItem {
  chequeViejo: string
  chequeNuevo: string
  montoViejoCentavos: number
  montoNuevoCentavos: number
  interesCentavos: number
  fechaEmisionViejo: string | null
  fechaVtoViejo: string | null
  fechaEmisionNuevo: string | null
  fechaVtoNuevo: string | null
  diasEntreEmisiones: number | null
}

export interface CadenaRenovacion {
  id: string
  beneficiario: string
  beneficiarioNormalizado: string
  cheques: string[]
  eslabones: CostoEslabonItem[]
  capitalInicialCentavos: number
  montoFinalCentavos: number
  interesTotalCentavos: number
  tasaImplicita: number
  operacionUsd: OperacionUsdItem | null
  fechaInicio: string | null
  fechaFin: string | null
  diasTotales: number | null
}

export interface ChequeClasificado {
  numeroCheque: string
  clasificacion: 'gasto_real' | 'operacion_financiera'
  rolEnCadena: 'capital' | 'interes' | 'mixto' | null
  cadenaId: string | null
}

export interface OcasionalesCadenasResponse {
  cadenas: CadenaRenovacion[]
  clasificados: ChequeClasificado[]
}

async function ocasionalesFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  return fetch(resolveApiUrl(`/api/finanzas/cheques-ocasionales${path}`), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  })
}

export async function fetchChequesOcasionales(params: {
  filtro?: OcasionalesFiltro
  q?: string
  page?: number
}): Promise<OcasionalesListResponse> {
  const qs = new URLSearchParams()
  if (params.filtro) qs.set('filtro', params.filtro)
  if (params.q) qs.set('q', params.q)
  if (params.page) qs.set('page', String(params.page))
  const s = qs.toString()
  const res = await ocasionalesFetch(s ? `?${s}` : '/')
  const body = (await res.json().catch(() => null)) as { error?: string } | OcasionalesListResponse | null
  if (!res.ok) {
    throw new Error(body && 'error' in body && body.error ? body.error : 'No se pudieron cargar los cheques ocasionales')
  }
  return body as OcasionalesListResponse
}

export async function fetchOcasionalesResumen(): Promise<OcasionalesResumenResponse> {
  const res = await ocasionalesFetch('/resumen')
  const body = (await res.json().catch(() => null)) as { error?: string } | OcasionalesResumenResponse | null
  if (!res.ok) {
    throw new Error(body && 'error' in body && body.error ? body.error : 'No se pudo obtener el resumen')
  }
  return body as OcasionalesResumenResponse
}

export async function fetchOcasionalDetalle(id: string): Promise<OcasionalDetalleResponse> {
  const res = await ocasionalesFetch(`/${encodeURIComponent(id)}`)
  const body = (await res.json().catch(() => null)) as { error?: string } | OcasionalDetalleResponse | null
  if (!res.ok) {
    throw new Error(body && 'error' in body && body.error ? body.error : 'No se pudo obtener el detalle')
  }
  return body as OcasionalDetalleResponse
}

export async function fetchOcasionalesCadenas(): Promise<OcasionalesCadenasResponse> {
  const res = await ocasionalesFetch('/cadenas')
  const body = (await res.json().catch(() => null)) as { error?: string } | OcasionalesCadenasResponse | null
  if (!res.ok) {
    throw new Error(body && 'error' in body && body.error ? body.error : 'No se pudieron cargar las cadenas')
  }
  return body as OcasionalesCadenasResponse
}

export interface ImportarOcasionalesResponse {
  ok: boolean
  mensaje: string
  resumen: {
    filas: number
    parseados: number
    conRenovacion: number
    conUsd: number
    proveedoresFinancieros: number
    fechasImposibles: number
  }
}

export async function importarOcasionalesCsv(file: File): Promise<ImportarOcasionalesResponse> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await ocasionalesFetch('/importar', {
    method: 'POST',
    body: formData,
  })
  const body = (await res.json().catch(() => null)) as { error?: string } | ImportarOcasionalesResponse | null
  if (!res.ok) {
    throw new Error(body && 'error' in body && body.error ? body.error : 'No se pudo importar el CSV')
  }
  return body as ImportarOcasionalesResponse
}

export async function updateChequeEstado(id: string, estado: ChequeEstado): Promise<void> {
  const res = await chequesFetch(`/${id}/estado`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estado }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'No se pudo actualizar el estado')
  }
}
