import type { PosicionPorBancoRow } from './finanzasAggregates'
import { PosicionMonto } from './PosicionMonto'

const SEMAFORO_ICON = {
  verde: '🟢',
  amarillo: '🟡',
  rojo: '🔴',
} as const

interface BankPositionsSectionProps {
  rows: PosicionPorBancoRow[]
}

export function BankPositionsSection({ rows }: BankPositionsSectionProps) {
  if (rows.length === 0) return null

  return (
    <section aria-labelledby="finanzas-posicion-banco-heading" className="space-y-4">
      <h2
        id="finanzas-posicion-banco-heading"
        className="text-heading text-lg font-semibold tracking-tight"
      >
        Posición por banco
      </h2>
      <ul className="space-y-3">
        {rows.map((row) => (
          <li
            key={row.bancoNombre}
            className="surface-card flex flex-col gap-4 rounded-2xl border border-neutral-200 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800"
          >
            <div className="flex min-w-[8rem] items-center gap-3">
              {row.semaforoCc ? (
                <span className="text-xl leading-none" title="Semáforo de la Cuenta Corriente">
                  {SEMAFORO_ICON[row.semaforoCc]}
                </span>
              ) : (
                <span className="w-6 text-center text-neutral-300 dark:text-zinc-600" aria-hidden>
                  —
                </span>
              )}
              <span className="text-heading text-lg font-semibold">{row.bancoNombre}</span>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-10">
              <div>
                <p className="text-body-muted text-xs font-medium uppercase tracking-wide">
                  Posición en pesos
                </p>
                <div className="mt-1">
                  <PosicionMonto centavos={row.arsCentavos} moneda="ARS" size="md" />
                </div>
              </div>
              <div>
                <p className="text-body-muted text-xs font-medium uppercase tracking-wide">
                  Posición en dólares
                </p>
                <div className="mt-1">
                  <PosicionMonto centavos={row.usdCentavos} moneda="USD" size="md" />
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
