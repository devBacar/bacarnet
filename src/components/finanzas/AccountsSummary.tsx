import { PosicionMonto } from './PosicionMonto'

interface AccountsSummaryProps {
  arsCentavos: number
  usdCentavos: number
}

export function AccountsSummary({ arsCentavos, usdCentavos }: AccountsSummaryProps) {
  return (
    <section aria-labelledby="finanzas-posicion-general-heading" className="space-y-4">
      <h2
        id="finanzas-posicion-general-heading"
        className="text-heading text-lg font-semibold tracking-tight"
      >
        Posición general
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="surface-card rounded-2xl border border-neutral-200 p-6 dark:border-zinc-800">
          <p className="text-body-muted text-sm font-medium">Posición en pesos</p>
          <div className="mt-2">
            <PosicionMonto centavos={arsCentavos} moneda="ARS" size="lg" />
          </div>
        </div>
        <div className="surface-card rounded-2xl border border-neutral-200 p-6 dark:border-zinc-800">
          <p className="text-body-muted text-sm font-medium">Posición en dólares</p>
          <div className="mt-2">
            <PosicionMonto centavos={usdCentavos} moneda="USD" size="lg" />
          </div>
        </div>
      </div>
    </section>
  )
}
