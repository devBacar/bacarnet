import type { FinanzasCuenta, FinanzasMoneda, FinanzasSemaforo } from '../../services/finanzasApi'
import { ETIQUETA_ESTADO_CLASES, estadoDescubierto } from './estadoDescubierto'
import type { PosicionPorBancoRow } from './finanzasAggregates'
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

/** Monto completo en pesos, alineado a la derecha; en rojo si es negativo. */
function Monto({ centavos, moneda = 'ARS' }: { centavos: number; moneda?: FinanzasMoneda }) {
  return (
    <span className={`tabular-nums ${centavos < 0 ? 'text-red-600 dark:text-red-400' : 'text-heading'}`}>
      {formatMoneyCentavos(centavos, moneda)}
    </span>
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
  const celdaNumero = `${celda} text-right`
  const th = 'py-1.5 pr-3 font-medium last:pr-0'
  const td = 'py-1.5 pr-3 align-middle last:pr-0'

  const filas = bancos.map((banco) => ({
    banco,
    estado: estadoDescubierto(banco.arsCentavos, banco.descubiertoCentavos),
  }))
  const totalDescubierto = filas.reduce((suma, fila) => suma + (fila.estado.descubiertoCentavos ?? 0), 0)
  const totalLeQueda = filas.reduce((suma, fila) => suma + Math.max(0, fila.estado.leQuedaCentavos ?? 0), 0)
  const pasados = filas.filter((fila) => fila.estado.clave === 'pasado')

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

      {bancos.length > 0 ? (
        <div className="-mx-4 mt-3 overflow-x-auto px-4">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="text-body-muted border-b border-neutral-100 text-left text-xs dark:border-zinc-800">
                <th className={th}>Banco</th>
                <th className={`${th} text-right`}>Saldo</th>
                <th className={`${th} text-right`} title="Descubierto acordado con el banco">
                  Descubierto
                </th>
                <th className={`${th} text-right`} title="Saldo + descubierto">
                  Le queda para usar
                </th>
                <th className={th}>Estado</th>
                <th className={`${th} text-right`}>Dólares</th>
                {onTransferir ? (
                  <th className={th}>
                    <span className="sr-only">Transferir</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {filas.map(({ banco, estado }) => {
                const cuentaCc = onTransferir ? cuentaCcEnPesos(cuentas, banco.bancoNombre) : undefined
                return (
                  <tr
                    key={banco.bancoNombre}
                    className="border-b border-neutral-100 last:border-b-0 dark:border-zinc-800"
                  >
                    <td className={td}>
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
                    </td>
                    <td className={`${td} text-right`}>
                      <button
                        type="button"
                        onClick={() => onSelect('ARS', banco.bancoNombre)}
                        className={celdaNumero}
                      >
                        <Monto centavos={banco.arsCentavos} />
                      </button>
                    </td>
                    <td className={`${td} text-right`}>
                      {estado.descubiertoCentavos != null ? (
                        <button
                          type="button"
                          onClick={() => onSelect('ARS', banco.bancoNombre)}
                          className={celdaNumero}
                        >
                          <Monto centavos={estado.descubiertoCentavos} />
                        </button>
                      ) : (
                        <span className="text-body-muted" title="Sin descubierto cargado">
                          —
                        </span>
                      )}
                    </td>
                    <td className={`${td} text-right`}>
                      {estado.leQuedaCentavos == null ? (
                        <span className="text-body-muted" title="Sin descubierto cargado">
                          —
                        </span>
                      ) : estado.leQuedaCentavos < 0 ? (
                        <span className="font-medium text-red-600 tabular-nums dark:text-red-400">
                          Pasado {formatMoneyCentavos(estado.excesoCentavos, 'ARS')}
                        </span>
                      ) : (
                        <Monto centavos={estado.leQuedaCentavos} />
                      )}
                    </td>
                    <td className={td}>
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${ETIQUETA_ESTADO_CLASES[estado.tono]}`}
                      >
                        {estado.etiqueta}
                      </span>
                    </td>
                    <td className={`${td} text-right`}>
                      <button
                        type="button"
                        onClick={() => onSelect('USD', banco.bancoNombre)}
                        className={celdaNumero}
                      >
                        <Monto centavos={banco.usdCentavos} moneda="USD" />
                      </button>
                    </td>
                    {onTransferir ? (
                      <td className={`${td} text-right`}>
                        {cuentaCc ? (
                          <button
                            type="button"
                            aria-label={`Transferir desde ${banco.bancoNombre}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#c5d4e4] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1e3a5f] transition hover:bg-[#e8eef5] dark:border-[#5b8fd4]/40 dark:bg-zinc-900 dark:text-[#9dbde8] dark:hover:bg-zinc-800"
                            onClick={() => onTransferir(cuentaCc.id)}
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            Transferir
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-neutral-200 font-semibold dark:border-zinc-700">
                <td className={td}>Total</td>
                <td className={`${td} text-right`}>
                  <Monto centavos={arsCentavos} />
                </td>
                <td className={`${td} text-right`}>
                  {totalDescubierto > 0 ? <Monto centavos={totalDescubierto} /> : <span className="text-body-muted">—</span>}
                </td>
                <td className={`${td} text-right`} title="Suma solo lo que queda para usar en cada banco">
                  {totalDescubierto > 0 ? <Monto centavos={totalLeQueda} /> : <span className="text-body-muted">—</span>}
                </td>
                <td className={td} />
                <td className={`${td} text-right`}>
                  <Monto centavos={usdCentavos} moneda="USD" />
                </td>
                {onTransferir ? <td className={td} /> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}

      {pasados.map(({ banco, estado }) => (
        <p key={banco.bancoNombre} className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">
          {banco.bancoNombre} está pasado {formatMoneyCentavos(estado.excesoCentavos, 'ARS')} de su descubierto.
        </p>
      ))}

      <p className="text-body-muted mt-2 text-[11px] leading-snug">
        Tocá un monto para ver las cuentas, cargar saldos en dólares o el descubierto. «Le queda para usar»
        es el saldo más el descubierto acordado.
      </p>
    </section>
  )
}
