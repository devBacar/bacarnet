import type { InversionDetalle } from '../../../services/finanzasInversionesApi'
import { formatMoneyCentavos } from '../formatMoney'
import { formatFecha } from './detalleShared'

export function DetalleHistorial({ d }: { d: InversionDetalle }) {
  const moneda = d.condiciones.moneda
  const planilla = d.historialPlanilla ?? []

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-heading text-sm font-semibold">Historial de cambios</h2>
        {d.historial.length === 0 ? (
          <p className="text-body-muted mt-2 text-sm">Sin cambios registrados.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {d.historial.map((h, i) => (
              <li
                key={`${h.fecha}-${i}`}
                className="rounded-xl border border-neutral-200 px-3 py-2 dark:border-zinc-800"
              >
                <p className="font-medium">
                  {h.estadoAnterior ? `${h.estadoAnterior} → ${h.estadoNuevo}` : h.estadoNuevo}
                </p>
                <p className="text-body-muted text-xs">
                  {new Date(h.fecha).toLocaleString('es-AR')} · {h.usuarioNombre ?? h.usuario}
                </p>
                {h.nota ? <p className="mt-1">{h.nota}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {planilla.length > 0 ? (
        <section>
          <h2 className="text-heading text-sm font-semibold">
            Pagos de antes, según la planilla de compromisos
          </h2>
          <div className="mt-2 overflow-x-auto rounded-2xl border border-neutral-200 dark:border-zinc-800">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-zinc-950/80">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Mes</th>
                  <th className="px-3 py-2 text-left font-medium">Fecha</th>
                  <th className="px-3 py-2 text-right font-medium">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
                {planilla.map((p, i) => (
                  <tr key={`${p.mes}-${p.fecha}-${i}`}>
                    <td className="px-3 py-2">{p.mes}</td>
                    <td className="px-3 py-2">{formatFecha(p.fecha)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoneyCentavos(p.montoCentavos, moneda)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
