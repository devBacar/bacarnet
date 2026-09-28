import type { FinanzasMoneda } from '../../services/finanzasApi'
import type { PosicionPorBancoRow } from './finanzasAggregates'
import { PosicionMonto } from './PosicionMonto'

const SEMAFORO_ICON = {
  verde: '🟢',
  amarillo: '🟡',
  rojo: '🔴',
} as const

interface BankPositionsSectionProps {
  rows: PosicionPorBancoRow[]
  onSelectPosicion?: (bancoNombre: string, moneda: FinanzasMoneda) => void
}

export function BankPositionsSection({ rows, onSelectPosicion }: BankPositionsSectionProps) {
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
              {onSelectPosicion ? (
                <button
                  type="button"
                  onClick={() => onSelectPosicion(row.bancoNombre, 'ARS')}
                  className="text-heading text-lg font-semibold text-left hover:text-brand-primary"
                >
                  {row.bancoNombre}
                </button>
              ) : (
                <span className="text-heading text-lg font-semibold">{row.bancoNombre}</span>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-10">
              <BancoMontoClickable
                label="Posición en pesos"
                centavos={row.arsCentavos}
                moneda="ARS"
                bancoNombre={row.bancoNombre}
                onSelect={onSelectPosicion}
              />
              <BancoMontoClickable
                label="Posición en dólares"
                centavos={row.usdCentavos}
                moneda="USD"
                bancoNombre={row.bancoNombre}
                onSelect={onSelectPosicion}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function BancoMontoClickable({
  label,
  centavos,
  moneda,
  bancoNombre,
  onSelect,
}: {
  label: string
  centavos: number
  moneda: FinanzasMoneda
  bancoNombre: string
  onSelect?: (bancoNombre: string, moneda: FinanzasMoneda) => void
}) {
  const inner = (
    <>
      <p className="text-body-muted text-xs font-medium uppercase tracking-wide">{label}</p>
      <div className="mt-1">
        <PosicionMonto centavos={centavos} moneda={moneda} size="md" />
      </div>
    </>
  )
  if (!onSelect) return <div>{inner}</div>
  return (
    <button
      type="button"
      onClick={() => onSelect(bancoNombre, moneda)}
      className="rounded-xl p-1 text-left transition hover:bg-neutral-50 dark:hover:bg-zinc-800/70"
    >
      {inner}
    </button>
  )
}
