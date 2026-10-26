import type { CuotaDetalle, InversionDetalle } from '../../../services/finanzasInversionesApi'
import { formatMoneyCentavos } from '../formatMoney'
import { ABIERTAS, formatFecha, mesesConRetencionRepetida, TEXTO_CUOTA } from './detalleShared'

export function DetalleCuotas({
  d,
  onPagar,
  onCuotaPesos,
}: {
  d: InversionDetalle
  onPagar: (c: CuotaDetalle) => void
  onCuotaPesos: (c: CuotaDetalle) => void
}) {
  const moneda = d.condiciones.moneda
  const mesesRepetidos = mesesConRetencionRepetida(d)

  return (
    <section>
      {mesesRepetidos.length > 0 ? (
        <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Hay dos o más cuotas con retención en el mismo mes ({mesesRepetidos.join(', ')}). La retención de
          Ganancias se calcula por cuota: revisala con el contador.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-zinc-950/80">
            <tr>
              <th className="px-3 py-2 text-left font-medium">N°</th>
              <th className="px-3 py-2 text-left font-medium">Fecha</th>
              <th className="px-3 py-2 text-left font-medium">Estado</th>
              <th className="px-3 py-2 text-right font-medium">A pagar</th>
              <th className="px-3 py-2 text-right font-medium">Pagado</th>
              <th className="px-3 py-2 text-right font-medium">Restante</th>
              <th className="px-3 py-2 text-right font-medium">Retención</th>
              <th className="px-3 py-2 text-left font-medium">Cómo se pagó</th>
              <th className="px-3 py-2 text-left font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
            {d.cronograma.map((c) => {
              const abierta = ABIERTAS.has(c.estado) && c.compromisoId
              return (
                <tr key={c.numero}>
                  <td className="px-3 py-2 tabular-nums">{c.numero}</td>
                  <td className="px-3 py-2">{formatFecha(c.fechaVencimiento)}</td>
                  <td className="px-3 py-2">{TEXTO_CUOTA[c.estado]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoneyCentavos(c.aPagarCentavos, c.monedaPago)}
                    {c.monedaPago !== moneda ? (
                      <span className="text-body-muted block text-xs">en {c.monedaPago}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoneyCentavos(c.pagadoCentavos, c.monedaPago)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoneyCentavos(c.restanteCentavos, c.monedaPago)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {c.retencionCentavos > 0 ? formatMoneyCentavos(c.retencionCentavos, moneda) : '—'}
                  </td>
                  <td className="px-3 py-2">{c.comoSePago ?? '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {abierta ? (
                        <button
                          type="button"
                          onClick={() => onPagar(c)}
                          className="rounded-lg bg-brand-primary px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
                        >
                          Pagar
                        </button>
                      ) : null}
                      {moneda === 'USD' && ABIERTAS.has(c.estado) ? (
                        <button
                          type="button"
                          onClick={() => onCuotaPesos(c)}
                          className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                          {c.enPesos ? 'Tipo de cambio' : 'Pagar en pesos'}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {d.cronograma.length === 0 ? (
          <p className="text-body-muted px-4 py-6 text-center text-sm">No hay cuotas en el cronograma.</p>
        ) : null}
      </div>
      <p className="text-body-muted mt-2 text-sm tabular-nums">
        Totales · capital {formatMoneyCentavos(d.totales.capitalCentavos, moneda)} · interés{' '}
        {formatMoneyCentavos(d.totales.interesCentavos, moneda)} · total{' '}
        {formatMoneyCentavos(d.totales.totalCentavos, moneda)}
      </p>
    </section>
  )
}
