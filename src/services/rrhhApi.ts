import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

async function rrhhFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(resolveApiUrl(`/api/rrhh${path}`), { ...init, headers })
}

async function mensajeDeError(res: Response, porDefecto: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; mensaje?: string }
    return data.error ?? data.mensaje ?? porDefecto
  } catch {
    return porDefecto
  }
}

export interface RrhhEstado {
  ok: boolean
  modulo: 'rrhh'
}

export async function fetchRrhhEstado(): Promise<RrhhEstado> {
  const res = await rrhhFetch('/estado')
  if (!res.ok) throw new Error('No se pudo verificar el módulo RRHH')
  return (await res.json()) as RrhhEstado
}

/* ---------- Informe mensual (mismos tipos que backend/src/modules/rrhh/domain/informeMensual.ts) ---------- */

export type TipoMesRrhh = 'real' | 'actual' | 'prevision'
export type SeveridadRrhh = 'urgente' | 'alta' | 'media' | 'oportunidad'
export type CategoriaRrhh = 'Dotación' | 'Horarios' | 'Límite legal' | 'Vacaciones' | 'Feriados' | 'Compensación'

export interface MesAreaRrhh {
  mes: string
  tipo: TipoMesRrhh
  feriados: number
  feriadosDetalle: string[]
  he50: number
  he100: number
  fer: number
  costo: number
  vacaciones: number
  licencias: number
  dotacion: number
  vacacionesProgramadas?: number
  vacacionesAnioAnterior?: number
  cupoVacaciones?: number
  vacacionesLibres?: number
}

export interface AreaRrhh {
  cc: number
  nombre: string
  convenio: 'suvico' | 'camioneros' | 'bancarios' | 'comercio' | 'fuera'
  convenioNombre: string
  horasMes: number
  modelo: {
    tipo: 'ausencias' | 'estructural'
    umbralHoras: number
    horasExtraPorHoraAusencia: number
    r2: number
    correlacion: number
    base3: number
    proporcion100: number
    horasFeriadoPorFeriado: number
    costoHoraExtra: number
    costoHoraFeriado: number
  }
  costoPersonaMes: number
  vacaciones: {
    anio: number
    derecho: number
    otorgado: number
    pendiente: number
    debenVerano: number
    libresDeVerano: number
  }
  limite: { superaron: number; vanASuperar: number; masDe30EnElMes: number }
  meses: MesAreaRrhh[]
  costoEmpresa: {
    costoPersonaMes: number
    noRemunerativo: number
    productividad: number
    horaExtra: number
    horaFeriado: number
    valor50: number
    valor100: number
  }
  horasPactadasMes: number
}

export interface FactoresCostoRrhh {
  mesBase: string
  contribuciones: number
  provisiones: number
  cargasAguinaldo: number
  vacaciones: number
  diasVacacionesPromedio: number
  total: number
  medido: boolean
}

export interface PactadasAgregadoRrhh {
  personas: number
  horasMes: number
  costoMes: number
  porArea: { cc: number; nombre: string; personas: number; horasMes: number; costoMes: number }[]
  porMes: Record<string, number>
}

export type IdPlanRrhh = 'suave' | 'medio' | 'brusco'

export interface MedidaPlanRrhh {
  id: 'contratar' | 'vacaciones' | 'eventuales' | 'turnos' | 'feriados' | 'ausentismo' | 'concentradas'
  titulo: string
  explicacion: string
  ahorroAnual: number
  areas: { cc: number; nombre: string; ahorroAnual: number; personas?: number; detalle: string }[]
  requiere?: string
}

export interface PlanRrhh {
  id: IdPlanRrhh
  nombre: string
  descripcion: string
  ahorroAnual: number
  ahorroMensual: number
  porcentaje: number
  personasAContratar: number
  costoContratacionesMes: number
  horasMenosPorMes: number
  medidas: MedidaPlanRrhh[]
}

export interface ContratacionAreaRrhh {
  cc: number
  nombre: string
  costoPersonaMes: number
  horasExtraQueReemplaza: number
  ahorroPorPersonaMes: number
  margenOtrosCostosMes: number
  puestosEquivalentes: number
  conviene: boolean
}

export type UnidadNegocioRrhh = 'seguridad' | 'caudales' | 'tesoreria' | 'gruas' | 'estructura'
export type ConvenioRrhh = 'suvico' | 'camioneros' | 'bancarios' | 'comercio' | 'fuera'

export interface FilaEvolucionRrhh {
  mes: string
  tipo: TipoMesRrhh
  cc: number
  dotacion: number
  conHorasExtra: number | null
  mas30: number | null
  horasNormales: number
  he50: number
  he100: number
  fer: number
  comp: number
  noct: number
  costoExtra: number
  costoFeriado: number
  costoComp: number
  diasVacaciones: number
  diasLicencia: number
  horasPactadas: number
  costoPactadas: number
}

export interface FilaConvenioRrhh {
  mes: string
  convenio: ConvenioRrhh
  personas: number
  horasNormales: number
  horasExtra: number
  diasVacaciones: number
  diasLicencia: number
}

export interface EvolucionRrhh {
  convenios: { id: ConvenioRrhh; nombre: string; horasMes: number; corte?: 'ciclo26' | 'calendario' }[]
  porConvenio: FilaConvenioRrhh[]
  meses: string[]
  areas: { cc: number; nombre: string; unidad: UnidadNegocioRrhh }[]
  unidades: { id: UnidadNegocioRrhh; nombre: string }[]
  filas: FilaEvolucionRrhh[]
  primerMesFeriados: string | null
  notas: string[]
}

export interface FilaCostoNominaRrhh {
  mes: string
  /** -1: recibos sin centro de costo. */
  cc: number
  empresa: number
  convenio: ConvenioRrhh
  personas: number
  rem: number
  norem: number
  desc: number
  neto: number
  contrib: number
  prov: number
  costoLaboral: number
  adelantos: number
  extras: number
}

export interface CostosNominaRrhh {
  meses: string[]
  filas: FilaCostoNominaRrhh[]
  areas?: { cc: number; nombre: string; unidad: UnidadNegocioRrhh }[]
  empresas: { id: number; nombre: string }[]
  convenios: { id: ConvenioRrhh; nombre: string }[]
  notas: string[]
}

/* ---------- Indicadores de personal (backend/src/modules/rrhh/domain/indicadores.ts) ---------- */

export type GrupoAusenciaRrhh = 'enfermedad' | 'accidentes' | 'injustificadas' | 'suspensiones' | 'especiales'
export type MotivoBajaRrhh = 'renuncia' | 'despido' | 'finContrato' | 'acuerdo' | 'otras'
export type TipoLicenciaLargaRrhh = 'reserva' | 'art' | 'enfermedad' | 'maternidad'

export interface FilaIndicadorRrhh {
  mes: string
  convenio: ConvenioRrhh
  personas: number
  diasLiquidados: number
  dias: Record<GrupoAusenciaRrhh, number>
  diasVacaciones: number
  personasEnfermedad: number
  personasAccidente: number
  personasFaltas: number
  episodios: { corta: number; media: number; larga: number }
  licenciasLargas: Record<TipoLicenciaLargaRrhh, number>
  altas: number
  bajas: number
  bajasTempranas: number
  bajasTempranasFinContrato?: number
  bajasPorMotivo: Record<MotivoBajaRrhh, number>
  horasNormales: number
  horasExtra: number
  montoExtras: number
  rem: number
}

export interface IndicadoresRrhh {
  meses: string[]
  convenios: { id: ConvenioRrhh; nombre: string; corte: 'ciclo26' | 'calendario' }[]
  filas: FilaIndicadorRrhh[]
  primerMesAusencias: string | null
  notas: string[]
}

/* ---------- Personal (backend/src/modules/rrhh/domain/personal.ts) ---------- */

export type DatoPrivadoRrhh = number | 'menos de 3'

export interface RangoPersonalRrhh {
  id: string
  nombre: string
  cantidad: number
}

export interface ItemDistribucionRrhh {
  id: string
  nombre: string
  cantidad: number
}

export interface CortePersonalRrhh {
  id: string
  nombre: string
  mes: string
  personas: number
  edadPromedio: number | null
  antiguedadPromedio: number | null
  pctMujeres: DatoPrivadoRrhh
  pctConHijos: number
  discapacidad: DatoPrivadoRrhh
}

export interface PersonalAgregadoRrhh {
  mes: string
  nota: string
  dotacion: number
  edadPromedio: number | null
  antiguedadPromedio: number | null
  mujeres: number
  varones: number
  sinSexo: number
  pctMujeres: number
  pctVarones: number
  rangosEdad: RangoPersonalRrhh[]
  rangosAntiguedad: RangoPersonalRrhh[]
  enEdadDeJubilarse: number
  jubilacionProximos2Anios: number
  aniversarios: { mes: string; cantidad: number; porAnios: { anios: number; cantidad: number }[] }
  porArea: CortePersonalRrhh[]
  porConvenio: CortePersonalRrhh[]
  estadoCivil: ItemDistribucionRrhh[]
  estudios: ItemDistribucionRrhh[]
  contratos: ItemDistribucionRrhh[]
  jornadaParcial: number
  jornadaCompleta: number
  jornadaSinDato: number
  calidad: { estudios: number; estadoCivil: number; contrato: number; sexo: number; edad: number; jornada: number }
  familia: {
    nota: string
    personasConHijos: number
    totalHijos: number
    hijosEdadEscolar: number
    familiaresConDiscapacidad: number
  }
}

export interface PersonaPersonalRrhh {
  legajo: number
  nombre: string
  area: string
  convenio: ConvenioRrhh
  convenioNombre: string
  edad: number | null
  antiguedad: number | null
  sexo: string
  contrato: string
  hijos: number
}

export interface PersonalDetalleRrhh {
  personas: PersonaPersonalRrhh[]
  aniversarios: { legajo: number; nombre: string; area: string; anios: number; ingreso: string }[]
}

export interface PersonaLicenciaLargaRrhh {
  legajo: number
  nombre: string
  area: string
  convenio: ConvenioRrhh
  tipo: TipoLicenciaLargaRrhh
  desde: string
  hasta: string
  dias: number
}

export interface PersonaBajaRrhh {
  legajo: number
  nombre: string
  area: string
  convenio: ConvenioRrhh
  ingreso: string
  egreso: string
  diasTrabajados: number
  motivo: MotivoBajaRrhh
}

export interface PlanesRrhh {
  gastoMensual: number
  pactadasMensual: number
  gastoMensualReducible: number
  planes: PlanRrhh[]
  contratacion: ContratacionAreaRrhh[]
  factores: FactoresCostoRrhh
  supuestos: string[]
}

export interface RecomendacionRrhh {
  id: string
  cc: number
  area: string
  mes: string
  categoria: CategoriaRrhh
  severidad: SeveridadRrhh
  titulo: string
  detalle: string
  impacto?: { monto: number; etiqueta: string }
  regla: string
}

export interface FocoRrhh {
  severidad: SeveridadRrhh
  etiqueta: string
  cc: number
  area: string
  cifra: string
  texto: string
  peso: number
}

export interface MetaInformeRrhh {
  archivo: string | null
  backupCreado: string | null
  actualizado: string | null
}

export interface InformeRrhh {
  ultimoMes: string
  reales: string[]
  actual: string
  prevision: string[]
  areas: AreaRrhh[]
  eventuales: { personas: number; horas: number; costoHora: number; horasLibres: number }
  limiteTotal: { superaron: number; vanASuperar: number; masDe30EnElMes: number }
  focos: FocoRrhh[]
  recomendaciones: RecomendacionRrhh[]
  factores?: FactoresCostoRrhh
  pactadas?: PactadasAgregadoRrhh
  planes?: PlanesRrhh
  evolucion?: EvolucionRrhh
  costos?: CostosNominaRrhh
  indicadores?: IndicadoresRrhh
  personal?: PersonalAgregadoRrhh
  origenFeriados?: { anio: string; origen: string; texto: string }[]
  reporte: ReporteMensualRrhh
  meta: MetaInformeRrhh
}

/* ---------- Reporte por período (backend/src/modules/rrhh/domain/reportePeriodos.ts) ---------- */

/** Código de la fila "Otras áreas" (centros de costo con pocas horas extra). */
export const OTRAS_AREAS_CC = -1

export interface CausasHorasRrhh {
  ausencias: number
  habituales: number
  feriados: number
}

export interface CifrasPeriodoRrhh {
  horas50: number
  horas100: number
  horasFeriado: number
  horasTotal: number
  costo: number
  dotacion: number
  personasConHorasExtra: number | null
  personasMas30: number | null
  diasVacaciones: number
  diasLicencia: number
  licenciasPorTipo: { tipo: string; dias: number }[]
  causas: CausasHorasRrhh
  anterior: { mes: string; horasTotal: number; costo: number } | null
  vacacionesCargadas?: number
  vacacionesPosibles?: number
}

export interface AreaPeriodoRrhh extends CifrasPeriodoRrhh {
  cc: number
  nombre: string
  costoPactadas?: number
  claves: string[]
}

export interface PeriodoRrhh {
  mes: string
  costoPactadas?: number
  tipo: TipoMesRrhh
  feriados: number
  feriadosDetalle: string[]
  total: CifrasPeriodoRrhh
  claves: string[]
  areas: AreaPeriodoRrhh[]
}

export interface AreaAnualRrhh {
  cc: number
  nombre: string
  horasTotal: number
  costo: number
  superaron: number
  vanASuperar: number
  vacacionesPendientes: number
  vacacionesDerecho: number
  claves: string[]
}

export interface VisionAnualRrhh {
  costoPactadas?: number
  anio: number
  desde: string
  hasta: string
  horas50: number
  horas100: number
  horasFeriado: number
  horasTotal: number
  costo: number
  costoPromedioMes: number
  mesMasAlto: { mes: string; horasTotal: number; costo: number } | null
  superaron: number
  vanASuperar: number
  vacaciones: { temporada: number; derecho: number; otorgado: number; pendiente: number }
  areas: AreaAnualRrhh[]
  claves: string[]
}

export interface ReporteMensualRrhh {
  periodos: PeriodoRrhh[]
  anual: VisionAnualRrhh
}

export interface PersonaMesRrhh {
  legajo: number
  nombre: string
  /** Centro de costo del recibo y área del reporte en la que se suma (-1 = "Otras áreas"). */
  cc?: number
  ccReporte?: number
  area: string
  puesto: string
  horas50: number
  horas100: number
  horasFeriado: number
  horasTotal: number
  superaLimiteMes: boolean
}

export interface PersonaLimiteRrhh {
  legajo: number
  nombre: string
  cc: number
  area: string
  puesto: string
  acumuladoAnio: number
  ultimoMes: number
  promedio3: number
  proyeccionAnio: number
  mesesSobre30: number
}

export interface PersonaPactadaRrhh {
  legajo: number
  nombre: string
  cc: number
  area: string
  puesto: string
  horas50: number
  horas100: number
  mesesIguales: number
  mesesConHoras: number
  estado: 'detectada' | 'confirmada'
  horasAnio: number
  costoMes: number
}

export interface InformeDetalleRrhh {
  anio: number
  limite: PersonaLimiteRrhh[]
  porMes: Record<string, PersonaMesRrhh[]>
  pactadas?: PersonaPactadaRrhh[]
  pactadasDescartadas?: { legajo: number; nombre: string; area: string }[]
  indicadores?: { licenciasLargas: PersonaLicenciaLargaRrhh[]; bajasTempranas: PersonaBajaRrhh[] }
  personal?: PersonalDetalleRrhh
  meta: MetaInformeRrhh
}

/** Error con el código HTTP, para distinguir "todavía no hay datos" (404) de una falla. */
export class RrhhApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function fetchRrhhInforme(): Promise<InformeRrhh> {
  const res = await rrhhFetch('/informe')
  if (!res.ok) throw new RrhhApiError(await mensajeDeError(res, 'No se pudo cargar el informe de RRHH'), res.status)
  return (await res.json()) as InformeRrhh
}

/** Una persona en un mes con sus importes (solo perfil RRHH). */
export interface PersonaCostoRrhh {
  legajo: number
  nombre: string
  cc: number
  /** -1 si el recibo no trae centro de costo (como en las filas de costos). */
  ccFiltro: number
  convenio: ConvenioRrhh
  empresa: number
  rem: number
  norem: number
  neto: number
  costoLaboral: number
  extras: number
  /** Horas extra del mes (informes procesados desde el 07/10/2026). */
  he50?: number
  he100?: number
  fer?: number
  comp?: number
}

export async function fetchRrhhPersonasCostos(mes: string): Promise<{ mes: string; personas: PersonaCostoRrhh[] }> {
  const res = await rrhhFetch(`/informe/personas/${mes}`)
  if (!res.ok) throw new RrhhApiError(await mensajeDeError(res, 'No se pudo cargar la lista de personas'), res.status)
  return (await res.json()) as { mes: string; personas: PersonaCostoRrhh[] }
}

export async function fetchRrhhInformeDetalle(): Promise<InformeDetalleRrhh> {
  const res = await rrhhFetch('/informe/detalle')
  if (!res.ok) throw new RrhhApiError(await mensajeDeError(res, 'No se pudo cargar el detalle'), res.status)
  return (await res.json()) as InformeDetalleRrhh
}

export interface ResultadoIngestaRrhh {
  estado: 'ok' | 'ya_procesado' | 'en_curso' | 'sin_backup' | 'error'
  archivo?: string
  ultimoMes?: string | null
  backupAtrasado?: boolean
  mensaje?: string
}

/** Solo super admin: procesa ya el último backup de Salario de Drive. */
export async function ejecutarIngestaRrhh(forzar = false): Promise<ResultadoIngestaRrhh> {
  const res = await rrhhFetch('/ingestas/ejecutar', { method: 'POST', body: JSON.stringify({ forzar }) })
  const data = (await res.json().catch(() => ({}))) as ResultadoIngestaRrhh & { error?: string }
  if (!res.ok && data.estado !== 'error') {
    throw new RrhhApiError(data.error ?? 'No se pudo procesar el backup de Salario', res.status)
  }
  return data
}

export type CambioPactadaRrhh = 'confirmar' | 'descartar' | 'automatico'

/** RRHH confirma o saca a una persona de las horas pactadas. Se aplica en la próxima actualización de datos. */
export async function cambiarPactadaRrhh(legajo: number, cambio: CambioPactadaRrhh): Promise<void> {
  const res = await rrhhFetch(`/pactadas/${legajo}`, { method: 'POST', body: JSON.stringify({ cambio }) })
  if (!res.ok) throw new RrhhApiError(await mensajeDeError(res, 'No se pudo guardar el cambio'), res.status)
}
