import { esYmd, sumarMeses } from './fechas.js'
import type {
  BaseDias,
  CondicionesInversion,
  ConfigInversiones,
  FuenteTipoCambio,
  MedioDevolucion,
  MedioIngreso,
  MonedaInversion,
  Periodicidad,
  SistemaDevolucion,
  Tasa,
  TipoCambioPactado,
} from './inversion.types.js'
import { ErrorValidacion, validarPenalidad } from './validar.js'

const MONEDAS: MonedaInversion[] = ['ARS', 'USD']
const SISTEMAS: SistemaDevolucion[] = ['al_vencimiento', 'americano', 'frances', 'aleman', 'capitaliza', 'a_medida']
const PERIODICIDADES: Periodicidad[] = ['mensual', 'bimestral', 'trimestral', 'cuatrimestral', 'semestral', 'anual']
const BASES: BaseDias[] = [365, 360, '360_reales', 'reales']
const MEDIOS_INGRESO: MedioIngreso[] = ['transferencia', 'efectivo', 'cheque']
const MEDIOS_DEVOLUCION: MedioDevolucion[] = ['transferencia_ars', 'transferencia_usd', 'efectivo', 'cheque']
const FUENTES_TC: FuenteTipoCambio[] = ['pactado', 'bna_vendedor', 'mep']

function uno<T>(valor: unknown, opciones: readonly T[], mensaje: string): T {
  if (!opciones.includes(valor as T)) throw new ErrorValidacion(mensaje)
  return valor as T
}

function montoPositivo(valor: unknown, mensaje: string): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor <= 0) throw new ErrorValidacion(mensaje)
  return valor
}

function montoNoNegativo(valor: unknown, mensaje: string): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0) throw new ErrorValidacion(mensaje)
  return valor
}

function fecha(valor: unknown, mensaje: string): string {
  if (!esYmd(valor)) throw new ErrorValidacion(mensaje)
  return valor
}

function tasaPct(valor: unknown, nombre: string): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > 1000) {
    throw new ErrorValidacion(`${nombre} tiene que ser un porcentaje entre 0 y 1000.`)
  }
  return valor
}

function validarTasa(raw: unknown): Tasa {
  if (!raw || typeof raw !== 'object') throw new ErrorValidacion('Falta la tasa.')
  const r = raw as Record<string, unknown>
  if (r.tipo === 'fija') {
    const expresada = r.expresada === 'mensual' ? 'mensual' : 'anual'
    return { tipo: 'fija', tnaPct: tasaPct(r.tnaPct, 'La tasa'), expresada }
  }
  if (r.tipo === 'variable') {
    const referencias = ['plazo_fijo_30', 'badlar', 'tamar', 'adelantos_empresas', 'prestamos_empresas'] as const
    if (typeof r.spreadPct !== 'number' || !Number.isFinite(r.spreadPct)) throw new ErrorValidacion('Poné el spread de la tasa variable.')
    return {
      tipo: 'variable',
      referencia: uno(r.referencia, referencias, 'La tasa de referencia no es válida.'),
      spreadPct: r.spreadPct,
      pisoPct: r.pisoPct == null ? null : tasaPct(r.pisoPct, 'El piso'),
      techoPct: r.techoPct == null ? null : tasaPct(r.techoPct, 'El techo'),
    }
  }
  if (r.tipo === 'ajustable') {
    return { tipo: 'ajustable', indice: uno(r.indice, ['uva', 'cer'] as const, 'El índice no es válido.'), tnaPct: tasaPct(r.tnaPct, 'La tasa') }
  }
  throw new ErrorValidacion('El tipo de tasa no es válido.')
}

export function validarTipoCambio(raw: unknown): TipoCambioPactado | null {
  if (raw === null || raw === undefined) return null
  const r = raw as Record<string, unknown>
  return {
    centavosPorUsd: montoPositivo(r.centavosPorUsd, 'Poné el tipo de cambio pactado.'),
    fuente: uno(r.fuente, FUENTES_TC, 'La fuente del tipo de cambio no es válida.'),
    fecha: fecha(r.fecha, 'Poné la fecha del tipo de cambio.'),
  }
}

/**
 * Lo que llega del formulario → condiciones listas para calcular.
 * Base de días y penalidad vacías toman el valor de la configuración.
 */
export function validarCondiciones(raw: unknown, config: ConfigInversiones): CondicionesInversion {
  if (!raw || typeof raw !== 'object') throw new ErrorValidacion('Faltan las condiciones de la inversión.')
  const r = raw as Record<string, unknown>
  const moneda = uno(r.moneda, MONEDAS, 'Elegí la moneda.')
  const sistema = uno(r.sistema, SISTEMAS, 'Elegí cómo se devuelve.')
  const sinVencimiento = r.sinVencimiento === true
  if (sinVencimiento && sistema !== 'americano' && sistema !== 'capitaliza') {
    throw new ErrorValidacion('"Sin fecha de devolución" solo va cuando se pagan los intereses o cuando capitaliza.')
  }
  const cantidadCuotas = r.cantidadCuotas
  if (typeof cantidadCuotas !== 'number' || !Number.isInteger(cantidadCuotas) || cantidadCuotas < 1 || cantidadCuotas > 600) {
    throw new ErrorValidacion('La cantidad de cuotas tiene que ser entre 1 y 600.')
  }
  const cuotasPrevias = r.cuotasPrevias ?? 0
  if (typeof cuotasPrevias !== 'number' || !Number.isInteger(cuotasPrevias) || cuotasPrevias < 0) {
    throw new ErrorValidacion('Las cuotas ya pagadas tienen que ser un número entero.')
  }
  const tasa = validarTasa(r.tasa)
  if (tasa.tipo === 'ajustable' && moneda !== 'ARS') throw new ErrorValidacion('UVA y CER solo se usan en inversiones en pesos.')
  const devolucionEnPesos = validarTipoCambio(r.devolucionEnPesos)
  if (devolucionEnPesos && moneda !== 'USD') throw new ErrorValidacion('El tipo de cambio pactado solo va en inversiones en dólares.')
  const medios = r.mediosDevolucion
  if (!Array.isArray(medios) || medios.length === 0) throw new ErrorValidacion('Elegí al menos un medio de devolución.')
  let cuotasAMedida: CondicionesInversion['cuotasAMedida'] = null
  if (sistema === 'a_medida') {
    if (!Array.isArray(r.cuotasAMedida) || r.cuotasAMedida.length === 0) throw new ErrorValidacion('Cargá las cuotas a medida.')
    cuotasAMedida = r.cuotasAMedida.map((c: Record<string, unknown>) => ({
      fecha: fecha(c?.fecha, 'Cada cuota a medida necesita su fecha.'),
      capitalCentavos: montoNoNegativo(c?.capitalCentavos, 'Cada cuota a medida necesita su capital.'),
      interesCentavos: typeof c?.interesCentavos === 'number' ? c.interesCentavos : null,
    }))
  }
  return {
    moneda,
    capitalCentavos: montoPositivo(r.capitalCentavos, 'Poné el capital.'),
    fechaAlta: fecha(r.fechaAlta, 'Poné la fecha de alta.'),
    sistema,
    periodicidad: uno(r.periodicidad, PERIODICIDADES, 'Elegí cada cuánto se paga.'),
    cantidadCuotas,
    fechaVencimiento: r.fechaVencimiento == null ? null : fecha(r.fechaVencimiento, 'La fecha de vencimiento no es válida.'),
    sinVencimiento,
    cuotasPrevias,
    tasa,
    baseDias: r.baseDias == null ? config.baseDiasDefault : uno(r.baseDias, BASES, 'La base de días no es válida.'),
    cuotasAMedida,
    devolucionEnPesos,
    medioIngresoPrevisto: uno(r.medioIngresoPrevisto, MEDIOS_INGRESO, 'Elegí cómo entra la plata.'),
    mediosDevolucion: medios.map((m) => uno(m, MEDIOS_DEVOLUCION, 'Un medio de devolución no es válido.')),
    penalidadPrecancelacion: r.penalidadPrecancelacion == null ? config.penalidadDefault : validarPenalidad(r.penalidadPrecancelacion),
  }
}

/** Hasta dónde generar cuotas de las inversiones sin vencimiento: hoy + horizonte de la configuración. */
export function horizonteSinVencimiento(hoy: string, config: ConfigInversiones): string {
  return sumarMeses(hoy, config.horizonteMesesSinVencimiento)
}
