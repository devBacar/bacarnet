import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

/**
 * Inversiones (/api/finanzas/inversiones). Personas que le prestan plata a BACAR.
 * Montos en centavos. Fechas 'YYYY-MM-DD'. Tasas en porcentaje (45 = 45 %).
 * Los tipos espejan backend/src/modules/finanzas/inversiones/domain/inversion.types.ts.
 */

export type MonedaInversion = 'ARS' | 'USD'
/** 365 · 360 (meses de 30 días) · '360_reales' (días del calendario / 360) · 'reales' (/365 o 366). */
export type BaseDias = 365 | 360 | '360_reales' | 'reales'
export type SistemaDevolucion = 'al_vencimiento' | 'americano' | 'frances' | 'aleman' | 'capitaliza' | 'a_medida'
export type Periodicidad = 'mensual' | 'bimestral' | 'trimestral' | 'cuatrimestral' | 'semestral' | 'anual'
export type ReferenciaTasa = 'plazo_fijo_30' | 'badlar' | 'tamar' | 'adelantos_empresas' | 'prestamos_empresas'
export type IndiceAjuste = 'uva' | 'cer'
export type Tasa =
  /** expresada 'mensual': Finanzas la cargó por mes (1,5 % mensual → tnaPct 18). */
  | { tipo: 'fija'; tnaPct: number; expresada?: 'anual' | 'mensual' }
  | { tipo: 'variable'; referencia: ReferenciaTasa; spreadPct: number; pisoPct?: number | null; techoPct?: number | null }
  | { tipo: 'ajustable'; indice: IndiceAjuste; tnaPct: number }
export type MedioIngreso = 'transferencia' | 'efectivo' | 'cheque'
export type MedioDevolucion = 'transferencia_ars' | 'transferencia_usd' | 'efectivo' | 'cheque'
export type FuenteTipoCambio = 'pactado' | 'bna_vendedor' | 'mep'
export interface TipoCambioPactado {
  /** Pesos por dólar en centavos (1.050,25 → 105025). */
  centavosPorUsd: number
  fuente: FuenteTipoCambio
  fecha: string
}
export type EstadoInversion =
  | 'borrador'
  | 'pendiente_aprobacion'
  | 'vigente'
  | 'cancelada'
  | 'precancelada'
  | 'renovada'
  | 'anulada'
export type TipoCuota = 'normal' | 'precancelacion' | 'devolucion_parcial'
export type EstadoCuota = 'pendiente' | 'parcial' | 'pagada' | 'atrasada' | 'anulada' | 'renovada'
/** topeIntereses: la penalidad no puede superar los intereses. */
export type Penalidad =
  | { tipo: 'ninguna' }
  | { tipo: 'porcentaje_interes'; valorPct: number; topeIntereses?: boolean }
  | { tipo: 'porcentaje_capital'; valorPct: number; topeIntereses?: boolean }
  | { tipo: 'monto_fijo'; montoCentavos: number; topeIntereses?: boolean }
export type TipoOperacion = 'precancelacion' | 'devolucion_parcial' | 'renovacion'
export type ModalidadRenovacion = 'capital_e_intereses' | 'solo_capital' | 'monto'

export interface Cuota {
  numero: number
  tipo: TipoCuota
  fechaVencimiento: string
  diasPeriodo: number
  tasaAplicadaPct: number
  capitalCentavos: number
  interesCentavos: number
  ajusteCentavos: number
  penalidadCentavos: number
  totalCentavos: number
  saldoCapitalCentavos: number
  estimada: boolean
  anulada?: boolean
  renovadaCentavos?: number
  enPesos?: TipoCambioPactado | null
  indiceValor?: number | null
}

/** Cuota con su situación en la Agenda (solo en inversiones aprobadas). */
export interface CuotaDetalle extends Cuota {
  estado: EstadoCuota
  /** Id del compromiso en la Agenda: con este id se paga (Hoy / Agenda). null si todavía no está en la Agenda. */
  compromisoId: string | null
  /** Lo que hay que pagar en la moneda del compromiso (si la cuota en USD se paga en pesos, en pesos). */
  aPagarCentavos: number
  monedaPago: MonedaInversion
  pagadoCentavos: number
  restanteCentavos: number
  /** Texto de cómo se pagó (si ya tiene pagos). */
  comoSePago: string | null
  /** Retención de Ganancias (RG 830) de la cuota; aPagarCentavos ya la descuenta. */
  retencionCentavos: number
}

export interface TotalesCronograma {
  capitalCentavos: number
  interesCentavos: number
  ajusteCentavos: number
  penalidadCentavos: number
  totalCentavos: number
}

/** Lo que se carga en el formulario de alta o edición. */
export interface CondicionesInput {
  moneda: MonedaInversion
  capitalCentavos: number
  fechaAlta: string
  sistema: SistemaDevolucion
  periodicidad: Periodicidad
  cantidadCuotas: number
  fechaVencimiento: string | null
  /** Sin fecha de devolución: solo con sistema 'americano' (cobra intereses) o 'capitaliza'. */
  sinVencimiento?: boolean
  /** Inversión en curso: cuotas ya pagadas antes de cargarla (para mostrar "cuota 42 de 67"). */
  cuotasPrevias?: number
  tasa: Tasa
  /** null = la de la configuración. */
  baseDias: BaseDias | null
  cuotasAMedida?: Array<{ fecha: string; capitalCentavos: number; interesCentavos?: number | null }> | null
  devolucionEnPesos?: TipoCambioPactado | null
  medioIngresoPrevisto: MedioIngreso
  mediosDevolucion: MedioDevolucion[]
  /** null = la de la configuración. */
  penalidadPrecancelacion: Penalidad | null
}

export interface InversionInput extends CondicionesInput {
  inversorId: string
  observaciones: string | null
}

export interface ChequeRecibido {
  tipo: 'echeq' | 'fisico'
  numero: string
  bancoEmisor: string | null
  fechaPago: string
  emisor: string
  emisorCuit: string | null
}

export interface DocumentoInversion {
  id: string
  tipo: 'mutuo' | 'pagare' | 'otro'
  nombre: string
  storagePath: string
  bytes: number
  subidoPor: string
  subidoPorNombre: string | null
  subidoAt: string
  /** Baja lógica: no se borra el archivo. */
  quitado?: boolean
}

export interface IngresoRegistrado {
  id: string
  medio: MedioIngreso
  fecha: string
  montoCentavos: number
  cuentaId: string | null
  cajaId: string | null
  chequeId: string | null
  movimientoId: string | null
  /** Efectivo: movimiento de la caja donde entró. */
  cajaMovimientoId?: string | null
  /** Cheque: datos del cheque recibido (el alta en la cartera de Cheques se conecta más adelante). */
  cheque?: ChequeRecibido | null
  nota: string | null
  registradoPor: string
  registradoPorNombre?: string | null
  registradoAt: string
  importado?: boolean
}

export interface Aprobacion {
  solicitadaPor: string
  solicitadaPorNombre?: string | null
  solicitadaAt: string
  resueltaPor: string | null
  resueltaPorNombre?: string | null
  resueltaAt: string | null
  resultado: 'aprobada' | 'rechazada' | null
  nota: string | null
}

export interface OperacionPendiente {
  id: string
  tipo: TipoOperacion
  fecha: string
  solicitadaPor: string
  solicitadaPorNombre?: string | null
  solicitadaAt: string
  nota: string | null
  penalidad?: Penalidad
  montoCentavos?: number | null
  modalidad?: ModalidadRenovacion
  inversionNuevaId?: string | null
  cronogramaPropuesto: Cuota[]
  resumen: string
}

export interface Alertas {
  porVencer: boolean
  diasParaVencer: number | null
  cuotasAtrasadas: number
  proximaCuota: { numero: number; fecha: string; montoCentavos: number } | null
  fechaFinal: string | null
}

export interface InversionResumen {
  id: string
  numero: string
  inversorId: string
  inversorNombre: string
  estado: EstadoInversion
  moneda: MonedaInversion
  capitalCentavos: number
  fechaAlta: string
  fechaFinal: string | null
  sistema: SistemaDevolucion
  tasa: Tasa
  /** Lo que falta devolver (capital + intereses de las cuotas abiertas). */
  pendienteCentavos: number
  /** Lo que se le debe hoy: capital que falta devolver + intereses capitalizados (la columna "Deuda" de la planilla). */
  deudaHoyCentavos: number
  /** Capital que todavía no entró. */
  ingresoPendienteCentavos: number
  alertas: Alertas
  operacionPendiente: { tipo: TipoOperacion; fecha: string } | null
  importada: boolean
}

export interface KpisInversiones {
  /** Capital de las inversiones vigentes, por moneda. */
  capitalVigente: Record<MonedaInversion, number>
  /** Lo que falta pagar (cuotas abiertas), por moneda. */
  aDevolver: Record<MonedaInversion, number>
  /** Cuotas que vencen en los próximos 30 días. */
  proximos30: { cantidad: number; porMoneda: Record<MonedaInversion, number> }
  cuotasAtrasadas: number
  paraAprobar: number
  porVencer: number
}

export interface HistorialItem {
  estadoAnterior: string | null
  estadoNuevo: string
  fecha: string
  usuario: string
  usuarioNombre?: string | null
  nota: string | null
}

export interface InversionDetalle {
  id: string
  numero: string
  inversorId: string
  inversorNombre: string
  estado: EstadoInversion
  condiciones: CondicionesInput & { baseDias: BaseDias; penalidadPrecancelacion: Penalidad }
  cronograma: CuotaDetalle[]
  totales: TotalesCronograma
  ingresos: IngresoRegistrado[]
  /** Capital que tiene que entrar (descontado lo que viene de una renovación) y cuánto ya entró. */
  ingresoEsperadoCentavos: number
  ingresadoCentavos: number
  aprobacion: Aprobacion | null
  operacionPendiente: OperacionPendiente | null
  renovacionDe: { inversionId: string; numero: string; capitalCentavos: number } | null
  renovadaEn: { inversionId: string; numero: string } | null
  alertas: Alertas
  deudaHoyCentavos: number
  /** Conflictos con la Agenda que hay que revisar a mano. */
  avisosAgenda: string[]
  indiceAlta: number | null
  observaciones: string | null
  importada: boolean
  /** Importadas de la planilla: primer mes en que aparece y pagos mes a mes ("pagos según planilla"). */
  inicioPlanilla?: string | null
  historialPlanilla?: Array<{ mes: string; fecha: string; montoCentavos: number }>
  /** Sin storagePath: para verlo se pide el enlace a /:id/documentos/:docId. */
  documentos: Array<Omit<DocumentoInversion, 'storagePath'>>
  historial: HistorialItem[]
  createdAt: string | null
  createdBy: string
  permisos: {
    editar: boolean
    enviar: boolean
    aprobar: boolean
    registrarIngreso: boolean
    operar: boolean
    anular: boolean
  }
}

export interface SimulacionResponse {
  cronograma: Cuota[]
  totales: TotalesCronograma
  /** Ej.: "Las cuotas 3 a 12 usan la última BADLAR conocida: el monto puede cambiar". */
  avisos: string[]
  baseDias: BaseDias
  indiceAlta: number | null
}

export type TipoPersona = 'humana' | 'juridica'

export interface InversorDatos {
  nombre: string
  tipoPersona: TipoPersona | null
  cuit: string | null
  dni: string | null
  email: string | null
  telefono: string | null
  domicilio: string | null
  cbuArs: string | null
  cuentaUsd: string | null
  /** Para la retención de Ganancias (RG 830). null = no se sabe (se usa la alícuota de no inscripto). */
  inscriptoGanancias?: boolean | null
  observaciones: string | null
}

export interface InversorResumen {
  id: string
  nombre: string
  tipoPersona: TipoPersona | null
  /** Solo los últimos 4 números: "…4567". */
  documentoMascara: string | null
  estado: 'activo' | 'inactivo'
  inversionesVigentes: number
  capitalVigente: Record<MonedaInversion, number>
}

export interface InversorFicha extends InversorDatos {
  id: string
  estado: 'activo' | 'inactivo'
  inversiones: InversionResumen[]
  createdAt: string | null
  updatedAt: string | null
}

/**
 * Retención de Ganancias sobre los intereses que se le pagan al inversor (RG 830).
 * Finanzas decide si la aplica y carga las alícuotas; Bacarnet no trae valores propios.
 */
export interface RetencionGanancias {
  activa: boolean
  /** % para inversores inscriptos en Ganancias. */
  alicuotaInscriptoPct: number | null
  /** % para inversores no inscriptos. */
  alicuotaNoInscriptoPct: number | null
  /** Por debajo de este interés mensual no se retiene. */
  minimoNoSujetoCentavos: number | null
}

export interface ConfigInversiones {
  baseDiasDefault: BaseDias
  /** Meses hacia adelante que se generan las cuotas de intereses de las inversiones sin vencimiento. */
  horizonteMesesSinVencimiento: number
  penalidadDefault: Penalidad
  diasAvisoPorVencer: number
  retencionGanancias: RetencionGanancias
}

export interface ValorTasa {
  clave: ReferenciaTasa | IndiceAjuste
  nombre: string
  /** Tasas: TNA en %. Índices: valor del índice. */
  valor: number | null
  fecha: string | null
  /** Id de la serie en la API del BCRA. */
  idVariable: number | null
}

export interface TasasResponse {
  referencias: ValorTasa[]
  indices: ValorTasa[]
  actualizadoAt: string | null
  /** Banda sugerida para la tasa que paga BACAR: piso = plazo fijo 30 días, techo = financiamiento alternativo. */
  banda: { pisoPct: number | null; techoPct: number | null; texto: string }
  error: string | null
}

export interface IngresoInput {
  /** Clave única de esta carga (la genera el formulario una vez): si se manda dos veces, no se registra dos veces. */
  clave: string
  medio: MedioIngreso
  fecha: string
  montoCentavos: number
  /** Transferencia: cuenta del banco. */
  cuentaId?: string | null
  /** Transferencia: movimiento del banco que la confirma (opcional). */
  movimientoId?: string | null
  /** Efectivo: caja principal donde entra. */
  cajaId?: string | null
  /** Cheque: se agrega a la cartera de Cheques. */
  cheque?: ChequeRecibido | null
  nota?: string | null
}

import type { CuentaInversor } from '../components/finanzas/inversiones/cuentaInversor'

export type MovimientoCuenta = {
  /** Del ingreso: la fecha en que entró. De la cuota: su vencimiento (la Agenda no guarda el día del pago). */
  fecha: string
  tipo: 'ingreso_capital' | 'cuota_pagada' | 'cuota_parcial'
  inversionId: string
  inversionNumero: string
  inversorNombre: string
  moneda: MonedaInversion
  montoCentavos: number
  retencionCentavos: number
  detalle: string
}

export type CapitalSinIngresar = {
  id: string
  numero: string
  inversorNombre: string
  moneda: MonedaInversion
  faltaCentavos: number
}

export type DocumentoDeCuenta = Omit<DocumentoInversion, 'storagePath'> & {
  inversionId: string
  inversionNumero: string
}

export interface CuentaCompleta extends CuentaInversor {
  hoy: string
  capitalSinIngresar: CapitalSinIngresar[]
  movimientos: MovimientoCuenta[]
  documentos: DocumentoDeCuenta[]
}

export interface OperacionInput {
  tipo: TipoOperacion
  /** Precancelación y devolución parcial: el día que se devuelve. En renovación se ignora (es el vencimiento). */
  fecha: string
  montoCentavos?: number | null
  penalidad?: Penalidad | null
  modalidad?: ModalidadRenovacion
  /** Renovación: condiciones de la inversión nueva (capital = lo renovado + plata nueva, si hay). */
  nuevaInversion?: CondicionesInput | null
  nota?: string | null
}

/**
 * Importación de las inversiones en curso desde la planilla de compromisos de Finanzas
 * (hojas "Compromisos MM.AAAA", grupos "INVERSORES DOLARES" e "INVERSORES PESOS").
 * Cada fila se propone como una inversión en curso que queda "Para aprobar":
 * - "Cobra X%" → paga intereses del X % mensual, sin vencimiento (sistema 'americano').
 * - "Capitaliza X%" → el X % mensual se suma a la deuda, sin vencimiento (sistema 'capitaliza').
 * - "k de N" sin % → cuotas fijas: lo que falta de la deuda en N − k cuotas iguales (francés con tasa 0).
 * - Si no se puede deducir: a medida, con aviso para revisarla.
 * Capital = la columna Deuda. Las cuotas arrancan el mes siguiente al de la hoja (el mes de la hoja ya está en Compromisos del mes).
 * Capital de una cadena que ya venía en meses anteriores: ingreso importado (sin caja).
 * Capital realmente nuevo (primer mes, inversor sin importadas): al sincronizar suma a la Caja principal.
 */
export interface ImportarFila {
  fila: number
  ok: boolean
  errores: string[]
  avisos: string[]
  inversorNombre: string
  inversorExistenteId: string | null
  /** Lo que decía la planilla, tal cual. */
  observacionPlanilla: string | null
  cuotaPlanilla: string | null
  importeMesCentavos: number | null
  moneda: MonedaInversion | null
  capitalCentavos: number | null
  fechaAlta: string | null
  sistema: SistemaDevolucion | null
  sinVencimiento: boolean
  tasaMensualPct: number | null
  cantidadCuotas: number | null
  cuotasPagadas: number
  /** Texto en palabras de cómo se va a cargar. Ej.: "Paga 1,5 % por mes sobre US$ 81.778,63, sin fecha de devolución". */
  interpretacion: string
  totales: TotalesCronograma | null
  /** El usuario la puede destildar en la vista previa. */
  incluir: boolean
  /** Historial encontrado en las hojas anteriores. */
  desdeMes: string | null
  mesesEncontrados: number
  pagosEncontrados: number
  /** Ya se importó antes (re-importar no la duplica). */
  yaImportada: boolean
}

export interface ImportarVistaPrevia {
  /** Se manda a /importar/confirmar para crear exactamente lo que se vio. Vence en 30 minutos. */
  token: string
  filas: ImportarFila[]
  /** Problemas al leer alguna hoja. */
  avisos: string[]
  resumen: { total: number; ok: number; conErrores: number; inversoresNuevos: number }
}

export interface SemanaCruce {
  desde: string
  hasta: string
  ingresos: { vientri: number; inversiones: number; otros: number }
  egresos: { vientri: number; inversiones: number; otros: number }
  neto: number
  saldoProyectado: number
}

export interface CruceMoneda {
  moneda: MonedaInversion
  /** Saldo de hoy en los bancos (Interbanking) en esa moneda. */
  saldoBancos: number
  saldoFecha: string | null
  /** Atrasado (antes de hoy) que todavía no se pagó / cobró. */
  atrasado: { ingresos: number; egresos: number }
  semanas: SemanaCruce[]
  /** Primera semana en la que el saldo proyectado queda negativo. */
  primeraSemanaNegativa: string | null
}

export interface CruceResponse {
  monedas: CruceMoneda[]
  generadoAt: string
}

async function invFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  const headers = new Headers(init?.headers)
  if (!(init?.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(resolveApiUrl(`/api/finanzas/inversiones${path}`), { ...init, headers })
}

async function leer<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? fallback)
  }
  return res.json() as Promise<T>
}

function post(path: string, body?: unknown, method = 'POST') {
  return invFetch(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })
}

// ── Inversiones ──────────────────────────────────────────────

export async function fetchInversiones(): Promise<{ inversiones: InversionResumen[]; kpis: KpisInversiones }> {
  return leer(await invFetch('/'), 'No pude traer las inversiones')
}

export async function fetchInversion(id: string): Promise<InversionDetalle> {
  return leer(await invFetch(`/${encodeURIComponent(id)}`), 'No pude traer la inversión')
}

export async function simularInversion(input: CondicionesInput): Promise<SimulacionResponse> {
  return leer(await post('/simular', input), 'No pude calcular las cuotas')
}

export async function crearInversion(input: InversionInput): Promise<InversionDetalle> {
  return leer(await post('/', input), 'No pude guardar la inversión')
}

export async function editarInversion(id: string, input: InversionInput): Promise<InversionDetalle> {
  return leer(await post(`/${encodeURIComponent(id)}`, input, 'PATCH'), 'No pude guardar los cambios')
}

export async function enviarAAprobacion(id: string, nota: string | null): Promise<InversionDetalle> {
  return leer(await post(`/${encodeURIComponent(id)}/enviar`, { nota }), 'No pude enviarla a aprobación')
}

export type AprobarInversionInput = {
  nota?: string | null
  /** Mismo formato que registrarIngreso. Si falla la caja después de aprobar, la respuesta trae ingresoError. */
  ingreso?: IngresoInput | null
}

export type AprobarInversionResultado = InversionDetalle & { ingresoError?: string }

export async function aprobarInversion(
  id: string,
  input: AprobarInversionInput | string | null = null,
): Promise<AprobarInversionResultado> {
  const body =
    typeof input === 'string' || input == null
      ? { nota: input }
      : { nota: input.nota ?? null, ingreso: input.ingreso ?? undefined }
  return leer(await post(`/${encodeURIComponent(id)}/aprobar`, body), 'No pude aprobarla')
}

export async function rechazarInversion(id: string, motivo: string): Promise<InversionDetalle> {
  return leer(await post(`/${encodeURIComponent(id)}/rechazar`, { motivo }), 'No pude rechazarla')
}

export async function anularInversion(id: string, motivo: string): Promise<InversionDetalle> {
  return leer(await post(`/${encodeURIComponent(id)}/anular`, { motivo }), 'No pude anularla')
}

export async function registrarIngreso(id: string, input: IngresoInput): Promise<InversionDetalle> {
  return leer(await post(`/${encodeURIComponent(id)}/ingresos`, input), 'No pude registrar el ingreso')
}

/** Cuota en USD que se paga en pesos. tipoCambio null = vuelve a pagarse en dólares. */
export async function cuotaEnPesos(id: string, numero: number, tipoCambio: TipoCambioPactado | null): Promise<InversionDetalle> {
  return leer(await post(`/${encodeURIComponent(id)}/cuotas/${numero}/en-pesos`, { tipoCambio }), 'No pude cambiar la moneda de la cuota')
}

export async function simularOperacion(id: string, input: OperacionInput): Promise<{ cronogramaPropuesto: Cuota[]; resumen: string; totales: TotalesCronograma; capitalRenovadoCentavos: number | null; nueva: SimulacionResponse | null }> {
  return leer(await post(`/${encodeURIComponent(id)}/operaciones/simular`, input), 'No pude calcular la operación')
}

export async function solicitarOperacion(id: string, input: OperacionInput): Promise<InversionDetalle> {
  return leer(await post(`/${encodeURIComponent(id)}/operaciones`, input), 'No pude pedir la operación')
}

export async function aprobarOperacion(id: string, nota: string | null): Promise<InversionDetalle> {
  return leer(await post(`/${encodeURIComponent(id)}/operaciones/aprobar`, { nota }), 'No pude aprobar la operación')
}

export async function rechazarOperacion(id: string, motivo: string): Promise<InversionDetalle> {
  return leer(await post(`/${encodeURIComponent(id)}/operaciones/rechazar`, { motivo }), 'No pude rechazar la operación')
}

export async function sincronizarAgendaInversion(id: string): Promise<InversionDetalle> {
  return leer(await post(`/${encodeURIComponent(id)}/sincronizar-agenda`), 'No pude actualizar la Agenda')
}

// ── Documentos ───────────────────────────────────────────────

/** Sube un PDF (mutuo / pagaré / otro). Campo archivo + tipo, como la vista previa de importación. */
export async function subirDocumentoInversion(
  id: string,
  archivo: File,
  tipo: DocumentoInversion['tipo'],
): Promise<InversionDetalle> {
  const form = new FormData()
  form.append('archivo', archivo)
  form.append('tipo', tipo)
  return leer(
    await invFetch(`/${encodeURIComponent(id)}/documentos`, { method: 'POST', body: form }),
    'No pude adjuntar el documento',
  )
}

/** Enlace temporal para abrir el PDF en una pestaña nueva. */
export async function enlaceDocumentoInversion(id: string, docId: string): Promise<{ url: string }> {
  return leer(
    await invFetch(`/${encodeURIComponent(id)}/documentos/${encodeURIComponent(docId)}`),
    'No pude abrir el documento',
  )
}

export async function quitarDocumentoInversion(id: string, docId: string): Promise<InversionDetalle> {
  return leer(
    await post(`/${encodeURIComponent(id)}/documentos/${encodeURIComponent(docId)}/quitar`),
    'No pude quitar el documento',
  )
}

// ── Inversores ───────────────────────────────────────────────

export async function fetchInversores(): Promise<InversorResumen[]> {
  const data = await leer<{ inversores: InversorResumen[] }>(await invFetch('/inversores'), 'No pude traer los inversores')
  return data.inversores
}

export async function fetchInversor(id: string): Promise<InversorFicha> {
  return leer(await invFetch(`/inversores/${encodeURIComponent(id)}`), 'No pude traer la ficha')
}

export async function crearInversor(datos: InversorDatos): Promise<InversorFicha> {
  return leer(await post('/inversores', datos), 'No pude guardar el inversor')
}

export async function editarInversor(id: string, datos: InversorDatos): Promise<InversorFicha> {
  return leer(await post(`/inversores/${encodeURIComponent(id)}`, datos, 'PATCH'), 'No pude guardar los cambios')
}

export async function cambiarEstadoInversor(id: string, estado: 'activo' | 'inactivo'): Promise<InversorFicha> {
  return leer(await post(`/inversores/${encodeURIComponent(id)}/estado`, { estado }), 'No pude cambiar el estado')
}

// ── Configuración y tasas ────────────────────────────────────

export async function fetchConfigInversiones(): Promise<ConfigInversiones> {
  return leer(await invFetch('/config'), 'No pude traer la configuración')
}

export async function guardarConfigInversiones(config: ConfigInversiones): Promise<ConfigInversiones> {
  return leer(await post('/config', config, 'PUT'), 'No pude guardar la configuración')
}

export async function fetchTasas(): Promise<TasasResponse> {
  return leer(await invFetch('/tasas'), 'No pude traer las tasas')
}

export async function actualizarTasas(): Promise<TasasResponse> {
  return leer(await post('/tasas/actualizar'), 'No pude actualizar las tasas del BCRA')
}

// ── Importación ──────────────────────────────────────────────

export async function descargarPlantillaImportacion(): Promise<Blob> {
  const res = await invFetch('/importar/plantilla')
  if (!res.ok) throw new Error('No pude descargar la plantilla')
  return res.blob()
}

/** hoja: nombre de la hoja (por defecto, la del mes más reciente). */
export async function vistaPreviaImportacion(archivo: File, hoja?: string | null): Promise<ImportarVistaPrevia & { hojas: string[]; hoja: string }> {
  const form = new FormData()
  form.append('archivo', archivo)
  if (hoja) form.append('hoja', hoja)
  return leer(await invFetch('/importar/vista-previa', { method: 'POST', body: form }), 'No pude leer la planilla')
}

/** filas: números de fila a importar (las que quedaron tildadas). */
export async function confirmarImportacion(token: string, filas: number[]): Promise<{ creadas: number; inversoresNuevos: number; mensaje: string }> {
  return leer(await post('/importar/confirmar', { token, filas }), 'No pude importar la planilla')
}

export interface SincronizarPlanillaResultado {
  creadas: number
  inversoresNuevos: number
  aprobadas: number
  erroresAprobacion: string[]
  avisos: string[]
  mensaje: string
}

/** Trae la planilla de Inversores en vivo desde Google Sheets y carga/aprueba sola lo nuevo. */
export async function sincronizarPlanillaInversores(): Promise<SincronizarPlanillaResultado> {
  return leer(await post('/importar/sincronizar', {}), 'No pude sincronizar la planilla')
}

// ── Cruce ────────────────────────────────────────────────────

export async function fetchCruce(semanas = 12): Promise<CruceResponse> {
  return leer(await invFetch(`/cruce?semanas=${semanas}`), 'No pude armar el cruce')
}

// ── Cuenta ───────────────────────────────────────────────────

export async function fetchCuentaGeneral(): Promise<CuentaCompleta> {
  return leer(await invFetch('/cuenta'), 'No pude traer la cuenta general')
}

export async function fetchCuentaInversor(id: string): Promise<CuentaCompleta> {
  return leer(await invFetch(`/inversores/${encodeURIComponent(id)}/cuenta`), 'No pude traer la cuenta del inversor')
}

export { type KpisMoneda, type EstadoCuotaCalendario, type MesCalendario, type MonedaCuenta } from '../components/finanzas/inversiones/cuentaInversor'
