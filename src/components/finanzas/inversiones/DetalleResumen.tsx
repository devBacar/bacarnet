import type { InversionDetalle } from '../../../services/finanzasInversionesApi'
import { formatMoneyCentavos } from '../formatMoney'
import {
  condicionesEnPalabras,
  formatFecha,
  mesesConRetencionRepetida,
  TEXTO_MEDIO_INGRESO,
} from './detalleShared'
import { textoSistema, textoTasa } from './textosInversiones'

export function DetalleResumen({ d }: { d: InversionDetalle }) {
  const moneda = d.condiciones.moneda
  const c = d.condiciones
  const mesesRepetidos = mesesConRetencionRepetida(d)
  const retencionTotal = d.cronograma.reduce((acc, cuota) => acc + cuota.retencionCentavos, 0)
  const cuotasConRetencion = d.cronograma.filter((cuota) => cuota.retencionCentavos > 0).length

  return (
    <div className="space-y-5 text-sm">
      <section className="space-y-2">
        <h2 className="text-heading text-sm font-semibold">Datos de la inversión</h2>
        <p>{condicionesEnPalabras(d)}</p>
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-body-muted">Alta</dt>
            <dd className="tabular-nums">{formatFecha(c.fechaAlta)}</dd>
          </div>
          <div>
            <dt className="text-body-muted">Vencimiento</dt>
            <dd className="tabular-nums">
              {c.sinVencimiento ? 'Sin fecha de devolución' : formatFecha(c.fechaVencimiento)}
            </dd>
          </div>
          <div>
            <dt className="text-body-muted">Sistema</dt>
            <dd>{textoSistema(c.sistema)}</dd>
          </div>
          <div>
            <dt className="text-body-muted">Tasa</dt>
            <dd>{textoTasa(c.tasa)}</dd>
          </div>
          <div>
            <dt className="text-body-muted">Plazo</dt>
            <dd>
              {c.sinVencimiento
                ? 'Sin vencimiento'
                : `${c.cantidadCuotas} cuota${c.cantidadCuotas === 1 ? '' : 's'} · ${c.periodicidad}`}
            </dd>
          </div>
          <div>
            <dt className="text-body-muted">Deuda de hoy</dt>
            <dd className="tabular-nums font-medium">{formatMoneyCentavos(d.deudaHoyCentavos, moneda)}</dd>
          </div>
        </dl>
        {(d.alertas.cuotasAtrasadas > 0 || d.alertas.porVencer || d.alertas.proximaCuota) && (
          <p className="text-amber-900 dark:text-amber-100">
            {[
              d.alertas.cuotasAtrasadas > 0
                ? d.alertas.cuotasAtrasadas === 1
                  ? '1 cuota atrasada'
                  : `${d.alertas.cuotasAtrasadas} cuotas atrasadas`
                : null,
              d.alertas.porVencer
                ? d.alertas.diasParaVencer == null
                  ? 'Por vencer'
                  : d.alertas.diasParaVencer === 0
                    ? 'Vence hoy'
                    : `Vence en ${d.alertas.diasParaVencer} día${d.alertas.diasParaVencer === 1 ? '' : 's'}`
                : null,
              d.alertas.proximaCuota
                ? `Próxima cuota ${formatFecha(d.alertas.proximaCuota.fecha)} · ${formatMoneyCentavos(d.alertas.proximaCuota.montoCentavos, moneda)}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </section>

      {d.avisosAgenda.length > 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-medium">Avisos de la Agenda</p>
          <ul className="mt-1 list-inside list-disc">
            {d.avisosAgenda.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-heading text-sm font-semibold">Aprobación</h2>
        {d.aprobacion ? (
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-body-muted">Pedida por</dt>
              <dd>
                {d.aprobacion.solicitadaPorNombre ?? d.aprobacion.solicitadaPor}
                <span className="text-body-muted block text-xs">
                  {new Date(d.aprobacion.solicitadaAt).toLocaleString('es-AR')}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-body-muted">Resolución</dt>
              <dd>
                {d.aprobacion.resultado == null
                  ? 'Pendiente'
                  : d.aprobacion.resultado === 'aprobada'
                    ? 'Aprobada'
                    : 'Rechazada'}
                {d.aprobacion.resueltaAt ? (
                  <span className="text-body-muted block text-xs">
                    {new Date(d.aprobacion.resueltaAt).toLocaleString('es-AR')}
                    {d.aprobacion.resueltaPorNombre || d.aprobacion.resueltaPor
                      ? ` · ${d.aprobacion.resueltaPorNombre ?? d.aprobacion.resueltaPor}`
                      : ''}
                  </span>
                ) : null}
              </dd>
            </div>
            {d.aprobacion.nota ? (
              <div className="sm:col-span-2">
                <dt className="text-body-muted">Nota</dt>
                <dd>{d.aprobacion.nota}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="text-body-muted">Todavía no se pidió aprobación.</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-heading text-sm font-semibold">Retención RG 830</h2>
        <p className="tabular-nums">
          {retencionTotal > 0
            ? `${formatMoneyCentavos(retencionTotal, moneda)} en ${cuotasConRetencion} cuota${cuotasConRetencion === 1 ? '' : 's'}`
            : 'Sin retención en el cronograma.'}
        </p>
        {mesesRepetidos.length > 0 ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Hay dos o más cuotas con retención en el mismo mes ({mesesRepetidos.join(', ')}). La retención de
            Ganancias se calcula por cuota: revisala con el contador.
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-heading text-sm font-semibold">Ingresos de capital</h2>
        <p className="tabular-nums">
          <span className="text-body-muted">Ingresado / esperado: </span>
          {formatMoneyCentavos(d.ingresadoCentavos, moneda)} /{' '}
          {formatMoneyCentavos(d.ingresoEsperadoCentavos, moneda)}
        </p>
        {d.ingresos.length === 0 ? (
          <p className="text-body-muted">Todavía no entró capital.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-zinc-800 dark:border-zinc-800">
            {d.ingresos.map((ing) => (
              <li key={ing.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
                <span>
                  {formatFecha(ing.fecha)} · {TEXTO_MEDIO_INGRESO[ing.medio]}
                  {ing.importado ? ' · importado' : ''}
                </span>
                <span className="tabular-nums font-medium">
                  {formatMoneyCentavos(ing.montoCentavos, moneda)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {d.observaciones ? (
        <section className="space-y-1">
          <h2 className="text-heading text-sm font-semibold">Observaciones</h2>
          <p>{d.observaciones}</p>
        </section>
      ) : null}

      <p className="text-body-muted tabular-nums">
        Totales · capital {formatMoneyCentavos(d.totales.capitalCentavos, moneda)} · interés{' '}
        {formatMoneyCentavos(d.totales.interesCentavos, moneda)} · total{' '}
        {formatMoneyCentavos(d.totales.totalCentavos, moneda)}
      </p>
    </div>
  )
}
