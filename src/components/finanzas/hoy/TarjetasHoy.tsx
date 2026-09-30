import type { ReactNode } from 'react'
import { formatMoneyCentavos } from '../formatMoney'
import type { HoyResponse, IngresoHoy, PagoHoy } from '../../../services/finanzasHoyApi'
import { TEXTO_CHEQUE_PROXIMAMENTE } from './pagoConCheque'

function Tarjeta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
      <h2 className="text-heading text-xl font-semibold sm:text-2xl">{titulo}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Monto({ centavos, grande = false }: { centavos: number; grande?: boolean }) {
  const negativo = centavos < 0
  return (
    <span
      className={`font-semibold tabular-nums ${grande ? 'text-2xl' : 'text-lg'} ${
        negativo ? 'text-red-700 dark:text-red-300' : 'text-heading'
      }`}
    >
      {formatMoneyCentavos(centavos, 'ARS')}
    </span>
  )
}

const botonPagar =
  'min-h-12 rounded-xl bg-brand-primary px-4 text-base font-semibold text-white'
const botonChico =
  'min-h-11 rounded-xl border border-neutral-300 px-3 text-sm font-medium dark:border-zinc-600'

export function TarjetaPagos({
  pagos,
  onPagar,
  onYaPague,
  onReprogramar,
}: {
  pagos: HoyResponse['pagos']
  onPagar: (pago: PagoHoy) => void
  onYaPague: (pago: PagoHoy) => void
  onReprogramar: (pago: PagoHoy) => void
}) {
  if (pagos.filas.length === 0) return null
  return (
    <Tarjeta titulo="Hoy tenés que pagar esto">
      <div className="text-body-muted hidden gap-3 border-b border-neutral-200 pb-2 text-sm font-medium sm:grid sm:grid-cols-[6rem_1fr_1fr_auto_9rem] dark:border-zinc-800">
        <span>Urgencia</span>
        <span>A quién</span>
        <span>Concepto</span>
        <span>Monto</span>
        <span>Cómo estaba previsto pagar</span>
      </div>
      <ul className="divide-y divide-neutral-200 dark:divide-zinc-800">
        {pagos.filas.map((pago) => (
          <li key={pago.id} className={`py-4 ${pago.vencido ? 'text-red-800 dark:text-red-200' : ''}`}>
            {pago.vencidoTexto ? (
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">{pago.vencidoTexto}</p>
            ) : null}
            <div className="mt-1 grid gap-3 sm:grid-cols-[6rem_1fr_1fr_auto_9rem] sm:items-center">
              <div>
                <p className="text-body-muted text-xs sm:hidden">Urgencia</p>
                <p className="font-medium">{pago.urgencia}</p>
              </div>
              <div>
                <p className="text-body-muted text-xs sm:hidden">A quién</p>
                <p className="text-lg font-semibold">{pago.aQuien}</p>
              </div>
              <div>
                <p className="text-body-muted text-xs sm:hidden">Concepto</p>
                <p>{pago.concepto}</p>
              </div>
              <div>
                <p className="text-body-muted text-xs sm:hidden">Monto</p>
                <Monto centavos={pago.montoCentavos} grande />
              </div>
              <div>
                <p className="text-body-muted text-xs sm:hidden">Cómo estaba previsto pagar</p>
                <p>{pago.comoPagar}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button type="button" className={botonPagar} onClick={() => onPagar(pago)}>
                Pagar
              </button>
              <button type="button" className={botonChico} onClick={() => onYaPague(pago)}>
                Ya lo pagué
              </button>
              <button type="button" className={botonChico} onClick={() => onReprogramar(pago)}>
                Pasarlo para otro día
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-baseline justify-between gap-3 border-t border-neutral-200 pt-4 text-lg dark:border-zinc-800">
        <span className="font-medium">Total</span>
        <Monto centavos={pagos.totalCentavos} grande />
      </p>
    </Tarjeta>
  )
}

export function TarjetaIngresos({
  ingresos,
  confirmandoId,
  onConfirmar,
  onEfectivo,
  onReprogramar,
  onReclamar,
}: {
  ingresos: IngresoHoy[]
  confirmandoId: string | null
  onConfirmar: (ingreso: IngresoHoy) => void
  onEfectivo: (ingreso: IngresoHoy) => void
  onReprogramar: (ingreso: IngresoHoy) => void
  onReclamar: (ingreso: IngresoHoy) => void
}) {
  if (ingresos.length === 0) return null
  return (
    <Tarjeta titulo="Hoy se esperan estos ingresos">
      <ul className="divide-y divide-neutral-200 dark:divide-zinc-800">
        {ingresos.map((ingreso) => (
          <li key={ingreso.id} className="py-4">
            {ingreso.atrasadoTexto ? (
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">{ingreso.atrasadoTexto}</p>
            ) : null}
            <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">{ingreso.cliente}</p>
                <p>{ingreso.concepto}</p>
              </div>
              <Monto centavos={ingreso.montoCentavos} grande />
            </div>
            {ingreso.llego ? (
              <p className="mt-2 text-base font-semibold text-emerald-800 dark:text-emerald-200">
                Llegó ✓ a {ingreso.bancoNombre}
              </p>
            ) : (
              <p className="text-body-muted mt-2 text-base">Todavía no llegó</p>
            )}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {ingreso.llego && ingreso.movimientoId ? (
                <button
                  type="button"
                  className={botonPagar}
                  disabled={confirmandoId === ingreso.id}
                  onClick={() => onConfirmar(ingreso)}
                >
                  {confirmandoId === ingreso.id ? 'Confirmando…' : 'Confirmar'}
                </button>
              ) : null}
              {!ingreso.llego ? (
                <>
                  <button type="button" className={botonPagar} onClick={() => onEfectivo(ingreso)}>
                    Llegó en efectivo
                  </button>
                  <button type="button" className={botonChico} onClick={() => onReprogramar(ingreso)}>
                    Cambiar la fecha
                  </button>
                  <button type="button" className={botonChico} onClick={() => onReclamar(ingreso)}>
                    Reclamar
                  </button>
                  <button type="button" className={`${botonChico} text-left`} disabled>
                    Llegó con cheque. {TEXTO_CHEQUE_PROXIMAMENTE}
                  </button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Tarjeta>
  )
}

export function TarjetaDia({ dia }: { dia: HoyResponse['dia'] }) {
  return (
    <Tarjeta titulo="Así va a quedar el día">
      <p className="text-heading text-xl font-semibold leading-snug sm:text-2xl">{dia.frase}</p>
      {dia.avisoDescubierto ? (
        <p className="mt-4 rounded-xl border border-red-300 bg-red-50 px-3 py-3 text-base font-medium text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
          {dia.avisoDescubierto}
        </p>
      ) : null}
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm sm:text-base">
          <thead>
            <tr className="text-body-muted border-b border-neutral-200 dark:border-zinc-800">
              <th className="py-2 pr-3 font-medium">Banco</th>
              <th className="py-2 pr-3 font-medium">Saldo ahora</th>
              <th className="py-2 pr-3 font-medium">Descubierto acordado</th>
              <th className="py-2 font-medium">Le queda para usar</th>
            </tr>
          </thead>
          <tbody>
            {dia.bancos.map((banco) => (
              <tr key={banco.bancoNombre} className="border-b border-neutral-100 dark:border-zinc-800">
                <td className="py-3 pr-3 font-semibold">{banco.bancoNombre}</td>
                <td className="py-3 pr-3">
                  <Monto centavos={banco.saldoAhoraCentavos} />
                </td>
                <td className="py-3 pr-3">
                  {banco.descubiertoCentavos == null ? (
                    'Sin acuerdo'
                  ) : (
                    <Monto centavos={banco.descubiertoCentavos} />
                  )}
                </td>
                <td className="py-3">
                  <Monto centavos={banco.quedaParaUsarCentavos} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  )
}

function ChequesADebitar({ cheques }: { cheques: HoyResponse['prevision']['chequesADebitar'] }) {
  return (
    <div>
      <h3 className="text-lg font-semibold">Mañana se debitan estos cheques</h3>
      <p className="text-body-muted mt-2 text-base">
        Los cheques nuestros que se debitan mañana, y los de hoy que todavía no figuran debitados.
      </p>
      {cheques.filas.length === 0 ? (
        <p className="mt-3 text-lg">Mañana no se debita ningún cheque.</p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-neutral-200 sm:hidden dark:divide-zinc-800">
            {cheques.filas.map((fila) => (
              <li key={fila.id} className="py-3">
                <p className="text-lg font-semibold">N.º {fila.numero}</p>
                <p className="text-sm">{fila.cuando}</p>
                <p className="mt-1">A quién: {fila.destinatario}</p>
                <p>Banco: {fila.banco}</p>
                <p className="mt-1">
                  Monto: <Monto centavos={fila.montoCentavos} />
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-3 hidden overflow-x-auto sm:block">
            <table className="min-w-full text-left text-sm sm:text-base">
              <thead>
                <tr className="text-body-muted border-b border-neutral-200 dark:border-zinc-800">
                  <th className="py-2 pr-3 font-medium">N.º</th>
                  <th className="py-2 pr-3 font-medium">A quién</th>
                  <th className="py-2 pr-3 font-medium">Banco</th>
                  <th className="py-2 font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {cheques.filas.map((fila) => (
                  <tr key={fila.id} className="border-b border-neutral-100 dark:border-zinc-800">
                    <td className="py-3 pr-3 font-semibold">
                      {fila.numero}
                      <span className="text-body-muted block text-sm font-normal">{fila.cuando}</span>
                    </td>
                    <td className="py-3 pr-3">{fila.destinatario}</td>
                    <td className="py-3 pr-3">{fila.banco}</td>
                    <td className="py-3">
                      <Monto centavos={fila.montoCentavos} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="py-3 pr-3 font-semibold" colSpan={3}>
                    Total
                  </td>
                  <td className="py-3">
                    <Monto centavos={cheques.totalCentavos} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-3 flex items-baseline justify-between gap-3 border-t border-neutral-200 pt-3 text-lg sm:hidden dark:border-zinc-800">
            <span className="font-medium">Total</span>
            <Monto centavos={cheques.totalCentavos} grande />
          </p>
          {cheques.impactos.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {cheques.impactos.map((texto) => (
                <p
                  key={texto}
                  className={
                    texto.startsWith('Ojo')
                      ? 'rounded-xl border border-red-300 bg-red-50 px-3 py-3 text-base font-medium text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100'
                      : 'rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-base font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100'
                  }
                >
                  {texto}
                </p>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

export function TarjetaPrevision({
  prevision,
  onReclamar,
}: {
  prevision: HoyResponse['prevision']
  onReclamar: (cobro: HoyResponse['prevision']['cobrosAtrasados'][number]) => void
}) {
  const haySemana = prevision.semana != null
  const hayAtrasados = prevision.cobrosAtrasados.length > 0
  const hayFirmas = prevision.firmas != null
  if (!haySemana && !hayAtrasados && !hayFirmas) {
    return (
      <Tarjeta titulo="Para organizarte">
        <ChequesADebitar cheques={prevision.chequesADebitar} />
      </Tarjeta>
    )
  }
  return (
    <Tarjeta titulo="Para organizarte">
      <div className="grid gap-6">
        {haySemana && prevision.semana ? (
          <div>
            <h3 className="text-lg font-semibold">Esta semana</h3>
            {prevision.diaMasPesado ? (
              <p className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                {prevision.diaMasPesado}
              </p>
            ) : null}
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm sm:text-base">
                <thead>
                  <tr className="text-body-muted border-b border-neutral-200 dark:border-zinc-800">
                    <th className="py-2 pr-3 font-medium">Día</th>
                    <th className="py-2 pr-3 font-medium">A pagar</th>
                    <th className="py-2 pr-3 font-medium">A cobrar</th>
                    <th className="py-2 font-medium">Cómo queda el día</th>
                  </tr>
                </thead>
                <tbody>
                  {prevision.semana.map((fila) => (
                    <tr
                      key={fila.fecha}
                      className={`border-b border-neutral-100 dark:border-zinc-800 ${
                        fila.esElMasPesado ? 'bg-amber-50 dark:bg-amber-950/30' : ''
                      }`}
                    >
                      <td className="py-3 pr-3 font-medium">{fila.dia}</td>
                      <td className="py-3 pr-3">
                        <Monto centavos={fila.aPagarCentavos} />
                      </td>
                      <td className="py-3 pr-3">
                        <Monto centavos={fila.aCobrarCentavos} />
                      </td>
                      <td className="py-3">
                        <Monto centavos={fila.quedaCentavos} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
        {hayAtrasados ? (
          <div>
            <h3 className="text-lg font-semibold">Cobros atrasados</h3>
            <ul className="mt-2 divide-y divide-neutral-200 dark:divide-zinc-800">
              {prevision.cobrosAtrasados.map((cobro) => (
                <li key={cobro.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{cobro.cliente}</p>
                    <p className="text-sm">{cobro.concepto}</p>
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">{cobro.haceTexto}</p>
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <Monto centavos={cobro.montoCentavos} />
                    <button type="button" className={botonChico} onClick={() => onReclamar(cobro)}>
                      Reclamar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {hayFirmas && prevision.firmas ? (
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-base font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            {prevision.firmas.texto}
          </p>
        ) : null}
        <ChequesADebitar cheques={prevision.chequesADebitar} />
      </div>
    </Tarjeta>
  )
}
