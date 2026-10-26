import type {
  DocumentoInversion,
  EstadoCuota,
  EstadoInversion,
  InversionDetalle,
  MedioIngreso,
} from '../../../services/finanzasInversionesApi'
import { formatMoneyCentavos } from '../formatMoney'
import { textoSistema, textoTasa } from './textosInversiones'

/** Mismos tonos que CuentaPanel.tsx (TONO_CHIP). */
export type TonoEstado = 'rojo' | 'ambar' | 'verde' | 'azul' | 'violeta' | 'neutro'

export const TONO_CHIP: Record<TonoEstado, string> = {
  rojo: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
  ambar: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200',
  verde: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  azul: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
  violeta: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200',
  neutro: 'bg-neutral-100 text-neutral-700 dark:bg-zinc-800 dark:text-zinc-300',
}

/** Color del chip de estado de la inversión, alineado a la paleta de CuentaPanel. */
export function tonoEstadoInversion(estado: EstadoInversion): TonoEstado {
  switch (estado) {
    case 'vigente':
      return 'verde'
    case 'pendiente_aprobacion':
      return 'ambar'
    case 'anulada':
      return 'rojo'
    case 'cancelada':
      return 'azul'
    case 'precancelada':
    case 'renovada':
      return 'violeta'
    case 'borrador':
    default:
      return 'neutro'
  }
}

export const TEXTO_CUOTA: Record<EstadoCuota, string> = {
  pendiente: 'Pendiente',
  parcial: 'Parcial',
  pagada: 'Pagada',
  atrasada: 'Atrasada',
  anulada: 'Anulada',
  renovada: 'Renovada',
}

export const TEXTO_MEDIO_INGRESO: Record<MedioIngreso, string> = {
  transferencia: 'Transferencia',
  efectivo: 'Efectivo',
  cheque: 'Cheque',
}

export const TEXTO_DOC: Record<DocumentoInversion['tipo'], string> = {
  mutuo: 'Mutuo',
  pagare: 'Pagaré',
  otro: 'Otro',
}

export const ABIERTAS: ReadonlySet<EstadoCuota> = new Set(['pendiente', 'parcial', 'atrasada'])

export function formatFecha(ymd: string | null | undefined): string {
  if (!ymd) return '—'
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${d}/${m}/${y}`
}

function textoPeriodicidad(p: string): string {
  const map: Record<string, string> = {
    mensual: 'mensual',
    bimestral: 'bimestral',
    trimestral: 'trimestral',
    cuatrimestral: 'cuatrimestral',
    semestral: 'semestral',
    anual: 'anual',
  }
  return map[p] ?? p
}

function textoMedioDev(m: string): string {
  switch (m) {
    case 'transferencia_ars':
      return 'transferencia en pesos'
    case 'transferencia_usd':
      return 'transferencia en dólares'
    case 'efectivo':
      return 'efectivo'
    case 'cheque':
      return 'cheque'
    default:
      return m
  }
}

export function condicionesEnPalabras(d: InversionDetalle): string {
  const c = d.condiciones
  const partes = [
    c.moneda === 'USD' ? 'Dólares' : 'Pesos',
    formatMoneyCentavos(c.capitalCentavos, c.moneda),
    textoSistema(c.sistema),
    textoTasa(c.tasa),
    `cada ${textoPeriodicidad(c.periodicidad)}`,
  ]
  if (c.sinVencimiento) partes.push('sin fecha de devolución')
  else partes.push(`${c.cantidadCuotas} cuota${c.cantidadCuotas === 1 ? '' : 's'}`)
  partes.push(`entra por ${TEXTO_MEDIO_INGRESO[c.medioIngresoPrevisto].toLowerCase()}`)
  partes.push(`devuelve por ${c.mediosDevolucion.map(textoMedioDev).join(', ')}`)
  return partes.join(' · ')
}

/** Meses (YYYY-MM) con más de una cuota con retención RG 830. */
export function mesesConRetencionRepetida(d: InversionDetalle): string[] {
  const meses = d.cronograma
    .filter((c) => c.retencionCentavos > 0)
    .map((c) => c.fechaVencimiento.slice(0, 7))
  return [...new Set(meses.filter((m, i) => meses.indexOf(m) !== i))]
}
