import type { MonedaTablero } from '../../services/finanzasTableroApi'
import { formatMoneyCentavos } from '../finanzas/formatMoney'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function mesLargo(mes: string): string {
  const [anio, numero] = mes.split('-')
  return `${MESES[Number(numero) - 1] ?? mes} ${anio}`
}

export function mesCorto(mes: string): string {
  return MESES_CORTOS[Number(mes.slice(5, 7)) - 1] ?? mes
}

export function fechaCorta(ymd: string): string {
  const [anio, mes, dia] = ymd.split('-')
  if (!dia) return ymd
  return `${dia}/${mes}/${anio}`
}

export function diaMes(ymd: string): string {
  const [, mes, dia] = ymd.split('-')
  if (!dia) return ymd
  return `${dia}/${mes}`
}

export function fechaHora(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function textoPct(valor: number | null): string {
  if (valor == null) return ''
  const texto = Math.abs(valor).toLocaleString('es-AR', { maximumFractionDigits: 1 })
  return `${texto}%`
}

export function plata(centavos: number, moneda: MonedaTablero): string {
  return formatMoneyCentavos(centavos, moneda)
}

/** Monto corto para que entre arriba de una barra. */
export function plataCorta(centavos: number): string {
  const pesos = Math.abs(centavos) / 100
  const signo = centavos < 0 ? '−' : ''
  if (pesos >= 1_000_000) {
    const millones = pesos / 1_000_000
    const texto = millones >= 10 ? String(Math.round(millones)) : millones.toLocaleString('es-AR', { maximumFractionDigits: 1 })
    return `${signo}$${texto} M`
  }
  if (pesos >= 10_000) {
    const miles = pesos / 1_000
    const texto = miles >= 100 ? String(Math.round(miles)) : miles.toLocaleString('es-AR', { maximumFractionDigits: 1 })
    return `${signo}$${texto} mil`
  }
  return `${signo}$${Math.round(pesos).toLocaleString('es-AR')}`
}

export function textoMovimientos(cantidad: number): string {
  return cantidad === 1 ? '1 movimiento' : `${cantidad} movimientos`
}

export function textoVariacion30(centavos: number | null, moneda: MonedaTablero): string | null {
  if (centavos == null) return null
  if (centavos === 0) return 'igual que hace 30 días'
  const verbo = centavos > 0 ? 'subió' : 'bajó'
  return `${verbo} ${plata(Math.abs(centavos), moneda)} en 30 días`
}

export function textoContraMesAnterior(variacion: number | null, anterior: number): string {
  if (anterior <= 0) return 'el mes anterior no tuvo costo'
  if (variacion == null || variacion === 0) return 'igual que el mes anterior'
  return variacion > 0 ? `subió ${textoPct(variacion)}` : `bajó ${textoPct(variacion)}`
}
