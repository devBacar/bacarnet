import type { FinanzasMoneda } from '../../services/finanzasApi'
import { PosicionMonto } from './PosicionMonto'

interface AccountsSummaryProps {
  arsCentavos: number
  usdCentavos: number
  onSelectMoneda?: (moneda: FinanzasMoneda) => void
}

export function AccountsSummary({
  arsCentavos,
  usdCentavos,
  onSelectMoneda,
}: AccountsSummaryProps) {
  return (
    <section aria-labelledby="finanzas-posicion-general-heading" className="space-y-4">
      <h2
        id="finanzas-posicion-general-heading"
        className="text-heading text-lg font-semibold tracking-tight"
      >
        Posición general
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <PosicionTotalCard
          label="Posición en pesos"
          centavos={arsCentavos}
          moneda="ARS"
          onSelect={onSelectMoneda}
        />
        <PosicionTotalCard
          label="Posición en dólares"
          centavos={usdCentavos}
          moneda="USD"
          onSelect={onSelectMoneda}
        />
      </div>
    </section>
  )
}

function PosicionTotalCard({
  label,
  centavos,
  moneda,
  onSelect,
}: {
  label: string
  centavos: number
  moneda: FinanzasMoneda
  onSelect?: (moneda: FinanzasMoneda) => void
}) {
  const className =
    'surface-card rounded-2xl border border-neutral-200 p-6 text-left dark:border-zinc-800'
  if (!onSelect) {
    return (
      <div className={className}>
        <p className="text-body-muted text-sm font-medium">{label}</p>
        <div className="mt-2">
          <PosicionMonto centavos={centavos} moneda={moneda} size="lg" />
        </div>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(moneda)}
      className={`${className} transition hover:border-brand-primary/40 hover:shadow-sm`}
    >
      <p className="text-body-muted text-sm font-medium">{label}</p>
      <div className="mt-2">
        <PosicionMonto centavos={centavos} moneda={moneda} size="lg" />
      </div>
    </button>
  )
}
