import type { ReactNode } from 'react'
import type { KpisInversiones as KpisInversionesData } from '../../../services/finanzasInversionesApi'
import { formatMoneyCentavos } from '../formatMoney'

function MontoPorMoneda({ ars, usd }: { ars: number; usd: number }) {
  return (
    <div className="text-heading mt-1 space-y-0.5 text-lg font-bold tabular-nums">
      <p>{formatMoneyCentavos(ars, 'ARS')}</p>
      <p>{formatMoneyCentavos(usd, 'USD')}</p>
    </div>
  )
}

function KpiCard({
  titulo,
  detalle,
  children,
}: {
  titulo: string
  detalle?: string
  children: ReactNode
}) {
  return (
    <div className="surface-card rounded-2xl border border-neutral-200 p-3 dark:border-zinc-800">
      <p className="text-body-muted text-xs font-medium">{titulo}</p>
      {children}
      {detalle ? <p className="text-body-muted mt-1 text-xs">{detalle}</p> : null}
    </div>
  )
}

/** Tarjetas de resumen: capital, a devolver, cuotas cercanas y pendientes de aprobar. */
export function KpisInversiones({ kpis }: { kpis: KpisInversionesData }) {
  const proxCantidad = kpis.proximos30.cantidad
  const proxDetalle =
    proxCantidad === 0
      ? 'Ninguna en los próximos 30 días'
      : proxCantidad === 1
        ? '1 cuota'
        : `${proxCantidad} cuotas`

  return (
    <section aria-label="Resumen de inversiones" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <KpiCard titulo="Capital vigente" detalle="Inversiones en curso">
        <MontoPorMoneda ars={kpis.capitalVigente.ARS} usd={kpis.capitalVigente.USD} />
      </KpiCard>
      <KpiCard titulo="A devolver" detalle="Lo que falta pagar">
        <MontoPorMoneda ars={kpis.aDevolver.ARS} usd={kpis.aDevolver.USD} />
      </KpiCard>
      <KpiCard titulo="Cuotas próximos 30 días" detalle={proxDetalle}>
        <MontoPorMoneda ars={kpis.proximos30.porMoneda.ARS} usd={kpis.proximos30.porMoneda.USD} />
      </KpiCard>
      <KpiCard titulo="Cuotas atrasadas">
        <p className="text-heading mt-1 text-2xl font-bold tabular-nums">{kpis.cuotasAtrasadas}</p>
        <p className="text-body-muted mt-1 text-xs">
          {kpis.cuotasAtrasadas === 0
            ? 'Ninguna atrasada'
            : kpis.cuotasAtrasadas === 1
              ? 'Hay 1 cuota vencida sin pagar'
              : `Hay ${kpis.cuotasAtrasadas} cuotas vencidas sin pagar`}
        </p>
      </KpiCard>
      <KpiCard titulo="Para aprobar">
        <p className="text-heading mt-1 text-2xl font-bold tabular-nums">{kpis.paraAprobar}</p>
        <p className="text-body-muted mt-1 text-xs">
          {kpis.paraAprobar === 0
            ? 'Nada pendiente'
            : kpis.paraAprobar === 1
              ? '1 inversión espera tu OK'
              : `${kpis.paraAprobar} inversiones esperan tu OK`}
        </p>
      </KpiCard>
    </section>
  )
}
