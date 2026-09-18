import type { FinanzasCuenta } from '../../services/finanzasApi'
import { PosicionMonto } from './PosicionMonto'
import { formatMoneyCentavos } from './formatMoney'

const SEMAFORO_LABEL = {
  verde: '🟢',
  amarillo: '🟡',
  rojo: '🔴',
} as const

interface AccountCardProps {
  cuenta: FinanzasCuenta
  /** false cuando la tarjeta va dentro de un grupo por banco */
  showBancoName?: boolean
}

function semaforoTexto(semaforo: keyof typeof SEMAFORO_LABEL): string {
  if (semaforo === 'verde') return 'Con margen'
  if (semaforo === 'amarillo') return 'Atención'
  return 'Superado'
}

export function AccountCard({ cuenta, showBancoName = false }: AccountCardProps) {
  const esCC = cuenta.tipo === 'CC'
  const semaforo = cuenta.descubierto?.semaforo

  return (
    <article className="surface-card flex flex-col gap-4 rounded-2xl border border-neutral-200 p-5 dark:border-zinc-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {showBancoName ? (
            <h3 className="text-heading text-lg font-semibold">{cuenta.bancoNombre}</h3>
          ) : null}
          <p className={`text-body-muted text-sm ${showBancoName ? 'mt-0.5' : ''}`}>
            <span className="text-heading font-medium">{cuenta.tipo}</span>
            <span className="mx-1.5 text-neutral-300 dark:text-zinc-600">·</span>
            {cuenta.tipoLabel}
          </p>
        </div>
        {esCC && semaforo ? (
          <div className="flex items-center gap-2 text-sm" title={semaforoTexto(semaforo)}>
            <span className="text-xl leading-none" aria-hidden>
              {SEMAFORO_LABEL[semaforo]}
            </span>
            <span className="text-body-muted hidden sm:inline">Semáforo</span>
          </div>
        ) : null}
      </div>

      <div>
        <p className="text-body-muted text-xs font-medium uppercase tracking-wide">Saldo actual</p>
        <div className="mt-1">
          <PosicionMonto centavos={cuenta.saldoActualCentavos} moneda={cuenta.moneda} size="md" />
        </div>
      </div>

      {esCC ? (
        <dl className="grid gap-3 border-t border-neutral-100 pt-4 text-sm dark:border-zinc-800">
          <div className="flex justify-between gap-4">
            <dt className="text-body-muted">Descubierto</dt>
            <dd className="text-heading font-medium tabular-nums">
              {cuenta.descubiertoCentavos != null
                ? formatMoneyCentavos(cuenta.descubiertoCentavos, 'ARS')
                : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-body-muted">% del descubierto usado</dt>
            <dd className="text-heading font-medium tabular-nums">
              {cuenta.descubierto?.porcentajeUsado != null
                ? `${cuenta.descubierto.porcentajeUsado} %`
                : '—'}
              {cuenta.descubierto?.superado ? (
                <span className="ml-2 text-red-600 dark:text-red-400">(superado)</span>
              ) : null}
            </dd>
          </div>
        </dl>
      ) : null}
    </article>
  )
}
