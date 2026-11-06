import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { TarjetaTablero } from '../../components/tablero-finanzas/TarjetaTablero'
import { fechaCorta, fechaHora, plata } from '../../components/tablero-finanzas/formatoTablero'
import {
  fetchDetalleClienteCobros,
  fetchTableroCobros,
  type BucketAntiguedad,
  type ClienteCobro,
  type MonedaTablero,
} from '../../services/finanzasCobrosTableroApi'

const CLASE_INPUT =
  'w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-[14px] font-normal text-neutral-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100'

const ETIQUETA_BUCKET: Record<BucketAntiguedad, string> = {
  '0-30': '0 a 30 días',
  '31-60': '31 a 60 días',
  '61-90': '61 a 90 días',
  mas90: 'Más de 90 días',
}
const ORDEN_BUCKETS: BucketAntiguedad[] = ['0-30', '31-60', '61-90', 'mas90']

function hoyIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

function hace30diasIso(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 30)
  return d.toISOString().slice(0, 10)
}

/** Vientri Cobros solo trabaja en pesos: los movimientos bancarios que se concilian son todos de cuentas en ARS. */
const MONEDA: MonedaTablero = 'ARS'

export function TableroCobrosPage() {
  const [desde, setDesde] = useState(hace30diasIso())
  const [hasta, setHasta] = useState(hoyIso())
  const moneda = MONEDA
  const [busqueda, setBusqueda] = useState('')
  const [clienteAbierto, setClienteAbierto] = useState<number | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['tablero-cobros', desde, hasta, moneda],
    queryFn: () => fetchTableroCobros({ desde, hasta, moneda }),
  })

  const { data: detalle, isFetching: cargandoDetalle } = useQuery({
    queryKey: ['tablero-cobros-detalle', clienteAbierto, desde, hasta, moneda],
    queryFn: () => fetchDetalleClienteCobros({ vientriId: clienteAbierto as number, desde, hasta, moneda }),
    enabled: clienteAbierto != null,
  })

  const clientesFiltrados: ClienteCobro[] =
    data?.clientes.filter((c) => !busqueda.trim() || c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())) ?? []

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-heading text-2xl font-bold tracking-tight">Cobros</h1>
          <p className="text-body-muted text-sm">Cuentas corrientes de clientes, deuda y cobranzas, desde Vientri.</p>
        </div>
        {data ? <p className="text-body-muted text-xs">Actualizado {fechaHora(data.generadoEn)}</p> : null}
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="text-body-muted mb-1 block">Facturado desde</span>
          <input type="date" className={CLASE_INPUT} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="text-body-muted mb-1 block">hasta</span>
          <input type="date" className={CLASE_INPUT} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <label className="ml-auto text-sm">
          <span className="text-body-muted mb-1 block">Buscar cliente</span>
          <input
            className={CLASE_INPUT}
            placeholder="Nombre del cliente"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
      </div>

      {isError ? (
        <p className="text-sm text-red-700">{error instanceof Error ? error.message : 'No se pudo cargar el tablero'}</p>
      ) : null}
      {isLoading || !data ? (
        <p className="text-body-muted text-sm">Cargando...</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TarjetaTablero titulo="Total a cobrar">
              <p className="text-heading text-2xl font-bold tabular-nums">{plata(data.totalACobrarCentavos, data.moneda)}</p>
              <p className="text-body-muted mt-1 text-xs">
                {data.cantidadClientesConDeuda} clientes · de lo facturado del {fechaCorta(data.periodo.desde)} al {fechaCorta(data.periodo.hasta)}, lo que sigue
                sin cobrarse hoy
              </p>
            </TarjetaTablero>
            <TarjetaTablero titulo="Vencido">
              <p className="text-2xl font-bold tabular-nums text-red-700 dark:text-red-400">
                {plata(data.totalVencidoCentavos, data.moneda)}
              </p>
              <p className="text-body-muted mt-1 text-xs">de lo facturado en el período y sigue sin cobrarse, lo que ya venció a hoy ({fechaCorta(data.hoy)})</p>
            </TarjetaTablero>
            <TarjetaTablero titulo="A vencer">
              <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {plata(data.totalAVencerCentavos, data.moneda)}
              </p>
              <p className="text-body-muted mt-1 text-xs">de lo facturado en el período y sigue sin cobrarse, lo que todavía no vence a hoy ({fechaCorta(data.hoy)})</p>
            </TarjetaTablero>
            <TarjetaTablero titulo={`Cobrado (${fechaCorta(data.periodo.desde)} a ${fechaCorta(data.periodo.hasta)})`}>
              <p className="text-heading text-2xl font-bold tabular-nums">{plata(data.cobradoEnPeriodoCentavos, data.moneda)}</p>
              <p className="text-body-muted mt-1 text-xs">{data.cantidadFacturasCobradasEnPeriodo} cobros registrados</p>
              {data.cobradoProvisorioCentavos > 0 ? (
                <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
                  De eso, {plata(data.cobradoProvisorioCentavos, data.moneda)} todavía es provisorio: se detectó por el movimiento bancario (CUIT + monto),
                  pero Vientri todavía no lo confirmó. Confirmado: {plata(data.cobradoConfirmadoCentavos, data.moneda)}.
                </p>
              ) : null}
            </TarjetaTablero>
          </div>

          {data.sinClasificarHoy.cantidad > 0 ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
              <strong>Ojo:</strong> hoy entraron {data.sinClasificarHoy.cantidad} movimientos bancarios por{' '}
              {plata(data.sinClasificarHoy.montoCentavos, 'ARS')} que todavía no se pudieron relacionar con ninguna
              factura (puede faltar el CUIT, o el monto no cierra exacto). Los números de arriba pueden estar
              incompletos hasta que se concilien o hasta que lo confirme Vientri mañana.
            </div>
          ) : null}

          <TarjetaTablero titulo="Antigüedad de la deuda vencida" subtitulo={`Al ${fechaCorta(data.hoy)}`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {ORDEN_BUCKETS.map((bucket) => (
                <div key={bucket} className="rounded-lg border border-neutral-200 p-3 dark:border-zinc-800">
                  <p className="text-body-muted text-xs">{ETIQUETA_BUCKET[bucket]}</p>
                  <p className="text-heading mt-1 font-semibold tabular-nums">{plata(data.antiguedad[bucket], data.moneda)}</p>
                </div>
              ))}
            </div>
          </TarjetaTablero>

          <TarjetaTablero titulo="Cuentas corrientes por cliente" subtitulo={`${clientesFiltrados.length} clientes`}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-[var(--color-primary-muted)] bg-brand-primary-light text-left text-xs font-medium text-brand-primary">
                  <tr>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2 text-right">Deuda</th>
                    <th className="px-3 py-2 text-right">Vencido</th>
                    <th className="px-3 py-2 text-right">A vencer</th>
                    <th className="px-3 py-2 text-right">A favor</th>
                    <th className="px-3 py-2 text-right">Saldo neto</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesFiltrados.map((c) => (
                    <FilaCliente
                      key={c.personaId}
                      cliente={c}
                      moneda={data.moneda}
                      abierto={clienteAbierto === c.personaId}
                      onToggle={() => setClienteAbierto(clienteAbierto === c.personaId ? null : c.personaId)}
                      cargandoDetalle={cargandoDetalle}
                      detalle={clienteAbierto === c.personaId ? (detalle ?? null) : null}
                    />
                  ))}
                  {clientesFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-body-muted px-4 py-8 text-center">
                        No hay clientes con movimientos en pesos con ese filtro.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </TarjetaTablero>
        </>
      )}
    </div>
  )
}

function FilaCliente({
  cliente,
  moneda,
  abierto,
  onToggle,
  cargandoDetalle,
  detalle,
}: {
  cliente: ClienteCobro
  moneda: MonedaTablero
  abierto: boolean
  onToggle: () => void
  cargandoDetalle: boolean
  detalle: {
    impagas: ClienteCobro['comprobantes']
    cobradas: Array<{
      clave: string
      comprobante: string
      fechaCobro: string | null
      importeCobradoCentavos: number
      fuente: 'vientri' | 'banco'
    }>
  } | null
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-t border-neutral-100 hover:bg-neutral-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60"
        onClick={onToggle}
      >
        <td className="px-3 py-2 font-medium">{cliente.nombre}</td>
        <td className="px-3 py-2 text-right tabular-nums">{plata(cliente.deudaCentavos, moneda)}</td>
        <td className="px-3 py-2 text-right tabular-nums text-red-700 dark:text-red-400">
          {cliente.vencidoCentavos > 0 ? plata(cliente.vencidoCentavos, moneda) : '—'}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {cliente.aVencerCentavos > 0 ? plata(cliente.aVencerCentavos, moneda) : '—'}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{cliente.favorCentavos > 0 ? plata(cliente.favorCentavos, moneda) : '—'}</td>
        <td className="px-3 py-2 text-right font-semibold tabular-nums">{plata(cliente.saldoCentavos, moneda)}</td>
      </tr>
      {abierto ? (
        <tr className="border-t border-neutral-100 bg-neutral-50 dark:border-zinc-800 dark:bg-zinc-800/40">
          <td colSpan={6} className="px-3 py-3">
            {cargandoDetalle || !detalle ? (
              <p className="text-body-muted text-sm">Cargando facturas...</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="text-heading mb-2 text-sm font-semibold">Facturas impagas</h3>
                  {detalle.impagas.length === 0 ? (
                    <p className="text-body-muted text-sm">No tiene facturas impagas.</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {detalle.impagas.map((f) => (
                        <li key={f.clave} className="flex items-center justify-between gap-2">
                          <span>
                            {f.comprobante}
                            {f.fechaVencimiento ? (
                              <span className="text-body-muted ml-1 text-xs">vence {fechaCorta(f.fechaVencimiento)}</span>
                            ) : null}
                          </span>
                          <span
                            className={`tabular-nums ${f.pendienteCentavos > 0 && f.bucket ? 'text-red-700 dark:text-red-400' : ''}`}
                          >
                            {plata(f.pendienteCentavos, moneda)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="text-heading mb-2 text-sm font-semibold">Cobros en el período</h3>
                  <p className="text-body-muted mb-2 text-xs">
                    Fecha real del pago (recibo/OP), no la fecha de la factura. Un pago parcial aparece aparte.
                  </p>
                  {detalle.cobradas.length === 0 ? (
                    <p className="text-body-muted text-sm">No se registraron cobros en este rango de fechas.</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {detalle.cobradas.map((f) => (
                        <li key={f.clave} className="flex items-center justify-between gap-2">
                          <span>
                            {f.comprobante}
                            {f.fechaCobro ? <span className="text-body-muted ml-1 text-xs">{fechaCorta(f.fechaCobro)}</span> : null}
                            {f.fuente === 'banco' ? (
                              <span
                                className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                                title="Detectado por el banco, todavía no lo confirmó Vientri"
                              >
                                banco
                              </span>
                            ) : null}
                          </span>
                          <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
                            {plata(f.importeCobradoCentavos, moneda)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </td>
        </tr>
      ) : null}
    </>
  )
}
