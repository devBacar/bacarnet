import { type ReactNode, useState, useEffect } from 'react'
import {
  type CuentaCompleta,
  type KpisMoneda,
  type EstadoCuotaCalendario,
  type MesCalendario,
  type MovimientoCuenta,
  type CapitalSinIngresar,
  type DocumentoDeCuenta,
  type MonedaInversion,
  type MonedaCuenta,
} from '../../../services/finanzasInversionesApi'
import { formatMoneyCentavos } from '../formatMoney'
import { TEXTOS_FICHA, TEXTO_ESTADO_CUOTA_CALENDARIO } from './textosInversiones'

// Reusing helper from DetalleInversion.tsx / FichaInversorModal.tsx
function formatFecha(ymd: string | null | undefined): string {
  if (!ymd) return '—'
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${d}/${m}/${y}`
}

// Custom KpiCard for CuentaPanel to allow className for conditional styling
function KpiCard({ titulo, detalle, children, className }: { titulo: string; detalle?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`surface-card rounded-2xl border p-4 ${className ?? 'border-neutral-200 dark:border-zinc-800'}`}>
      <p className="text-body-muted text-base font-medium leading-snug">{titulo}</p>
      <div className="text-heading mt-2 text-xl font-bold tabular-nums sm:text-2xl">{children}</div>
      {detalle ? <p className="text-body-muted mt-1 text-xs">{detalle}</p> : null}
    </div>
  )
}

// Reusing helper from FichaInversorModal.tsx
function claseEstadoCuota(estado: EstadoCuotaCalendario): string {
  switch (estado) {
    case 'pagada':
      return 'font-semibold text-emerald-700 dark:text-emerald-300'
    case 'vencida':
      return 'font-semibold text-red-700 dark:text-red-300'
    case 'pendiente':
      return 'font-semibold text-sky-800 dark:text-sky-300'
  }
}

// Helper for MovimientoCuenta tipo
const TEXTO_TIPO_MOVIMIENTO: Record<MovimientoCuenta['tipo'], string> = {
  ingreso_capital: 'Ingreso de capital',
  cuota_pagada: 'Cuota pagada',
  cuota_parcial: 'Pago parcial',
}

export function CuentaPanel({
  cuenta,
  general,
  onVerInversion,
  onAbrirDocumento,
}: {
  cuenta: CuentaCompleta
  general: boolean
  onVerInversion: (id: string) => void
  onAbrirDocumento?: (inversionId: string, docId: string) => void
}) {
  const mesActual = cuenta.hoy.slice(0, 7)

  const [mostrarMesesAnteriores, setMostrarMesesAnteriores] = useState(false)
  const [movimientosVisibles, setMovimientosVisibles] = useState(20)

  const calendarioVisible = mostrarMesesAnteriores
    ? cuenta.calendario
    : cuenta.calendario.filter((m) => m.mes >= mesActual)

  const [abiertosCalendario, setAbiertosCalendario] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const m of cuenta.calendario) {
      init[m.mes] = m.mes >= mesActual
    }
    return init
  })

  useEffect(() => {
    setAbiertosCalendario((prev) => {
      const next = { ...prev }
      for (const m of cuenta.calendario) {
        if (next[m.mes] === undefined) next[m.mes] = m.mes >= mesActual
      }
      return next
    })
  }, [cuenta.calendario, mesActual])

  return (
    <div className="space-y-8 pr-6">
      {/* a. KPIs */}
      {cuenta.kpisPorMoneda.length > 0 ? (
        <section aria-label="KPIs de Inversiones" className="space-y-6">
          {cuenta.kpisPorMoneda.map((kpis) => (
            <div key={kpis.moneda}>
              <h2 className="text-heading text-xl font-bold sm:text-2xl">
                {kpis.moneda === 'ARS' ? 'En pesos' : 'En dólares'}
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <KpiCard titulo="Falta pagar" detalle={`${kpis.cuotasPendientes} cuotas pendientes`}>
                  {formatMoneyCentavos(kpis.aPagarTotalCentavos, kpis.moneda)}
                </KpiCard>
                <KpiCard titulo="Ya pagado">
                  {formatMoneyCentavos(kpis.pagadoCentavos, kpis.moneda)}
                </KpiCard>
                <KpiCard titulo="Intereses pagados">
                  {formatMoneyCentavos(kpis.interesesPagadosCentavos, kpis.moneda)}
                </KpiCard>
                <KpiCard titulo="Intereses por pagar">
                  {formatMoneyCentavos(kpis.interesesAPagarCentavos, kpis.moneda)}
                </KpiCard>
                <KpiCard titulo="Próximos 30 días">
                  {formatMoneyCentavos(kpis.proximos30Centavos, kpis.moneda)}
                </KpiCard>
                <KpiCard
                  titulo="Atrasado"
                  className={kpis.atrasado.cantidad > 0 ? 'border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950 dark:text-red-100' : ''}
                  detalle={kpis.atrasado.cantidad > 0 ? `${kpis.atrasado.cantidad} cuotas atrasadas` : 'Nada atrasado'}
                >
                  {formatMoneyCentavos(kpis.atrasado.montoCentavos, kpis.moneda)}
                </KpiCard>
                <KpiCard
                  titulo="Retenciones Ganancias"
                  detalle={`${formatMoneyCentavos(kpis.retencionesAnioCentavos, kpis.moneda)} en el año`}
                >
                  {formatMoneyCentavos(kpis.retencionesARetenerCentavos, kpis.moneda)} a retener
                </KpiCard>
                <KpiCard titulo="Capital vigente">
                  {formatMoneyCentavos(kpis.capitalVigenteCentavos, kpis.moneda)}
                </KpiCard>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {/* b. Capital aprobado que todavía no entró */}
      {cuenta.capitalSinIngresar.length > 0 ? (
        <section aria-label="Capital aprobado sin ingresar" className="space-y-3">
          <h2 className="text-heading text-lg font-semibold sm:text-xl">Capital aprobado que todavía no entró</h2>
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-zinc-800">
            <table className="min-w-full text-base">
              <thead className="bg-neutral-50 dark:bg-zinc-950/80">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Inversión</th>
                  {general ? <th className="px-4 py-3 text-left font-medium">Persona</th> : null}
                  <th className="px-4 py-3 text-right font-medium">Falta ingresar</th>
                  <th className="px-4 py-3 text-left font-medium"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
                {cuenta.capitalSinIngresar.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-medium">{item.numero}</td>
                    {general ? <td className="px-4 py-3">{item.inversorNombre}</td> : null}
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoneyCentavos(item.faltaCentavos, item.moneda)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onVerInversion(item.id)}
                        className="rounded-xl border border-neutral-200 px-3 py-2 text-base font-medium hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        Ver inversión
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* c. Contratos que terminan en los próximos 60 días */}
      {cuenta.vencimientosContrato.length > 0 ? (
        <section aria-label="Vencimientos de contratos" className="space-y-3">
          <h2 className="text-heading text-lg font-semibold sm:text-xl">Contratos que terminan en los próximos 60 días</h2>
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-zinc-800">
            <table className="min-w-full text-base">
              <thead className="bg-neutral-50 dark:bg-zinc-950/80">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Inversión</th>
                  <th className="px-4 py-3 text-left font-medium">Fecha de fin</th>
                  <th className="px-4 py-3 text-right font-medium">Capital</th>
                  <th className="px-4 py-3 text-left font-medium"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
                {cuenta.vencimientosContrato.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-medium">{item.numero}</td>
                    <td className="px-4 py-3 tabular-nums">{formatFecha(item.fechaFinal)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoneyCentavos(item.capitalCentavos, item.moneda)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onVerInversion(item.id)}
                        className="rounded-xl border border-neutral-200 px-3 py-2 text-base font-medium hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        Ver inversión
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* d. Calendario de pagos */}
      <section aria-label="Calendario de pagos" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-heading text-lg font-semibold sm:text-xl">Calendario de pagos</h2>
          {cuenta.calendario.length > 0 && (
            <button
              type="button"
              onClick={() => setMostrarMesesAnteriores((prev) => !prev)}
              className="rounded-xl border border-neutral-200 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {mostrarMesesAnteriores ? 'Ocultar meses anteriores' : 'Ver meses anteriores'}
            </button>
          )}
        </div>
        {cuenta.calendario.length === 0 ? (
          <p className="text-body-muted text-base">No hay cuotas programadas.</p>
        ) : (
          <ul className="space-y-3">
            {calendarioVisible.map((m) => {
              const abierto = abiertosCalendario[m.mes] ?? m.mes >= mesActual
              const esActual = m.mes === mesActual
              return (
                <li
                  key={m.mes}
                  className={`rounded-2xl border ${
                    esActual
                      ? 'border-brand-primary/50 bg-brand-primary/5 dark:border-brand-primary/40 dark:bg-brand-primary/10'
                      : 'border-neutral-200 dark:border-zinc-800'
                  }`}
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    onClick={() => setAbiertosCalendario((prev) => ({ ...prev, [m.mes]: !abierto }))}
                    aria-expanded={abierto}
                  >
                    <span className={`text-base font-semibold sm:text-lg ${esActual ? 'text-heading' : 'text-heading'}`}>
                      {m.etiqueta}
                      {esActual ? (
                        <span className="text-body-muted ml-2 text-base font-medium">(mes actual)</span>
                      ) : null}
                    </span>
                    <span className="text-body-muted text-base">{abierto ? 'Ocultar' : 'Mostrar'}</span>
                  </button>
                  {abierto ? (
                    <div className="overflow-x-auto border-t border-neutral-200 dark:border-zinc-800">
                      <table className="min-w-full text-base">
                        <thead className="bg-neutral-50 dark:bg-zinc-950/80">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium">Día</th>
                            <th className="px-4 py-3 text-left font-medium">Inversión</th>
                            {general ? <th className="px-4 py-3 text-left font-medium">Persona</th> : null}
                            <th className="px-4 py-3 text-right font-medium">Monto neto</th>
                            <th className="px-4 py-3 text-left font-medium">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
                          {m.cuotas.map((c) => (
                            <tr key={`${c.inversionId}-c${c.cuotaNumero}`}>
                              <td className="px-4 py-3 tabular-nums">{c.fecha.slice(8, 10)}</td>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() => onVerInversion(c.inversionId)}
                                  className="font-medium text-brand-primary hover:underline"
                                >
                                  {c.inversionNumero}
                                </button>
                              </td>
                              {general ? <td className="px-4 py-3">{c.inversorNombre}</td> : null}
                              <td className="px-4 py-3 text-right tabular-nums">
                                {formatMoneyCentavos(c.montoNetoCentavos, c.monedaPago)}
                              </td>
                              <td className={`px-4 py-3 ${claseEstadoCuota(c.estado)}`}>
                                {TEXTO_ESTADO_CUOTA_CALENDARIO[c.estado]}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* e. Movimientos */}
      {cuenta.movimientos.length > 0 ? (
        <section aria-label="Movimientos" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-heading text-lg font-semibold sm:text-xl">Movimientos</h2>
            {cuenta.movimientos.length > 20 && movimientosVisibles <= 20 ? (
              <button
                type="button"
                onClick={() => setMovimientosVisibles(cuenta.movimientos.length)}
                className="rounded-xl border border-neutral-200 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Ver todos
              </button>
            ) : null}
            {cuenta.movimientos.length > 20 && movimientosVisibles > 20 ? (
              <button
                type="button"
                onClick={() => setMovimientosVisibles(20)}
                className="rounded-xl border border-neutral-200 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Ocultar
              </button>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-zinc-800">
            <table className="min-w-full text-base">
              <thead className="bg-neutral-50 dark:bg-zinc-950/80">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Fecha</th>
                  <th className="px-4 py-3 text-left font-medium">Tipo</th>
                  <th className="px-4 py-3 text-left font-medium">Inversión</th>
                  {general ? <th className="px-4 py-3 text-left font-medium">Persona</th> : null}
                  <th className="px-4 py-3 text-right font-medium">Monto</th>
                  <th className="px-4 py-3 text-right font-medium">Retención</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
                {cuenta.movimientos.slice(0, movimientosVisibles).map((mov, i) => (
                  <tr key={`${mov.inversionId}-${mov.fecha}-${mov.montoCentavos}-${i}`}>
                    <td className="px-4 py-3 tabular-nums">{formatFecha(mov.fecha)}</td>
                    <td className="px-4 py-3">{TEXTO_TIPO_MOVIMIENTO[mov.tipo]}</td>
                    <td className="px-4 py-3 font-medium">
                      <button
                        type="button"
                        onClick={() => onVerInversion(mov.inversionId)}
                        className="font-medium text-brand-primary hover:underline"
                      >
                        {mov.inversionNumero}
                      </button>
                    </td>
                    {general ? <td className="px-4 py-3">{mov.inversorNombre}</td> : null}
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoneyCentavos(mov.montoCentavos, mov.moneda)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {mov.retencionCentavos > 0
                        ? formatMoneyCentavos(mov.retencionCentavos, mov.moneda)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* f. Documentos */}
      {!general && cuenta.documentos.length > 0 ? (
        <section aria-label="Documentos" className="space-y-3">
          <h2 className="text-heading text-lg font-semibold sm:text-xl">Documentos</h2>
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-zinc-800 dark:border-zinc-800">
            {cuenta.documentos.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-base">
                <span className="font-medium">
                  {doc.tipo === 'mutuo' ? 'Mutuo' : doc.tipo === 'pagare' ? 'Pagaré' : 'Otro'} · {doc.nombre}
                  <span className="ml-1 text-body-muted text-sm">(Inversión {doc.inversionNumero})</span>
                </span>
                {onAbrirDocumento ? (
                  <button
                    type="button"
                    onClick={() => onAbrirDocumento(doc.inversionId, doc.id)}
                    className="rounded-xl border border-neutral-200 px-3 py-2 text-base font-medium hover:bg-neutral-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Abrir
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
