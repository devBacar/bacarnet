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
  /** En pesos. */
  montoDesde?: string
  montoHasta?: string
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
  obs: string | null
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

export interface FacturaCancelada {
  comprobante: string
  persona: string | null
  totalCentavos: number
  obs: string | null
}

export interface ChequeDetalleResponse {
  cheque: ChequeListItem
  movimiento: ChequeDetalleMovimiento | null
  comprobantes: {
    ingreso: ComprobantePendiente | null
    salida: ComprobantePendiente | null
  }
  facturasIngreso: FacturaCancelada[]
  facturasEgreso: FacturaCancelada[]
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
  if (filters.montoDesde) params.set('montoDesde', filters.montoDesde)
  if (filters.montoHasta) params.set('montoHasta', filters.montoHasta)
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

export type TipoOperacionManual = 'usd' | 'renovacion' | 'rol'
export type RolOperacion = 'capital' | 'interes' | 'mixto'

/** Interés pagado aparte que Finanzas confirmó: a qué renovación corresponde y cómo se calculó. */
export interface InteresDeRenovacion {
  fechaRenovacion: string | null
  obsRenovacion: string
  /** 6 = 6 %. Si `porMes`, es por mes durante `meses`. */
  tasaPorcentaje: number
  porMes: boolean
  meses: number
  baseCentavos: number
  baseDescripcion: string
}

export interface DatosOperacionManual {
  usd?: { montoUsd: number; cotizacion: number }
  chequeIds?: string[]
  rol?: RolOperacion
  /** Solo con rol "interés": a qué operación corresponde cada cheque de interés, por número corto de cheque. */
  interesDePorCheque?: Record<string, InteresDeRenovacion>
}

export interface SugerenciaOperacion {
  tipo: TipoOperacionManual
  datos: DatosOperacionManual
  confirmaciones: number
}

export interface OperacionDeLaBaseInteres {
  fechaEmision: string | null
  obs: string
  cantidadCheques: number
  montoCentavos: number
}

/**
 * Sobre qué cheques del proveedor parece calculado un interés pagado aparte. "mismo_vencimiento": % sobre el
 * capital que vence el mismo día; "mes_vencimiento": % mensual sobre todo lo que vence en `mesBase`.
 */
export interface SugerenciaInteres {
  forma: 'mismo_vencimiento' | 'mes_vencimiento'
  tasaPorcentaje: number
  mesBase: string | null
  chequesPorMes: number | null
  meses: number | null
  baseCentavos: number
  cantidadChequesBase: number
  operaciones: OperacionDeLaBaseInteres[]
  porCheque: Array<{ numeroCheque: string; fechaVencimiento: string; baseCentavos: number; operacion: OperacionDeLaBaseInteres }>
  chequesInteres: string[]
}

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
  rolEnOperacion?: RolOperacion | null
  obsOriginal: string
  revisar: string[]
  esCompraIva?: boolean
  /** Tipo de operación propuesto por lo que Finanzas ya confirmó en cheques con el mismo OBS. */
  sugerencia?: SugerenciaOperacion | null
  /** Interés pagado aparte: sobre qué cheques parece calculado. Solo una sugerencia. */
  interesSugerido?: SugerenciaInteres | null
  interesDe?: InteresDeRenovacion | null
  /** Vino sin destinatario: el beneficiario se tomó del comienzo del OBS. */
  beneficiarioDesdeObs?: boolean
  /** Vino sin destinatario: el beneficiario se heredó de los cheques que renueva. */
  beneficiarioDesdeRenovacion?: boolean
  clasificacionManual?: { tipo: TipoOperacionManual; uid: string; fecha: string } | null
  vientriId: number
  baja: boolean
}

export type OcasionalesFiltro = '' | 'revisar' | 'con_renovacion' | 'con_usd' | 'compra_iva'

export interface OcasionalesListResponse {
  cheques: ChequeOcasionalItem[]
  total: number
  totalCentavos: number
  page: number
  pages: number
}

/** Una operación en dólares partida en uno o más cheques. `beneficiario` es el nombre del catálogo si está cargado. */
export interface OperacionUsdAgrupadaItem {
  beneficiario: string
  beneficiarioNormalizado: string
  /** null: el nombre todavía no está asignado a ningún proveedor del catálogo. */
  proveedorId: string | null
  fechaEmision: string | null
  montoUsd: number
  cotizacion: number
  equivalenteCentavos: number
  cantidadCheques: number
  sumaChequesCentavos: number
  obsComun: string
  cheques: Array<{ numeroCheque: string; montoCentavos: number; fechaVencimiento: string | null; fechaEmision: string | null }>
}

export interface UsdPorProveedorItem {
  beneficiario: string
  proveedorId: string | null
  cantidadOperaciones: number
  cantidadCheques: number
  totalUsd: number
  cotizacionPromedio: number
  equivalenteCentavos: number
  sumaChequesCentavos: number
  operaciones: OperacionUsdAgrupadaItem[]
}

export interface OcasionalesResumenResponse {
  totalCheques: number
  totalMontoCentavos?: number
  pendientesCantidad?: number
  pendientesMontoCentavos?: number
  fechasImposiblesCantidad?: number
  revisarCantidad?: number
  revisarMontoCentavos?: number
  conRenovacion: number
  conUsd: number
  operacionesUsdUnicas?: number
  operacionesUsdAgrupadas?: OperacionUsdAgrupadaItem[]
  /** Las mismas operaciones sumadas por proveedor del catálogo. */
  usdPorProveedor?: UsdPorProveedorItem[]
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
  /** La renovación de la que salió este cheque (es uno de los cheques nuevos). */
  operacionOrigen?: OperacionDelChequeItem | null
  /** La renovación donde este cheque se reemplazó por otros (es uno de los cheques viejos). */
  operacionRenovacion?: OperacionDelChequeItem | null
  renovacionDeDetalle?: EslabonDetalleRef[]
  renovadoPorDetalle?: EslabonDetalleRef[]
  /** Lo que se puede leer del OBS para precargar la clasificación a mano. */
  lecturaObs?: { usd: { montoUsd: number; cotizacion: number } | null; numerosDeCheque: string[] }
  /** Cuántos cheques son la misma operación (mismo beneficiario, emisión y OBS), incluido este. */
  mismaOperacion?: number
  /** Para armar la renovación a mano: los cheques nuevos del grupo y los viejos que nombra el OBS. */
  propuestaRenovacion?: PropuestaRenovacionItem
}

export interface PropuestaRenovacionItem {
  nuevos: Array<{
    numeroCheque: string
    montoCentavos: number
    fechaEmision: string | null
    fechaVencimiento: string | null
    renovacionDe: string[]
  }>
  viejos: Array<{
    /** Número leído del OBS, ya completado ("300" → "39585300"). */
    numeroObs: string
    encontrado: {
      numeroCheque: string
      beneficiario: string
      montoCentavos: number
      fechaVencimiento: string | null
      estado: string
    } | null
    /** Cosas para controlar antes de guardar (no impiden guardar). */
    avisos: string[]
  }>
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

// ── Catálogo de proveedores financieros ──────────────────────────────

export interface ProveedorCatalogoItem {
  id: string
  nombre: string
  alias: string[]
  cantidadCheques: number
  totalCentavos: number
}

export interface BeneficiarioSinAsignarItem {
  nombreNormalizado: string
  nombre: string
  variantes: string[]
  cantidadCheques: number
  totalCentavos: number
  sugerencias: Array<{ proveedorId: string; nombre: string }>
}

export interface CatalogoProveedoresResponse {
  proveedores: ProveedorCatalogoItem[]
  sinAsignar: BeneficiarioSinAsignarItem[]
}

async function leerErrorProveedores(res: Response, porDefecto: string): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  return new Error(body?.error ?? porDefecto)
}

export async function fetchCatalogoProveedores(): Promise<CatalogoProveedoresResponse> {
  const res = await ocasionalesFetch('/proveedores-financieros')
  if (!res.ok) throw await leerErrorProveedores(res, 'No se pudo cargar el catálogo de proveedores')
  return (await res.json()) as CatalogoProveedoresResponse
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export async function crearProveedorCatalogo(nombre: string): Promise<void> {
  const res = await ocasionalesFetch('/proveedores-financieros', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ nombre }),
  })
  if (!res.ok) throw await leerErrorProveedores(res, 'No se pudo agregar el proveedor')
}

export async function agregarAliasProveedor(id: string, alias: string): Promise<void> {
  const res = await ocasionalesFetch(`/proveedores-financieros/${encodeURIComponent(id)}/alias`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ alias }),
  })
  if (!res.ok) throw await leerErrorProveedores(res, 'No se pudo agregar el nombre alternativo')
}

export async function quitarAliasProveedor(id: string, alias: string): Promise<void> {
  const res = await ocasionalesFetch(
    `/proveedores-financieros/${encodeURIComponent(id)}/alias?alias=${encodeURIComponent(alias)}`,
    { method: 'DELETE' },
  )
  if (!res.ok) throw await leerErrorProveedores(res, 'No se pudo sacar el nombre alternativo')
}

/** Cambia el nombre que se muestra; el nombre anterior queda como otra forma de escribirlo. */
export async function renombrarProveedor(id: string, nombre: string): Promise<void> {
  const res = await ocasionalesFetch(`/proveedores-financieros/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ nombre }),
  })
  if (!res.ok) throw await leerErrorProveedores(res, 'No se pudo cambiar el nombre')
}

/** `quedaId` se lleva todos los nombres de `seVaId`, que se da de baja. */
export async function fusionarProveedores(quedaId: string, seVaId: string): Promise<void> {
  const res = await ocasionalesFetch(`/proveedores-financieros/${encodeURIComponent(quedaId)}/fusionar`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ seVaId }),
  })
  if (!res.ok) throw await leerErrorProveedores(res, 'No se pudieron juntar los proveedores')
}

/** Baja lógica: el proveedor deja de aparecer y sus nombres vuelven a "Sin asignar". No se borra. */
export async function darDeBajaProveedor(id: string): Promise<void> {
  const res = await ocasionalesFetch(`/proveedores-financieros/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) throw await leerErrorProveedores(res, 'No se pudo dar de baja el proveedor')
}

/** Re-engancha los cheques ya guardados con la lista actual de proveedores. Recorre toda la base: tarda. */
export async function sincronizarChequesProveedores(): Promise<{ chequesActualizados: number }> {
  const res = await ocasionalesFetch('/proveedores-financieros/sincronizar-cheques', { method: 'POST' })
  if (!res.ok) throw await leerErrorProveedores(res, 'No se pudieron actualizar los cheques')
  return (await res.json()) as { chequesActualizados: number }
}

export async function fetchChequesOcasionales(params: {
  filtro?: OcasionalesFiltro
  q?: string
  montoDesde?: string
  montoHasta?: string
  page?: number
}): Promise<OcasionalesListResponse> {
  const qs = new URLSearchParams()
  if (params.filtro) qs.set('filtro', params.filtro)
  if (params.q) qs.set('q', params.q)
  if (params.montoDesde) qs.set('montoDesde', params.montoDesde)
  if (params.montoHasta) qs.set('montoHasta', params.montoHasta)
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

export interface ClasificarOcasionalResponse {
  tipo: TipoOperacionManual
  datos: DatosOperacionManual
  cheques: number
  confirmaciones: number
  recalculado: boolean
}

/** Marca a mano el tipo de operación; lo confirmado se aprende para proponerlo en cheques con el mismo OBS. */
export async function clasificarOcasional(
  id: string,
  tipo: TipoOperacionManual,
  datos: DatosOperacionManual,
  aplicarAIguales: boolean,
  /** Números de los cheques del grupo elegidos a mano; si viene, se aplica solo a esos (y al abierto). */
  chequesDelGrupo?: string[],
): Promise<ClasificarOcasionalResponse> {
  const res = await ocasionalesFetch(`/${encodeURIComponent(id)}/clasificar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo, datos, aplicarAIguales, chequesDelGrupo }),
  })
  const body = (await res.json().catch(() => null)) as { error?: string } | ClasificarOcasionalResponse | null
  if (!res.ok) {
    throw new Error(body && 'error' in body && body.error ? body.error : 'No se pudo guardar el tipo de operación')
  }
  return body as ClasificarOcasionalResponse
}

export async function fetchOcasionalesCadenas(): Promise<OcasionalesCadenasResponse> {
  const res = await ocasionalesFetch('/cadenas')
  const body = (await res.json().catch(() => null)) as { error?: string } | OcasionalesCadenasResponse | null
  if (!res.ok) {
    throw new Error(body && 'error' in body && body.error ? body.error : 'No se pudieron cargar las cadenas')
  }
  return body as OcasionalesCadenasResponse
}

export interface ChequeEnOperacionItem {
  numeroCheque: string
  montoCentavos: number
  fechaVencimiento: string | null
  fechaEmision: string | null
  rol: 'capital' | 'interes' | 'mixto' | null
  pagado: boolean
  /** A nombre de quién salió el cheque. */
  beneficiario?: string
  beneficiarioNormalizado?: string
}

export interface OperacionRenovacionItem {
  id: string
  beneficiario: string
  beneficiarioNormalizado: string
  fechaEmision: string | null
  banco: string | null
  chequesViejos: ChequeEnOperacionItem[]
  chequesNuevos: ChequeEnOperacionItem[]
  totalViejosCentavos: number
  totalNuevosCentavos: number
  interesCentavos: number
  fechaVtoViejos: string | null
  fechaVtoNuevos: string | null
  diasRenovacion: number | null
  tasaImplicita: number
  tasaMensualEstimada: number | null
  vinculada: boolean
  tipoVinculo: 'explicito' | 'implicito'
  obsOriginal: string
  debugAutolink?: string
}

/** Interés de una renovación que se pagó aparte, en otros cheques, y Finanzas confirmó. */
export interface InteresAparteItem {
  cantidadCheques: number
  totalCentavos: number
  tasaPorcentaje: number
  porMes: boolean
  meses: number
  baseDescripcion: string
  /** Puede faltar si el backend todavía no se actualizó. */
  baseCentavos?: number
  cheques?: ChequeDeInteresAparteItem[]
}

/** Un cheque de interés pagado aparte. */
export interface ChequeDeInteresAparteItem {
  numeroCheque: string
  montoCentavos: number
  fechaEmision: string | null
  fechaVencimiento: string | null
  obs: string
  estado: EstadoChequeRenov
}

export interface OperacionDelChequeItem extends OperacionRenovacionItem {
  interesAparte?: InteresAparteItem | null
}

export interface ResumenOperacionesRenovacion {
  vinculadas: number
  explicitas: number
  implicitas: number
  sinMatch: number
}

export interface OperacionesRenovacionResponse {
  operaciones: OperacionRenovacionItem[]
  resumen?: ResumenOperacionesRenovacion
}

export async function fetchOperacionesRenovacion(): Promise<OperacionesRenovacionResponse> {
  const res = await ocasionalesFetch('/operaciones-renovacion')
  const body = (await res.json().catch(() => null)) as { error?: string } | OperacionesRenovacionResponse | null
  if (!res.ok) {
    throw new Error(body && 'error' in body && body.error ? body.error : 'No se pudieron cargar las operaciones de renovación')
  }
  return body as OperacionesRenovacionResponse
}

export type EstadoChequeRenov = 'pendiente' | 'debitado' | 'renovado' | 'rechazado' | 'anulado'

export interface ChequeConEstadoItem extends ChequeEnOperacionItem {
  estado: EstadoChequeRenov
  operacionSiguienteId: string | null
}

export interface OperacionSeguimientoItem extends Omit<OperacionRenovacionItem, 'chequesNuevos'> {
  chequesNuevos: ChequeConEstadoItem[]
  operacionesAnterioresIds: string[]
  fechaVtoMax: string | null
  exposicionCentavos: number
  /** Se armó a mano desde "A revisar". */
  origenRevisar?: boolean
  estadoOperacion: 'abierta' | 'cerrada'
  ancestrosIds: string[]
  /**
   * Cheques viejos que salieron a nombre de otro proveedor (ej. POVO 20/02/2026 renueva cheques de MANA). Vacío si
   * son todos del mismo; puede faltar si el backend todavía no se actualizó.
   */
  viejosDeOtroBeneficiario?: ViejosDeOtroBeneficiario[]
  /**
   * Interés que la renovación pagó aparte, en otros cheques, y Finanzas confirmó. No está en `interesCentavos`
   * (que es solo nuevos − viejos). Puede faltar si el backend todavía no se actualizó.
   */
  interesAparte?: InteresAparteItem | null
}

export interface ViejosDeOtroBeneficiario {
  beneficiario: string
  cantidadCheques: number
  montoCentavos: number
}

export interface BeneficiarioSeguimientoItem {
  /** Nombre del proveedor en el catálogo, o como está escrito si no está cargado. */
  beneficiario: string
  beneficiarioNormalizado: string
  proveedorId: string | null
  posicionesAbiertas: number
  rechazadas: number
  exposicionCentavos: number
  operaciones: OperacionSeguimientoItem[]
}

export type SeguimientoEstadoFiltro = 'abiertas' | 'todas'

export interface SeguimientoRenovacionesResponse {
  hoy: string
  estado: SeguimientoEstadoFiltro
  beneficiarios: BeneficiarioSeguimientoItem[]
  /** Operaciones anteriores referenciadas por `ancestrosIds` que no están en `beneficiarios`. */
  ancestros: OperacionSeguimientoItem[]
  totales: {
    beneficiarios: number
    operaciones: number
    posicionesAbiertas: number
    exposicionCentavos: number
    vencidosCantidad: number
    vencidosCentavos: number
    porVencer7d: number
    porVencer15d: number
    porVencer30d: number
    profundidadMaxCadena: number
    cadenaMasLargaOp: { id: string; beneficiario: string } | null
    concentracionTopPct: number
  }
}

export async function fetchSeguimientoRenovaciones(
  estado: SeguimientoEstadoFiltro = 'abiertas',
): Promise<SeguimientoRenovacionesResponse> {
  const res = await ocasionalesFetch(`/seguimiento?estado=${estado}`)
  const body = (await res.json().catch(() => null)) as { error?: string } | SeguimientoRenovacionesResponse | null
  if (!res.ok) {
    throw new Error(body && 'error' in body && body.error ? body.error : 'No se pudo cargar el seguimiento de renovaciones')
  }
  return body as SeguimientoRenovacionesResponse
}

export async function recalcularSeguimiento(): Promise<{ ok: boolean; operaciones: number }> {
  const res = await ocasionalesFetch('/seguimiento/recalcular', { method: 'POST' })
  const body = (await res.json().catch(() => null)) as { error?: string; ok?: boolean; operaciones?: number } | null
  if (!res.ok) {
    throw new Error(body && 'error' in body && body.error ? body.error : 'No se pudo recalcular el seguimiento')
  }
  return body as { ok: boolean; operaciones: number }
}

export interface RecalcularTodoResponse {
  ok: boolean
  chequesActualizados: number
  completos: number
  operaciones: number
}

/** Recalcula avisos, completos y seguimiento de los cheques ocasionales ya guardados, sin importar un CSV. */
export async function recalcularTodoOcasionales(): Promise<RecalcularTodoResponse> {
  const res = await ocasionalesFetch('/recalcular-todo', { method: 'POST' })
  const body = (await res.json().catch(() => null)) as { error?: string } | RecalcularTodoResponse | null
  if (!res.ok) {
    throw new Error(body && 'error' in body && body.error ? body.error : 'No se pudo recalcular')
  }
  return body as RecalcularTodoResponse
}

export interface ImportarOcasionalesResponse {
  ok: boolean
  mensaje: string
  resumen: {
    filas: number
    parseados: number
    conRenovacion: number
    conUsd: number
    aRevisar: number
    fechasImposibles: number
  }
  proveedoresSinCargar?: string[]
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

/** Un cheque no se paga: se renueva. Lo saca de Hoy y lo manda a "Pendientes de renovar". */
export async function marcarPendienteDeRenovarCheque(id: string): Promise<void> {
  const res = await chequesFetch(`/${id}/marcar-pendiente-renovar`, { method: 'POST' })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'No se pudo marcar el cheque para renovar')
  }
}

export interface ChequePendienteDeRenovar {
  id: string
  numero: string
  montoCentavos: number
  destinatario: string | null
  emisor: string
  fechaPago: string
}

export async function fetchPendientesDeRenovar(): Promise<ChequePendienteDeRenovar[]> {
  const res = await chequesFetch('/pendientes-de-renovar')
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'No se pudo traer la lista de pendientes de renovar')
  }
  const body = (await res.json()) as { pendientes: ChequePendienteDeRenovar[] }
  return body.pendientes
}

export interface DatosChequeNuevo {
  numero: string
  bancoEmisor: string | null
  fechaPago: string
  montoCentavos: number
  destinatario: string | null
}

export async function confirmarRenovacionCheques(
  chequeViejoIds: string[],
  chequeNuevo: DatosChequeNuevo,
): Promise<void> {
  const res = await chequesFetch('/confirmar-renovacion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chequeViejoIds, chequeNuevo }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'No se pudo confirmar la renovación')
  }
}

// ── Revisión asistida de "A revisar" (contrato con backend: vientri/domain/analisis-revisar.ts) ──

export type FuerzaHipotesis = 'fuerte' | 'posible' | 'debil'
export type TipoHipotesis =
  | 'renovacion_obs'
  | 'interes_renovacion'
  | 'interes_posicion'
  | 'diferencia'
  | 'dolares'
  | 'origen_posible'

export interface ChequeEvidencia {
  numeroCheque: string
  beneficiario: string
  montoCentavos: number
  fechaEmision: string | null
  fechaVencimiento: string | null
  fechaConciliado: string | null
  estado: string
  pagado: boolean
  obs: string
}

/** La cuenta que respalda una hipótesis: base × tasa = esperado, comparado contra el total del grupo. */
export interface CuentaHipotesis {
  baseCentavos: number
  tasaPorcentaje: number | null
  esperadoCentavos: number
  diferenciaCentavos: number
  /** Si la diferencia se explica por redondear cada cheque al peso: cuántos cheques. Null si es más que eso. */
  redondeoCheques?: number | null
}

export interface BaseProbada {
  /** 'YYYY-MM', o null si la base no es un mes. */
  mes: string | null
  /** Qué es la base cuando no es un mes (ej. "la operación del 08/09"). */
  descripcion?: string
  cantidadCheques: number
  baseCentavos: number
  tasaPorcentaje: number
  cierra: boolean
}

export type FormaInteres = 'mes_vencimiento' | 'mismo_vencimiento' | 'renovacion' | 'porcentaje_renovacion' | 'diferencia'

/** Un pago de interés: un cheque suelto o una cuota (los cheques que vencen juntos). */
export interface PagoInteres {
  desde: string | null
  hasta: string | null
  cantidadCheques: number
  montoCentavos: number
}

export interface LoteBase {
  fechaEmision: string | null
  obs: string
  cantidadCheques: number
  montoCentavos: number
  esDolares: boolean
  esRenovacion: boolean
}

export interface RenovacionRelacionada {
  fechaEmision: string
  obs: string
  cantidadViejos: number
  cantidadNuevos: number
  vencianDesde: string | null
  vencianHasta: string | null
  vencenDesde: string | null
  vencenHasta: string | null
  dias: number | null
  meses: number | null
  viejosCentavos: number
  nuevosCentavos: number
  interesAdentroCentavos: number
  mismoDia: boolean
}

/** Una base y los cheques de interés que explica. */
export interface TramoInteres {
  chequesInteres: string[]
  pagadoCentavos: number
  vencimientos: string[]
  baseDescripcion: string
  baseCentavos: number
  cantidadChequesBase: number
  lotes: LoteBase[]
  tipoCuenta: 'tasa' | 'resta'
  nuevosCentavos: number | null
  esperadoCentavos: number
  renovacion: RenovacionRelacionada | null
  alternativas: BaseProbada[]
}

/** El paso a paso de un interés: qué se pagó, sobre qué, la cuenta, por qué tiene sentido y otras bases. */
export interface DetalleInteres {
  forma: FormaInteres
  tasaPorcentaje: number
  porMes: boolean
  periodos: number
  totalPagadoCentavos: number
  pagos: PagoInteres[]
  tramos: TramoInteres[]
  esperadoCentavos: number
  diferenciaCentavos: number
  redondeoCheques: number | null
}

/** Espejo de `backend/.../domain/detalle-dolares.ts`. */
export interface VencimientoDolares {
  fecha: string | null
  dias: number | null
  cantidadCheques: number
  montoCentavos: number
}

export interface ParteDolares {
  fechaEmision: string | null
  obs: string
  cantidadCheques: number
  montoCentavos: number
}

export interface TasaRedondaDolares {
  /** 'interes': cheque = parte × (1 + tasa × días/30). 'descuento': parte = cheque × (1 − tasa × días/30). */
  modo: 'interes' | 'descuento'
  tasaMensualPorcentaje: number
  valorHoyCentavos: number
  diferenciaCentavos: number
  /** 'al_peso': cierra con $1 por cheque. 'a_miles': los cheques salieron por montos redondos. */
  ajuste: 'al_peso' | 'a_miles'
}

export interface OperacionDolaresComparable {
  proveedor: string
  mismoProveedor: boolean
  fechaEmision: string
  obs: string
  montoUsd: number
  cotizacion: number
  capitalCentavos: number
  chequesCentavos: number
  plazoDias: number
  mensualPorcentaje: number
}

export type LecturaDolares = 'justo' | 'tasa_redonda' | 'interes_por_plazo' | 'sin_plazo' | 'faltan_cheques'

/** El paso a paso de una operación en dólares: qué se pidió, cómo se pagó, la cuenta y por qué tiene sentido. */
export interface DetalleDolares {
  montoUsd: number
  cotizacion: number
  capitalCentavos: number
  cantidadCheques: number
  totalChequesCentavos: number
  vencimientos: VencimientoDolares[]
  chequesIguales: { usdPorCheque: number; capitalPorChequeCentavos: number; montoCentavos: number } | null
  partes: ParteDolares[]
  diferenciaCentavos: number
  redondeoCheques: number | null
  recargoPorcentaje: number
  cotizacionEfectiva: number
  plazoPromedioDias: number | null
  mensualPorcentaje: number | null
  tasaRedonda: TasaRedondaDolares | null
  comparables: OperacionDolaresComparable[]
  rangoProveedor: { min: number; max: number } | null
  lectura: LecturaDolares
}

export interface HipotesisRevisar {
  tipo: TipoHipotesis
  fuerza: FuerzaHipotesis
  titulo: string
  explicacion: string
  cuenta: CuentaHipotesis | null
  cheques: ChequeEvidencia[]
  chequesTotal: number
  avisos: string[]
  /** Aclaración que no es una alerta. */
  nota?: string | null
  /** Solo intereses en cuotas: el detalle paso a paso. */
  detalleInteres?: DetalleInteres | null
  /** Solo dólares: el paso a paso (qué se pidió, cómo se pagó, la cuenta, por qué tiene sentido). */
  detalleDolares?: DetalleDolares | null
  /** Lo que se guarda al confirmar (mismo pedido que la clasificación a mano). Null si no hay nada para guardar. */
  confirmar: { tipo: TipoOperacionManual; datos: DatosOperacionManual; etiqueta: string; efecto: string } | null
}

export interface RenovacionDelDia {
  obs: string
  vinculada: boolean
  viejos: ChequeEvidencia[]
  nuevos: ChequeEvidencia[]
  totalViejosCentavos: number
  totalNuevosCentavos: number
  interesCentavos: number
  tasaPorcentaje: number | null
  grupoSobreViejosPorcentaje: number | null
  grupoSobreNuevosPorcentaje: number | null
  /** Días que se corrieron los vencimientos. */
  diasRenovacion?: number | null
}

export interface GrupoARevisar {
  /** Id del primer cheque del grupo, para abrir su detalle. */
  id: string
  beneficiario: string
  proveedor: string
  proveedorCargado: boolean
  fechaEmision: string | null
  obs: string
  cantidadCheques: number
  totalCentavos: number
  motivos: string[]
  cheques: (ChequeEvidencia & { id: string; aRevisar: boolean })[]
  /** Renovaciones del proveedor emitidas el mismo día (a la que pertenece un interés o diferencia de ese día). */
  renovacionesDelDia: RenovacionDelDia[]
  mismoDia: { obs: string; cantidadCheques: number; totalCentavos: number }[]
  hipotesis: HipotesisRevisar[]
}

export interface RevisarAsistidoResponse {
  grupos: GrupoARevisar[]
  totales: { grupos: number; cheques: number; conSugerenciaFuerte: number; sinSugerencia: number }
}

export async function fetchRevisarAsistido(): Promise<RevisarAsistidoResponse> {
  const res = await ocasionalesFetch('/revisar-asistido')
  const body = (await res.json().catch(() => null)) as { error?: string } | RevisarAsistidoResponse | null
  if (!res.ok) throw new Error(body && 'error' in body && body.error ? body.error : 'No se pudo armar la revisión')
  return body as RevisarAsistidoResponse
}
