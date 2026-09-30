import type { FinanzasCuenta, FinanzasMoneda } from '../../services/finanzasApi'
import { EstadoDescubiertoBanco, ResumenBancos } from './EstadoDescubiertoBanco'
import type { PosicionPorBancoRow } from './finanzasAggregates'
import { formatMoneyCentavos } from './formatMoney'

interface PosicionResumenProps {
  arsCentavos: number
  usdCentavos: number
  bancos: PosicionPorBancoRow[]
  cuentas?: FinanzasCuenta[]
  onSelect: (moneda: FinanzasMoneda, bancoNombre: string | null) => void
  onTransferir?: (cuentaOrigenId: string) => void
  /** Solo para quien puede cargar el descubierto; abre el modal de Saldos. */
  onCargarDescubierto?: (cuenta: FinanzasCuenta) => void
}

function cuentaCcEnPesos(cuentas: FinanzasCuenta[], bancoNombre: string): FinanzasCuenta | undefined {
  return cuentas.find(
    (cuenta) => cuenta.bancoNombre === bancoNombre && cuenta.tipo === 'CC' && cuenta.moneda === 'ARS',
  )
}

/** Cómo estás en cada banco, en frases y una tarjeta por banco. Tocar una tarjeta abre el detalle de cuentas. */
export function PosicionResumen({
  usdCentavos,
  bancos,
  cuentas = [],
  onSelect,
  onTransferir,
  onCargarDescubierto,
}: PosicionResumenProps) {
  const bancosResumen = bancos.map((banco) => ({
    banco: banco.bancoNombre,
    saldoCentavos: banco.arsCentavos,
    descubiertoCentavos: banco.descubiertoCentavos,
  }))
  const bancosConDolares = bancos.filter((banco) => banco.usdCentavos !== 0)

  return (
    <section
      aria-labelledby="finanzas-posicion-heading"
      className="surface-card rounded-2xl border border-t-4 border-[#c5d4e4] border-t-[#1e3a5f] bg-gradient-to-b from-[#e8eef5] to-transparent to-40% p-4 dark:border-[#5b8fd4]/30 dark:border-t-[#5b8fd4] dark:from-[#5b8fd4]/10 sm:p-6"
    >
      <h2 id="finanzas-posicion-heading" className="text-heading text-xl font-semibold sm:text-2xl">
        Cómo estás en los bancos
      </h2>

      <ResumenBancos bancos={bancosResumen} className="mt-3" />

      {bancos.length > 0 ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {bancos.map((banco) => {
            const cuentaCc = cuentaCcEnPesos(cuentas, banco.bancoNombre)
            return (
              <EstadoDescubiertoBanco
                key={banco.bancoNombre}
                banco={banco.bancoNombre}
                saldoCentavos={banco.arsCentavos}
                descubiertoCentavos={banco.descubiertoCentavos}
                onAbrir={() => onSelect('ARS', banco.bancoNombre)}
                onTransferir={onTransferir && cuentaCc ? () => onTransferir(cuentaCc.id) : undefined}
                onCargarDescubierto={
                  onCargarDescubierto && cuentaCc ? () => onCargarDescubierto(cuentaCc) : undefined
                }
              />
            )
          })}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => onSelect('USD', null)}
        className="mt-5 -mx-1.5 rounded-lg px-1.5 py-1 text-left text-lg transition hover:bg-neutral-100 dark:hover:bg-zinc-800"
      >
        <span className="text-body-muted">Dólares: </span>
        <span className="text-heading font-semibold tabular-nums">{formatMoneyCentavos(usdCentavos, 'USD')}</span>
        <span className="text-body-muted"> en total</span>
        {bancosConDolares.length > 0 ? (
          <span className="text-body-muted">
            {' '}
            ·{' '}
            {bancosConDolares
              .map((banco) => `${formatMoneyCentavos(banco.usdCentavos, 'USD')} en ${banco.bancoNombre}`)
              .join(', ')}
          </span>
        ) : null}
      </button>

      <p className="text-body-muted mt-3 text-sm leading-snug">
        Tocá un banco para ver sus cuentas, cargar el saldo en dólares o el descubierto.
      </p>
    </section>
  )
}
