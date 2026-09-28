import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { finanzasInputClass } from '../../components/finanzas/FinanzasFormField'
import { formatMoneyCentavos } from '../../components/finanzas/formatMoney'
import { useAuth } from '../../context'
import { fetchFinanzasCuentas } from '../../services/finanzasApi'
import {
  fetchMovimientos,
  type MovimientoTipo,
} from '../../services/finanzasMovimientosApi'

const PAGE_SIZE = 50

function isoArgentina(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

function addIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map((part) => Number(part))
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function rangoInicial(): { desde: string; hasta: string } {
  const hoy = isoArgentina(new Date())
  return { desde: addIsoDays(hoy, -29), hasta: hoy }
}

function formatFecha(iso: string): string {
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

export function FinanzasMovimientosPage() {
  const { user } = useAuth()
  const inicial = rangoInicial()
  const [cuentaId, setCuentaId] = useState('')
  const [desde, setDesde] = useState(inicial.desde)
  const [hasta, setHasta] = useState(inicial.hasta)
  const [tipo, setTipo] = useState<'' | MovimientoTipo>('')
  const [q, setQ] = useState('')
  const [qAplicada, setQAplicada] = useState('')
  const [page, setPage] = useState(1)

  const { data: cuentasData } = useQuery({
    queryKey: ['finanzas', 'cuentas'],
    queryFn: fetchFinanzasCuentas,
    enabled: Boolean(user),
  })
  const cuentas = (cuentasData?.cuentas ?? []).filter((cuenta) => cuenta.tipo === 'CC' && cuenta.moneda === 'ARS')

  useEffect(() => {
    if (cuentaId || cuentas.length === 0) return
    const cordoba = cuentas.find((cuenta) => cuenta.id === 'cordoba-cc')
    setCuentaId(cordoba?.id ?? cuentas[0].id)
  }, [cuentaId, cuentas])

  const filtrosListos = Boolean(cuentaId && desde && hasta && desde <= hasta)

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['finanzas', 'movimientos', cuentaId, desde, hasta, tipo, qAplicada, page],
    queryFn: () =>
      fetchMovimientos({
        cuentaId,
        desde,
        hasta,
        tipo,
        q: qAplicada,
        page,
        limit: PAGE_SIZE,
      }),
    enabled: Boolean(user) && filtrosListos,
    placeholderData: (prev) => prev,
  })

  function cambiarFiltro(apply: () => void) {
    apply()
    setPage(1)
  }

  const total = data?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const totales = data?.totales

  return (
    <>
      <header className="mb-6">
        <h1 className="text-heading text-2xl font-semibold">Movimientos</h1>
        <p className="text-body-muted mt-1 text-sm">
          Extracto de las cuentas corrientes, traído de Interbanking. La lista se pide de a una página.
        </p>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm">
          <span className="text-body-muted mb-1 block">Cuenta</span>
          <select
            className={finanzasInputClass}
            value={cuentaId}
            onChange={(e) => cambiarFiltro(() => setCuentaId(e.target.value))}
          >
            {cuentas.map((cuenta) => (
              <option key={cuenta.id} value={cuenta.id}>
                {cuenta.bancoNombre} {cuenta.tipo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-body-muted mb-1 block">Desde</span>
          <input
            type="date"
            className={finanzasInputClass}
            value={desde}
            onChange={(e) => cambiarFiltro(() => setDesde(e.target.value))}
          />
        </label>
        <label className="text-sm">
          <span className="text-body-muted mb-1 block">Hasta</span>
          <input
            type="date"
            className={finanzasInputClass}
            value={hasta}
            onChange={(e) => cambiarFiltro(() => setHasta(e.target.value))}
          />
        </label>
        <label className="text-sm">
          <span className="text-body-muted mb-1 block">Tipo</span>
          <select
            className={finanzasInputClass}
            value={tipo}
            onChange={(e) => cambiarFiltro(() => setTipo(e.target.value as '' | MovimientoTipo))}
          >
            <option value="">Todos</option>
            <option value="credito">Entradas</option>
            <option value="debito">Salidas</option>
          </select>
        </label>
        <form
          className="text-sm"
          onSubmit={(e) => {
            e.preventDefault()
            cambiarFiltro(() => setQAplicada(q.trim()))
          }}
        >
          <span className="text-body-muted mb-1 block">Descripción o contraparte</span>
          <input
            className={finanzasInputClass}
            value={q}
            placeholder="Buscar y Enter"
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
      </div>

      {totales ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-800">Entradas</p>
            <p className="mt-1 text-lg font-semibold text-emerald-950">
              {formatMoneyCentavos(totales.entradasCentavos, 'ARS')}
            </p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-red-800">Salidas</p>
            <p className="mt-1 text-lg font-semibold text-red-950">
              {formatMoneyCentavos(totales.salidasCentavos, 'ARS')}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-body-muted text-xs font-medium uppercase tracking-wide">Movimientos</p>
            <p className="text-heading mt-1 text-lg font-semibold">{totales.cantidad.toLocaleString('es-AR')}</p>
          </div>
        </div>
      ) : null}

      {isError ? (
        <p className="text-sm text-red-700">{error instanceof Error ? error.message : 'No se pudieron cargar los movimientos'}</p>
      ) : null}
      {!filtrosListos || isLoading ? (
        <p className="text-body-muted text-sm">Cargando movimientos…</p>
      ) : (
        <div className={`overflow-x-auto rounded-xl border border-neutral-200 dark:border-zinc-800 ${isFetching ? 'opacity-70' : ''}`}>
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2">Contraparte</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {(data?.movimientos ?? []).map((row) => {
                const entrada = row.tipo === 'credito'
                return (
                  <tr key={row.id} className="border-t border-neutral-100 dark:border-zinc-800">
                    <td className="whitespace-nowrap px-3 py-2">{formatFecha(row.fechaProceso)}</td>
                    <td className="px-3 py-2">{row.descripcion}</td>
                    <td className="px-3 py-2">
                      {row.contraparte || '—'}
                      {row.customerCuit ? <span className="text-body-muted block text-xs">{row.customerCuit}</span> : null}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${
                          entrada
                            ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
                            : 'border-red-300 bg-red-100 text-red-900'
                        }`}
                      >
                        {entrada ? 'Entrada' : 'Salida'}
                      </span>
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right font-medium ${entrada ? 'text-emerald-800' : 'text-red-800'}`}>
                      {entrada ? '' : '−'}
                      {formatMoneyCentavos(row.montoCentavos, 'ARS')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {(data?.movimientos.length ?? 0) === 0 ? (
            <p className="text-body-muted px-4 py-8 text-center">No hay movimientos con esos filtros.</p>
          ) : null}
        </div>
      )}

      {filtrosListos && !isLoading && total > 0 ? (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            className="rounded border px-3 py-1.5 disabled:opacity-40"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Anterior
          </button>
          <span className="text-body-muted">
            Página {page} de {paginas.toLocaleString('es-AR')}
          </span>
          <button
            type="button"
            className="rounded border px-3 py-1.5 disabled:opacity-40"
            disabled={page >= paginas || isFetching}
            onClick={() => setPage((current) => current + 1)}
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </>
  )
}
