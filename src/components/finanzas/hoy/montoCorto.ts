import type { FinanzasMoneda } from '../../../services/finanzasApi'

function numero(valor: number, decimales: number): string {
  return valor.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
}

/**
 * Monto abreviado para grillas angostas: "45,0 M", "820 mil", "$ 500", "US$ 5.000".
 * El monto completo se muestra al tocar. Negativo con el signo adelante.
 */
export function montoCorto(centavos: number, moneda: FinanzasMoneda = 'ARS'): string {
  const signo = centavos < 0 ? '−' : ''
  const valor = Math.abs(centavos) / 100
  const prefijo = moneda === 'USD' ? 'US$ ' : ''
  if (valor >= 999_500) return `${signo}${prefijo}${numero(valor / 1_000_000, 1)} M`
  if (moneda === 'USD') return `${signo}US$ ${numero(valor, 0)}`
  if (valor >= 999.5) return `${signo}${numero(Math.round(valor / 1_000), 0)} mil`
  return `${signo}$ ${numero(valor, 0)}`
}
