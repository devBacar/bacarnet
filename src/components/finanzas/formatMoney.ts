import type { FinanzasMoneda } from '../../services/finanzasApi'

export function formatMoneyCentavos(centavos: number, moneda: FinanzasMoneda): string {
  const amount = centavos / 100
  const formatter = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: moneda,
    currencyDisplay: 'symbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return formatter.format(amount)
}
