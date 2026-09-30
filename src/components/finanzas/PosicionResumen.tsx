import type { FinanzasCuenta, FinanzasMoneda, FinanzasSemaforo } from '../../services/finanzasApi'
import { computeDisponibleTotal, type PosicionPorBancoRow } from './finanzasAggregates'
import { formatMoneyCentavos } from './formatMoney'
import { PosicionMonto } from './PosicionMonto'
import { ArrowRightLeft } from 'lucide-react'

const SEMAFORO_COLOR: Record<FinanzasSemaforo, string> = {
  verde: 'bg-emerald-500',
  amarillo: 'bg-amber-400',
  rojo: 'bg-red-500',
}

const SEMAFORO_TEXTO: Record<FinanzasSemaforo, string> = {
  verde: 'Descubierto con margen',
  amarillo: 'Descubierto: atención',
  rojo: 'Descubierto superado',
}

interface PosicionResumenProps {
  arsCentavos: number
  usdCentavos: number
  bancos: PosicionPorBancoRow[]
  cuentas?: FinanzasCuenta[]
  onSelect: (moneda: FinanzasMoneda, bancoNombre: string | null) => void
  onTransferir?: (cuentaOrigenId: string) => void
}

function cuentaCcEnPesos(cuentas: FinanzasCuenta[], bancoNombre: string): FinanzasCuenta | undefined {
  return cuentas.find(
    (cuenta) => cuenta.bancoNombre === bancoNombre && cuenta.tipo === 'CC' && cuenta.moneda === 'ARS',
  )
}

/** Posición consolidada y por banco en una sola tarjeta. Cada monto abre el detalle de cuentas. */
export function PosicionResumen({
  arsCentavos,
  usdCentavos,
  bancos,
  cuentas = [],
  onSelect,
  onTransferir,
}: PosicionResumenProps) {
  const celda =
    '-mx-1.5 rounded-lg px-1.5 py-1 text-left transition hover:bg-neutral-100 dark:hover:bg-zinc-800'
  const disponible = computeDisponibleTotal(bancos)
  const hayDescubierto = disponible.descubiertoCentavos > 0

  return (
    <section
      aria-labelledby="finanzas-posicion-heading"
      className="surface-card rounded-2xl border border-t-4 border-[#c5d4e4] border-t-[#1e3a5f] bg-gradient-to-b from-[#e8eef5] to-transparent to-40% p-4 dark:border-[#5b8fd4]/30 dark:border-t-[#5b8fd4] dark:from-[#5b8fd4]/10"
    >
      <h2 id="finanzas-posicion-heading" className="text-heading text-base font-semibold">
        Posición actual
      </h2>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onSelect('ARS', null)} className={celda}>
          <p className="text-body-muted text-xs">Pesos</p>
          <PosicionMonto centavos={arsCentavos} moneda="ARS" size="md" />
        </button>
        <button type="button" onClick={() => onSelect('USD', null)} className={celda}>
          <p className="text-body-muted text-xs">Dólares</p>
          <PosicionMonto centavos={usdCentavos} moneda="USD" size="md" />
        </button>
      </div>

      <div className="mt-2 rounded-xl border border-[#c5d4e4] bg-white/70 px-3 py-2 dark:border-[#5b8fd4]/30 dark:bg-zinc-900/60">
        <p className="text-body-muted text-xs">Disponible en pesos con descubierto</p>
        {hayDescubierto ? (
          <>
            <PosicionMonto centavos={disponible.disponibleCentavos} moneda="ARS" size="md" />
            <p className="text-body-muted text-[11px] leading-snug">
              Saldo {formatMoneyCentavos(arsCentavos, 'ARS')} + acuerdos{' '}
              {formatMoneyCentavos(disponible.descubiertoCentavos, 'ARS')}
              {disponible.bancosSinDescubierto.length > 0
                ? ` · sin descubierto cargado: ${disponible.bancosSinDescubierto.join(', ')}`
                : ''}
            </p>
          </>
        ) : (
          <p className="text-body-muted text-sm">
            Todavía no hay descubiertos cargados. Tocá los pesos de un banco para cargarlo.
          </p>
        )}
      </div>

      {bancos.length > 0 ? (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-body-muted border-b border-neutral-100 text-left text-xs dark:border-zinc-800">
              <th className="py-1.5 font-medium">Banco</th>
              <th className="py-1.5 font-medium">Pesos</th>
              <th className="py-1.5 font-medium" title="Saldo en pesos + descubierto acordado">
                Disponible
              </th>
              <th className="py-1.5 font-medium">Dólares</th>
            </tr>
          </thead>
          <tbody>
            {bancos.map((banco) => {
              const cuentaCc = onTransferir ? cuentaCcEnPesos(cuentas, banco.bancoNombre) : undefined
              return (
              <tr
                key={banco.bancoNombre}
                className="border-b border-neutral-100 last:border-b-0 dark:border-zinc-800"
              >
                <td className="py-1.5 pr-2">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        banco.semaforoCc ? SEMAFORO_COLOR[banco.semaforoCc] : 'bg-neutral-200 dark:bg-zinc-700'
                      }`}
                      title={banco.semaforoCc ? SEMAFORO_TEXTO[banco.semaforoCc] : 'Sin descubierto cargado'}
                      aria-label={banco.semaforoCc ? SEMAFORO_TEXTO[banco.semaforoCc] : 'Sin descubierto cargado'}
                    />
                    {banco.bancoNombre}
                  </span>
                  {cuentaCc && onTransferir ? (
                    <button
                      type="button"
                      aria-label={`Transferir desde ${banco.bancoNombre}`}
                      className="mt-1 inline-flex items-center gap-1 rounded-md border border-neutral-200 px-1.5 py-0.5 text-[11px] font-medium text-neutral-800 hover:bg-neutral-50 dark:border-zinc-700 dark:text-gray-100 dark:hover:bg-zinc-800"
                      onClick={() => onTransferir(cuentaCc.id)}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="hidden sm:inline">Transferir</span>
                    </button>
                  ) : null}
                </td>
                <td className="py-1.5 pr-2">
                  <button
                    type="button"
                    onClick={() => onSelect('ARS', banco.bancoNombre)}
                    className={celda}
                  >
                    <PosicionMonto centavos={banco.arsCentavos} moneda="ARS" size="sm" />
                  </button>
                </td>
                <td className="py-1.5 pr-2">
                  {banco.disponibleCentavos != null && banco.descubiertoCentavos != null ? (
                    <button
                      type="button"
                      onClick={() => onSelect('ARS', banco.bancoNombre)}
                      className={celda}
                    >
                      <PosicionMonto centavos={banco.disponibleCentavos} moneda="ARS" size="sm" />
                      <span className="text-body-muted block text-[11px]">
                        de {formatMoneyCentavos(banco.descubiertoCentavos, 'ARS')}
                      </span>
                    </button>
                  ) : (
                    <span className="text-body-muted text-xs" title="Sin descubierto cargado">
                      —
                    </span>
                  )}
                </td>
                <td className="py-1.5">
                  <button
                    type="button"
                    onClick={() => onSelect('USD', banco.bancoNombre)}
                    className={celda}
                  >
                    <PosicionMonto centavos={banco.usdCentavos} moneda="USD" size="sm" />
                  </button>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      ) : null}

      <p className="text-body-muted mt-2 text-[11px] leading-snug">
        Tocá un monto para ver las cuentas, cargar saldos en dólares o el descubierto. «Disponible»
        es el saldo más el descubierto acordado: lo que todavía se puede usar. El punto de color
        indica cuánto descubierto queda: verde con margen, amarillo atención, rojo superado.
      </p>
    </section>
  )
}
