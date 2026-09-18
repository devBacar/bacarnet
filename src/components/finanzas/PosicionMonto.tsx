import type { FinanzasMoneda } from '../../services/finanzasApi'
import { formatMoneyCentavos } from './formatMoney'
import { posicionTag } from './finanzasAggregates'

interface PosicionMontoProps {
  centavos: number
  moneda: FinanzasMoneda
  /** Tamaño del monto principal */
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClass = {
  sm: 'text-base',
  md: 'text-xl',
  lg: 'text-2xl',
} as const

export function PosicionMonto({
  centavos,
  moneda,
  size = 'md',
  className = '',
}: PosicionMontoProps) {
  const negativo = centavos < 0
  const tag = posicionTag(centavos)

  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${className}`}>
      <span
        className={`font-semibold tabular-nums tracking-tight ${sizeClass[size]} ${
          negativo ? 'text-red-600 dark:text-red-400' : 'text-heading'
        }`}
      >
        {formatMoneyCentavos(centavos, moneda)}
      </span>
      <span
        className={`text-sm font-medium ${negativo ? 'text-red-600/90 dark:text-red-400/90' : 'text-neutral-500 dark:text-gray-400'}`}
      >
        {tag}
      </span>
    </span>
  )
}
