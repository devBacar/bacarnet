import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  DollarSign,
  Link2,
  RefreshCw,
  Search,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../../../context'
import {
  fetchChequesOcasionales,
  fetchOcasionalDetalle,
  fetchOcasionalesResumen,
  type ChequeOcasionalItem,
  type OcasionalesFiltro,
} from '../../../services/finanzasChequesApi'
import { finanzasInputClass } from '../FinanzasFormField'
import { formatMoneyCentavos } from '../formatMoney'
import { CadenasRenovacion } from './CadenasRenovacion'

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

const FILTRO_TABS: [OcasionalesFiltro, string][] = [
  ['', 'Todos'],
  ['financiero', 'Financieros'],
  ['gasto_real', 'Gasto real'],
  ['con_renovacion', 'Con renovación'],
  ['con_usd', 'Con USD'],
]

export function PestanaOcasionales() {
  const { user } = useAuth()
  const [filtro, setFiltro] = useState<OcasionalesFiltro>('')
  const [busqueda, setBusqueda] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [subvista, setSubvista] = useState<'cheques' | 'cadenas'>('cheques')
  const [beneficiarioCadenas, setBeneficiarioCadenas] = useState('')
  const [detalleId, setDetalleId] = useState<string | null>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(busqueda.trim())
      setPage(1)
    }, 400)
    return () => clearTimeout(t)
  }, [busqueda])

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['finanzas', 'cheques-ocasionales', filtro, q, page],
    queryFn: () => fetchChequesOcasionales({ filtro, q: q || undefined, page }),
    enabled: Boolean(user),
    placeholderData: (prev) => prev,
  })

  const { data: resumen } = useQuery({
    queryKey: ['finanzas', 'cheques-ocasionales', 'resumen'],
    queryFn: fetchOcasionalesResumen,
    enabled: Boolean(user),
  })

  const total = data?.total ?? 0
  const paginas = Math.max(1, data?.pages ?? 1)

  const irACadenas = (beneficiarioNormalizado: string) => {
    setBeneficiarioCadenas(beneficiarioNormalizado)
    setSubvista('cadenas')
  }

  const subTabs = (
    <div className="mb-4 inline-flex rounded-lg border border-neutral-200 p-0.5 dark:border-zinc-800">
      {([['cheques', 'Cheques'], ['cadenas', 'Cadenas']] as const).map(([val, label]) => (
        <button
          key={val}
          type="button"
          onClick={() => { setSubvista(val); if (val === 'cadenas') setBeneficiarioCadenas('') }}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            subvista === val
              ? 'bg-brand-primary text-white shadow-sm'
              : 'text-body-muted hover:text-heading'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  if (subvista === 'cadenas') {
    return (
      <>
        {subTabs}
        <CadenasRenovacion
          beneficiarioFiltro={beneficiarioCadenas}
          onLimpiarFiltro={() => setBeneficiarioCadenas('')}
        />
      </>
    )
  }

  return (
    <>
      {subTabs}
      {resumen ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <ResumenCard
            icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
            label="Total ocasionales"
            value={String(resumen.totalCheques)}
          />
          <ResumenCard
            icon={<Link2 className="h-4 w-4 text-violet-500" />}
            label="Financieros"
            value={String(resumen.financieros)}
          />
          <ResumenCard
            icon={<RefreshCw className="h-4 w-4 text-blue-500" />}
            label="Con renovación"
            value={String(resumen.conRenovacion)}
          />
          <ResumenCard
            icon={<DollarSign className="h-4 w-4 text-green-500" />}
            label="Con USD"
            value={String(resumen.conUsd)}
          />
        </div>
      ) : null}

      {resumen && resumen.costoFinanciero.cantidadCadenas > 0 ? (
        <button
          type="button"
          onClick={() => irACadenas('')}
          className="surface-card mb-4 block w-full rounded-2xl border border-violet-200 p-3 text-left hover:bg-violet-50/50 dark:border-violet-900/70 dark:hover:bg-violet-950/20"
          title="Ver cadenas de renovación"
        >
          <p className="text-body-muted text-xs font-medium uppercase tracking-wide">Costo financiero estimado</p>
          <div className="mt-1 flex flex-wrap gap-4 text-sm">
            <span>
              <span className="text-body-muted">Cadenas:</span>{' '}
              <span className="text-heading font-medium">{resumen.costoFinanciero.cantidadCadenas}</span>
            </span>
            <span>
              <span className="text-body-muted">Capital inicial:</span>{' '}
              <span className="text-heading font-medium">{formatMoneyCentavos(resumen.costoFinanciero.capitalTotalCentavos, 'ARS')}</span>
            </span>
            <span>
              <span className="text-body-muted">Interés total:</span>{' '}
              <span className="font-medium text-red-600 dark:text-red-400">{formatMoneyCentavos(resumen.costoFinanciero.interesTotalCentavos, 'ARS')}</span>
            </span>
            <span>
              <span className="text-body-muted">Tasa implícita:</span>{' '}
              <span className="text-heading font-medium">{(resumen.costoFinanciero.tasaImplicitaPromedio * 100).toFixed(1)}%</span>
            </span>
          </div>
        </button>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 dark:border-zinc-800">
          {FILTRO_TABS.map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => { setFiltro(val); setPage(1) }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filtro === val
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'text-body-muted hover:text-heading'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            className={`${finanzasInputClass} pl-9`}
            placeholder="Buscar por beneficiario, número…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          {busqueda ? (
            <button
              type="button"
              className="text-body-muted hover:text-heading absolute right-2 top-1/2 -translate-y-1/2 px-1"
              onClick={() => setBusqueda('')}
            >
              ×
            </button>
          ) : null}
        </div>
        {data ? (
          <span className="text-body-muted text-sm whitespace-nowrap">
            {total.toLocaleString('es-AR')} cheques · {formatMoneyCentavos(data.totalCentavos, 'ARS')}
          </span>
        ) : null}
      </div>

      {isError ? (
        <p className="text-danger text-sm">{error instanceof Error ? error.message : 'No se pudieron cargar los cheques ocasionales'}</p>
      ) : null}

      {isLoading ? (
        <p className="text-body-muted text-sm">Cargando cheques ocasionales…</p>
      ) : (
        <div className={`overflow-x-auto rounded-xl border border-neutral-300 bg-white dark:border-zinc-700 dark:bg-zinc-900 ${isFetching ? 'opacity-70' : ''}`}>
          <table className="min-w-full text-[0.8125rem]">
            <thead className="border-b border-[var(--color-primary-muted)] bg-brand-primary-light text-left text-xs font-medium text-brand-primary">
              <tr>
                <th className="px-3 py-2">Nº</th>
                <th className="px-3 py-2">Beneficiario</th>
                <th className="px-3 py-2">Emisión</th>
                <th className="px-3 py-2">Vencimiento</th>
                <th className="px-3 py-2 text-right">Importe</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">OBS</th>
              </tr>
            </thead>
            <tbody>
              {(data?.cheques ?? []).map((ch) => (
                <OcasionalRow
                  key={ch.vientriId}
                  ch={ch}
                  onAbrir={() => setDetalleId(`oca-${ch.vientriId}`)}
                  onVerCadena={() => irACadenas(ch.beneficiarioNormalizado)}
                />
              ))}
            </tbody>
          </table>
          {(data?.cheques.length ?? 0) === 0 ? (
            <p className="text-body-muted px-4 py-8 text-center">No hay cheques ocasionales con esos filtros.</p>
          ) : null}
        </div>
      )}

      {!isLoading && total > 0 ? (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            className="border-subtle rounded border px-3 py-1.5 disabled:opacity-40"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((c) => Math.max(1, c - 1))}
          >
            Anterior
          </button>
          <span className="text-body-muted">
            Página {page} de {paginas.toLocaleString('es-AR')}
          </span>
          <button
            type="button"
            className="border-subtle rounded border px-3 py-1.5 disabled:opacity-40"
            disabled={page >= paginas || isFetching}
            onClick={() => setPage((c) => c + 1)}
          >
            Siguiente
          </button>
        </div>
      ) : null}

      {detalleId ? <OcasionalDetalleModal id={detalleId} onClose={() => setDetalleId(null)} /> : null}
    </>
  )
}

function OcasionalRow({ ch, onAbrir, onVerCadena }: { ch: ChequeOcasionalItem; onAbrir: () => void; onVerCadena: () => void }) {
  return (
    <tr
      className="cursor-pointer border-t border-subtle hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
      onClick={onAbrir}
    >
      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
        <span className="inline-flex items-center gap-1">
          {ch.numeroCheque}
          {ch.revisar.length > 0 ? (
            <span title={`Revisar: ${ch.revisar.join(' · ')}`} aria-label="Datos a revisar">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            </span>
          ) : null}
        </span>
      </td>
      <td className="px-3 py-2">{ch.beneficiario || '—'}</td>
      <td className="whitespace-nowrap px-3 py-2">{formatFecha(ch.fechaEmision)}</td>
      <td className="whitespace-nowrap px-3 py-2">{formatFecha(ch.fechaVencimiento)}</td>
      <td className="text-brand-primary whitespace-nowrap px-3 py-2 text-right font-medium">
        {formatMoneyCentavos(ch.montoCentavos, 'ARS')}
      </td>
      <td className="px-3 py-2">
        <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${
          ch.pagado
            ? 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
            : 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
        }`}>
          {ch.estado || (ch.pagado ? 'Pagado' : 'Pendiente')}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {ch.esProveedorFinanciero ? (
            <span className="inline-block rounded border border-violet-300 bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-900 dark:border-violet-700 dark:bg-violet-900/40 dark:text-violet-200">
              Financiero
            </span>
          ) : null}
          {ch.esRenovacion || ch.renovadoPor.length > 0 ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onVerCadena() }}
              title="Ver cadena de renovación"
              className="inline-block rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
            >
              Renov.
            </button>
          ) : null}
          {ch.operacionUsd ? (
            <span className="inline-block rounded border border-green-300 bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-900 dark:border-green-700 dark:bg-green-900/40 dark:text-green-200">
              USD
            </span>
          ) : null}
          {!ch.esProveedorFinanciero && !ch.esRenovacion && ch.renovadoPor.length === 0 && !ch.operacionUsd ? (
            <span className="text-body-muted text-xs">Gasto real</span>
          ) : null}
        </div>
      </td>
      <td className="max-w-[200px] truncate px-3 py-2 text-xs text-body-muted" title={ch.obsOriginal}>
        {ch.obsOriginal || '—'}
      </td>
    </tr>
  )
}

function ResumenCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="surface-card rounded-2xl border border-neutral-200 p-3 dark:border-zinc-800">
      <div className="text-body-muted flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {label}
      </div>
      <p className="text-heading mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  )
}

function OcasionalDetalleModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['finanzas', 'cheques-ocasionales', 'detalle', id],
    queryFn: () => fetchOcasionalDetalle(id),
  })
  const ch = data?.cheque

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="surface-card w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading ? (
          <p className="text-body-muted py-8 text-center text-sm">Cargando detalle…</p>
        ) : isError || !ch ? (
          <p className="text-danger py-8 text-center text-sm">No se pudo cargar el detalle</p>
        ) : (
          <>
            <header className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-heading text-lg font-semibold">Cheque {ch.numeroCheque}</h2>
                <p className="text-body-muted text-sm">
                  {ch.beneficiario || '—'} · {ch.estado || (ch.pagado ? 'Pagado' : 'Pendiente')}
                </p>
              </div>
              <p className="text-brand-primary whitespace-nowrap text-lg font-semibold">
                {formatMoneyCentavos(ch.montoCentavos, 'ARS')}
              </p>
            </header>

            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
              <dt className="text-body-muted">Emisión</dt>
              <dd>{formatFecha(ch.fechaEmision)}</dd>
              <dt className="text-body-muted">Vencimiento</dt>
              <dd>{formatFecha(ch.fechaVencimiento)}</dd>
              <dt className="text-body-muted">Pagado</dt>
              <dd>{ch.pagado ? 'Sí' : 'No'}</dd>
              {ch.esProveedorFinanciero ? (
                <>
                  <dt className="text-body-muted">Proveedor</dt>
                  <dd>Financiero{ch.tipoProveedor === 'ficticio' ? ' (ficticio)' : ''}</dd>
                </>
              ) : null}
              {ch.operacionUsd ? (
                <>
                  <dt className="text-body-muted">Operación USD</dt>
                  <dd>
                    US$ {ch.operacionUsd.montoUsd.toLocaleString('es-AR', { minimumFractionDigits: 2 })} @{' '}
                    {ch.operacionUsd.cotizacion.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </dd>
                </>
              ) : null}
              {ch.renovacionDe.length > 0 ? (
                <>
                  <dt className="text-body-muted">Renueva a</dt>
                  <dd className="font-mono text-xs">{ch.renovacionDe.join(', ')}</dd>
                </>
              ) : null}
              {ch.renovadoPor.length > 0 ? (
                <>
                  <dt className="text-body-muted">Renovado por</dt>
                  <dd className="font-mono text-xs">{ch.renovadoPor.join(', ')}</dd>
                </>
              ) : null}
              {ch.obsOriginal ? (
                <>
                  <dt className="text-body-muted">OBS</dt>
                  <dd>{ch.obsOriginal}</dd>
                </>
              ) : null}
            </dl>

            {ch.revisar.length > 0 ? (
              <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
                <p className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-4 w-4" /> A revisar
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {ch.revisar.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
        <div className="mt-5 text-right">
          <button type="button" className="btn-primary rounded-lg px-4 py-2 text-sm font-medium" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
