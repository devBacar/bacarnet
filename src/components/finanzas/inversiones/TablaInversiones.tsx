import { useNavigate } from 'react-router-dom'
import type { InversionResumen } from '../../../services/finanzasInversionesApi'
import { formatMoneyCentavos } from '../formatMoney'
import { textoEstado } from './textosInversiones'

function formatFecha(ymd: string | null | undefined): string {
  if (!ymd) return '—'
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${d}/${m}/${y}`
}

function AlertasCelda({ row }: { row: InversionResumen }) {
  const partes: string[] = []
  if (row.alertas.cuotasAtrasadas > 0) {
    partes.push(
      row.alertas.cuotasAtrasadas === 1
        ? '1 atrasada'
        : `${row.alertas.cuotasAtrasadas} atrasadas`,
    )
  }
  if (row.alertas.porVencer) {
    const dias = row.alertas.diasParaVencer
    if (dias == null) partes.push('Por vencer')
    else if (dias === 0) partes.push('Vence hoy')
    else if (dias === 1) partes.push('Vence mañana')
    else partes.push(`Vence en ${dias} días`)
  }
  if (partes.length === 0) return <span className="text-body-muted">—</span>
  return (
    <span className="inline-flex flex-wrap gap-1">
      {partes.map((p) => (
        <span
          key={p}
          className="inline-block rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          {p}
        </span>
      ))}
    </span>
  )
}

export function TablaInversiones({
  filas,
  vacio,
}: {
  filas: InversionResumen[]
  /** Texto cuando no hay filas. */
  vacio: string
}) {
  const navigate = useNavigate()

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-300 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <table className="min-w-full text-sm">
        <thead className="border-b border-[var(--color-primary-muted)] bg-brand-primary-light text-brand-primary">
          <tr>
            <th className="px-3 py-3 text-left font-medium">Número</th>
            <th className="px-3 py-3 text-left font-medium">Inversor</th>
            <th className="px-3 py-3 text-left font-medium">Estado</th>
            <th className="px-3 py-3 text-left font-medium">Moneda</th>
            <th className="px-3 py-3 text-left font-medium">Capital</th>
            <th className="px-3 py-3 text-left font-medium">Deuda hoy</th>
            <th className="px-3 py-3 text-left font-medium">Próxima cuota</th>
            <th className="px-3 py-3 text-left font-medium">Alertas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
          {filas.map((row) => {
            const moneda = row.moneda === 'USD' ? 'USD' : 'ARS'
            const prox = row.alertas.proximaCuota
            return (
              <tr
                key={row.id}
                role="link"
                tabIndex={0}
                className="cursor-pointer bg-white hover:bg-neutral-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/80"
                onClick={() => navigate(`/finanzas/inversiones/${row.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    navigate(`/finanzas/inversiones/${row.id}`)
                  }
                }}
              >
                <td className="px-3 py-3 font-medium tabular-nums">{row.numero}</td>
                <td className="px-3 py-3">{row.inversorNombre}</td>
                <td className="px-3 py-3">{textoEstado(row.estado)}</td>
                <td className="px-3 py-3">{moneda === 'USD' ? 'Dólares' : 'Pesos'}</td>
                <td className="px-3 py-3 tabular-nums">
                  {formatMoneyCentavos(row.capitalCentavos, moneda)}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {formatMoneyCentavos(row.deudaHoyCentavos, moneda)}
                </td>
                <td className="px-3 py-3">
                  {prox ? (
                    <>
                      <span className="block">{formatFecha(prox.fecha)}</span>
                      <span className="text-body-muted text-xs tabular-nums">
                        {formatMoneyCentavos(prox.montoCentavos, moneda)}
                      </span>
                    </>
                  ) : (
                    <span className="text-body-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <AlertasCelda row={row} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {filas.length === 0 ? (
        <p className="text-body-muted px-4 py-8 text-center text-sm">{vacio}</p>
      ) : null}
    </div>
  )
}
