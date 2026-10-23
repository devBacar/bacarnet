/**
 * Inversiones: personas que le prestan plata a BACAR.
 * BACAR recibe el capital (un ingreso) y devuelve capital + intereses en cuotas (egresos).
 *
 * Fechas de negocio: 'YYYY-MM-DD' (día argentino). Montos: centavos enteros.
 * Las tasas se guardan en porcentaje (TNA 45 = 45 %).
 */

export type MonedaInversion = 'ARS' | 'USD'

/**
 * Cómo se cuentan los días del interés. Lo elige Finanzas (valor por defecto en la configuración y por inversión).
 * - 365: días del calendario / 365.
 * - 360: meses de 30 días / 360 (con 12 % anual, cada mes paga justo 1 %).
 * - '360_reales': días del calendario / 360.
 * - 'reales': días del calendario / 365 o 366 si el año es bisiesto.
 */
export type BaseDias = 365 | 360 | '360_reales' | 'reales'

/**
 * - al_vencimiento: todo junto al final.
 * - americano: se pagan los intereses cada período ("cobra X %") y el capital al final (o nunca, si no tiene vencimiento).
 * - frances: cuota pareja. Con tasa 0 son cuotas fijas iguales (los "acuerdos" de la planilla).
 * - aleman: capital igual en cada cuota.
 * - capitaliza: los intereses no se pagan, se suman a la deuda; se devuelve todo al final.
 * - a_medida: fecha y capital de cada cuota cargados a mano o importados.
 */
export type SistemaDevolucion = 'al_vencimiento' | 'americano' | 'frances' | 'aleman' | 'capitaliza' | 'a_medida'

export type Periodicidad = 'mensual' | 'bimestral' | 'trimestral' | 'cuatrimestral' | 'semestral' | 'anual'

export const MESES_POR_PERIODO: Record<Periodicidad, number> = {
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
  cuatrimestral: 4,
  semestral: 6,
  anual: 12,
}

/** Referencias que se leen de la API del BCRA. */
export type ReferenciaTasa =
  | 'plazo_fijo_30'
  | 'badlar'
  | 'tamar'
  | 'adelantos_empresas'
  | 'prestamos_empresas'

export type IndiceAjuste = 'uva' | 'cer'

export type Tasa =
  /** expresada: cómo la cargó Finanzas. 'mensual' = tnaPct / 12 por mes (1,5 % mensual → tnaPct 18). */
  | { tipo: 'fija'; tnaPct: number; expresada?: 'anual' | 'mensual' }
  | { tipo: 'variable'; referencia: ReferenciaTasa; spreadPct: number; pisoPct?: number | null; techoPct?: number | null }
  | { tipo: 'ajustable'; indice: IndiceAjuste; tnaPct: number }

export type MedioIngreso = 'transferencia' | 'efectivo' | 'cheque'

export type MedioDevolucion = 'transferencia_ars' | 'transferencia_usd' | 'efectivo' | 'cheque'

export type FuenteTipoCambio = 'pactado' | 'bna_vendedor' | 'mep'

export interface TipoCambioPactado {
  /** Pesos por dólar, con dos decimales, guardado en centavos (1.050,25 → 105025). */
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

/** Estado de una cuota visto desde la Agenda (lo calcula el servicio a partir del compromiso). */
export type EstadoCuota = 'pendiente' | 'parcial' | 'pagada' | 'atrasada' | 'anulada' | 'renovada'

export interface Cuota {
  numero: number
  tipo: TipoCuota
  fechaVencimiento: string
  /** Días que cuenta el interés de esta cuota. */
  diasPeriodo: number
  /** TNA usada para esta cuota (incluye spread; en ajustables es la tasa sobre el capital ajustado). */
  tasaAplicadaPct: number
  capitalCentavos: number
  interesCentavos: number
  /** UVA/CER: lo que se suma al capital por el ajuste del índice. */
  ajusteCentavos: number
  /** Precancelación: lo que se descuenta. */
  penalidadCentavos: number
  totalCentavos: number
  /** Capital que queda después de pagar esta cuota (sin ajuste). */
  saldoCapitalCentavos: number
  /** La tasa o el índice de esta cuota todavía no se conoce: se usó el último valor. */
  estimada: boolean
  /** Si ya no se paga (precancelación, devolución parcial o renovación la reemplazaron). */
  anulada?: boolean
  /** Renovación: la parte de capital que no se paga porque pasa a la inversión nueva. */
  renovadaCentavos?: number
  /** Cuota en USD que se paga en pesos. */
  enPesos?: TipoCambioPactado | null
  /** UVA/CER: valor del índice usado para esta cuota. */
  indiceValor?: number | null
}

export interface ChequeRecibido {
  tipo: 'echeq' | 'fisico'
  numero: string
  bancoEmisor: string | null
  fechaPago: string
  emisor: string
  emisorCuit: string | null
}

export interface IngresoRegistrado {
  id: string
  medio: MedioIngreso
  /** Del cheque cuenta la fecha de pago. */
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
  /** Vino de la planilla importada (no generó movimiento de caja ni cheque). */
  importado?: boolean
}

export interface Aprobacion {
  solicitadaPor: string
  solicitadaAt: string
  resueltaPor: string | null
  resueltaAt: string | null
  resultado: 'aprobada' | 'rechazada' | null
  nota: string | null
}

export type TipoOperacion = 'precancelacion' | 'devolucion_parcial' | 'renovacion'

/** topeIntereses: la penalidad no puede ser mayor que los intereses (el inversor, como mucho, pierde intereses). */
export type Penalidad =
  | { tipo: 'ninguna' }
  | { tipo: 'porcentaje_interes'; valorPct: number; topeIntereses?: boolean }
  | { tipo: 'porcentaje_capital'; valorPct: number; topeIntereses?: boolean }
  | { tipo: 'monto_fijo'; montoCentavos: number; topeIntereses?: boolean }

export type ModalidadRenovacion =
  /** Se renueva capital + intereses de la última cuota. */
  | 'capital_e_intereses'
  /** Se pagan los intereses y se renueva el capital (retiro de intereses). */
  | 'solo_capital'
  /** Se renueva un monto a medida; el resto se paga. */
  | 'monto'

export interface OperacionPendiente {
  id: string
  tipo: TipoOperacion
  fecha: string
  solicitadaPor: string
  solicitadaAt: string
  nota: string | null
  penalidad?: Penalidad
  montoCentavos?: number | null
  modalidad?: ModalidadRenovacion
  /** Renovación: id de la inversión nueva (queda en pendiente_aprobacion junto con esta operación). */
  inversionNuevaId?: string | null
  /** Cómo queda el cronograma si se aprueba. */
  cronogramaPropuesto: Cuota[]
  resumen: string
}

export interface CondicionesInversion {
  moneda: MonedaInversion
  capitalCentavos: number
  fechaAlta: string
  sistema: SistemaDevolucion
  periodicidad: Periodicidad
  cantidadCuotas: number
  /** Solo en 'al_vencimiento': si no viene, se calcula por cuotas × periodicidad. */
  fechaVencimiento: string | null
  /**
   * Sin fecha de devolución (mutuos que "cobran X %" todos los meses, o que capitalizan, hasta que se pida el capital).
   * Las cuotas de intereses se generan hasta un horizonte y se extienden solas. Solo en 'americano' y 'capitaliza'.
   */
  sinVencimiento?: boolean
  /** Inversiones en curso cargadas desde la planilla: cuántas cuotas ya se pagaron antes (para mostrar "cuota 42 de 67"). */
  cuotasPrevias?: number
  tasa: Tasa
  baseDias: BaseDias
  /** Solo 'a_medida': fecha y capital de cada cuota (interés opcional; si falta se calcula). */
  cuotasAMedida?: Array<{ fecha: string; capitalCentavos: number; interesCentavos?: number | null }> | null
  /** Inversión en USD que se devuelve en pesos. */
  devolucionEnPesos?: TipoCambioPactado | null
  medioIngresoPrevisto: MedioIngreso
  mediosDevolucion: MedioDevolucion[]
  penalidadPrecancelacion: Penalidad
}

export interface InversionDocumentBase extends CondicionesInversion {
  numero: string
  inversorId: string
  /** Copia del nombre para listar sin leer la ficha. */
  inversorNombre: string
  estado: EstadoInversion
  cronograma: Cuota[]
  ingresos: IngresoRegistrado[]
  aprobacion: Aprobacion | null
  operacionPendiente: OperacionPendiente | null
  /** Renovaciones: de qué inversión viene y cuánto capital pasó. */
  renovacionDe: { inversionId: string; numero: string; capitalCentavos: number } | null
  renovadaEn: { inversionId: string; numero: string } | null
  /** Cambia cada vez que cambia el cronograma: la Agenda solo se reescribe si cambió. */
  versionCronograma: number
  /** UVA/CER: valor del índice el día del alta (el capital se ajusta contra este valor). */
  indiceAlta: number | null
  observaciones: string | null
  importada: boolean
  /** Cuotas que no se pudieron reescribir en la Agenda (tienen pagos): hay que revisarlas a mano. */
  avisosAgenda?: string[]
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
  observaciones: string | null
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
  /** Hasta cuántos meses hacia adelante se generan las cuotas de las inversiones sin vencimiento. */
  horizonteMesesSinVencimiento: number
  penalidadDefault: Penalidad
  diasAvisoPorVencer: number
  retencionGanancias: RetencionGanancias
  ultimoNumero: number
}

export const CONFIG_INVERSIONES_DEFAULT: ConfigInversiones = {
  baseDiasDefault: 360,
  horizonteMesesSinVencimiento: 12,
  penalidadDefault: { tipo: 'ninguna' },
  diasAvisoPorVencer: 30,
  retencionGanancias: { activa: false, alicuotaInscriptoPct: null, alicuotaNoInscriptoPct: null, minimoNoSujetoCentavos: null },
  ultimoNumero: 0,
}

/** Valores de un índice o una tasa por fecha ('YYYY-MM-DD' → valor). Ordenados por fecha. */
export type SerieValores = ReadonlyArray<{ fecha: string; valor: number }>
