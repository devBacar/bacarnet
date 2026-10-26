import type {
  EstadoInversion,
  SistemaDevolucion,
  Tasa,
} from '../../../services/finanzasInversionesApi'
import type { EstadoCuotaCalendario } from './cuentaInversor'

/** Estados en palabras simples (pantallas para gerentes). */
export const TEXTO_ESTADO: Record<EstadoInversion, string> = {
  borrador: 'Borrador',
  pendiente_aprobacion: 'Para aprobar',
  vigente: 'Vigente',
  cancelada: 'Terminada',
  precancelada: 'Devuelta antes',
  renovada: 'Renovada',
  anulada: 'Anulada',
}

/** Ficha / cuenta del inversor (letra grande, sin jerga). */
export const TEXTOS_FICHA = {
  verFicha: 'Ver ficha',
  tituloCuenta: 'Ficha del inversor',
  editarDatos: 'Editar datos',
  cerrar: 'Cerrar',
  cargando: 'Cargando la ficha…',
  sinContacto: 'Sin datos de contacto cargados.',
  kpisEnPesos: 'En pesos',
  kpisEnDolares: 'En dólares',
  capitalVigente: 'Capital vigente',
  interesesPagados: 'Intereses pagados',
  interesesAPagar: 'Intereses a pagar',
  retencionesAnio: 'Retención de Ganancias (RG 830) del año',
  inversionesVigentes: 'Inversiones vigentes',
  proximoVencimiento: 'Próximo vencimiento',
  sinProximo: 'Ninguno pendiente',
  calendarioTitulo: 'Calendario de cuotas',
  calendarioVacio: 'No hay cuotas de inversiones vigentes.',
  colFecha: 'Fecha',
  colInversion: 'Inversión',
  colMontoNeto: 'Monto neto',
  colEstado: 'Estado',
  verInversion: 'Ver inversión',
  inversionesTitulo: 'Inversiones vigentes',
  inversionesVacio: 'Este inversor no tiene inversiones en curso.',
  colEstadoInv: 'Estado',
  colCapital: 'Capital',
  colTasa: 'Tasa',
  colVencimiento: 'Vencimiento',
} as const

export const TEXTO_ESTADO_CUOTA_CALENDARIO: Record<EstadoCuotaCalendario, string> = {
  pagada: 'Pagada',
  pendiente: 'Pendiente',
  vencida: 'Vencida',
}

/** Modal de aprobar (nota + ingreso opcional a Caja). */
export const TEXTOS_APROBAR = {
  titulo: 'Aprobar inversión',
  ayuda: 'Queda vigente. Si el capital ya entró, podés anotarlo acá.',
  nota: 'Nota',
  capitalYaIngreso: 'El capital ya ingresó',
  cancelar: 'Cancelar',
  confirmar: 'Aprobar',
  enviando: 'Aprobando…',
  ingresoError: (msg: string) =>
    `Inversión aprobada, pero el ingreso a Caja no se registró: ${msg}. Registralo desde 'Registrar ingreso'.`,
} as const

/** Cómo se devuelve la plata, en palabras. */
export const TEXTO_SISTEMA: Record<SistemaDevolucion, string> = {
  americano: 'Paga intereses por mes',
  capitaliza: 'Capitaliza',
  frances: 'Cuotas fijas',
  aleman: 'Cuotas con capital igual',
  al_vencimiento: 'Todo al final',
  a_medida: 'A medida',
}

export function textoEstado(estado: EstadoInversion): string {
  return TEXTO_ESTADO[estado]
}

export function textoSistema(sistema: SistemaDevolucion): string {
  return TEXTO_SISTEMA[sistema]
}

/**
 * Tasa en palabras. Si la cargaron por mes (expresada 'mensual'), se muestra el % mensual
 * (tnaPct / 12). Si no, el % anual. Nunca se dice «plazo fijo».
 */
export function textoTasa(tasa: Tasa): string {
  if (tasa.tipo === 'fija') {
    if (tasa.expresada === 'mensual') {
      const mensual = tasa.tnaPct / 12
      return `${formatPct(mensual)} % por mes`
    }
    return `${formatPct(tasa.tnaPct)} % anual`
  }
  if (tasa.tipo === 'variable') {
    const spread = tasa.spreadPct === 0 ? '' : ` + ${formatPct(tasa.spreadPct)} %`
    return `${textoReferencia(tasa.referencia)}${spread}`
  }
  return `${formatPct(tasa.tnaPct)} % anual + ${textoIndice(tasa.indice)}`
}

function formatPct(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 4 })
}

function textoReferencia(ref: string): string {
  switch (ref) {
    case 'plazo_fijo_30':
      return 'Tasa de referencia 30 días'
    case 'badlar':
      return 'BADLAR'
    case 'tamar':
      return 'TAMAR'
    case 'adelantos_empresas':
      return 'Adelantos a empresas'
    case 'prestamos_empresas':
      return 'Préstamos a empresas'
    default:
      return 'Tasa variable'
  }
}

function textoIndice(indice: string): string {
  if (indice === 'uva') return 'UVA'
  if (indice === 'cer') return 'CER'
  return 'ajuste'
}
