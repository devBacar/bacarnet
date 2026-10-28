import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  DollarSign,
  Link2,
  RefreshCw,
  Search,
  Upload,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../context'
import {
  fetchChequesOcasionales,
  fetchOcasionalDetalle,
  fetchOcasionalesResumen,
  importarOcasionalesCsv,
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
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<OcasionalesFiltro>('')
  const [busqueda, setBusqueda] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [subvista, setSubvista] = useState<'cheques' | 'cadenas' | 'usd'>('cheques')
  const [beneficiarioCadenas, setBeneficiarioCadenas] = useState('')
  const [detalleId, setDetalleId] = useState<string | null>(null)

  const importMutation = useMutation({
    mutationFn: (file: File) => importarOcasionalesCsv(file),
    onSuccess: (res) => {
      setImportMsg(res.mensaje)
      void queryClient.invalidateQueries({ queryKey: ['finanzas', 'cheques-ocasionales'] })
    },
    onError: (err) => {
      setImportMsg(err instanceof Error ? err.message : 'Error al importar CSV')
    },
  })
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
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 dark:border-zinc-800">
        {([
          ['cheques', 'Cheques'],
          ['cadenas', 'Cadenas'],
          ['usd', 'Operaciones USD (fraccionadas)'],
        ] as const).map(([val, label]) => (
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

      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) {
              setImportMsg(null)
              importMutation.mutate(file)
            }
            e.target.value = ''
          }}
        />
        <button
          type="button"
          disabled={importMutation.isPending}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-200 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
        >
          <Upload className="h-3.5 w-3.5" />
          {importMutation.isPending ? 'Importando…' : 'Importar CSV'}
        </button>
        {importMsg ? (
          <span className={`text-xs ${importMutation.isError ? 'text-danger' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {importMsg}
          </span>
        ) : null}
      </div>
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

  if (subvista === 'usd') {
    const ops = resumen?.operacionesUsdAgrupadas ?? []
    return (
      <>
        {subTabs}
        <div className="surface-card rounded-2xl border border-neutral-200 p-4 dark:border-zinc-800">
          <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="text-heading text-sm font-semibold">
                Operaciones en Dólares agrupadas (detección de fraccionamiento)
              </h3>
              <p className="text-body-muted text-xs">
                Agrupa cheques del mismo beneficiario, monto USD y cotización pactada para identificar operaciones grandes partidas en varios cheques chicos.
              </p>
            </div>
            {resumen?.totalMontoUsd ? (
              <span className="text-xs font-semibold text-green-700 dark:text-green-400">
                {ops.length} operaciones reales · US$ {resumen.totalMontoUsd.toLocaleString('es-AR')} (TC prom. $ {(resumen.cotizacionPromedioUsd ?? 0).toLocaleString('es-AR')})
              </span>
            ) : null}
          </header>

          {ops.length === 0 ? (
            <p className="text-body-muted py-6 text-center text-sm">No hay operaciones en USD registradas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="border-b border-subtle text-left text-body-muted">
                  <tr>
                    <th className="px-2.5 py-2">Beneficiario</th>
                    <th className="px-2.5 py-2 text-right">Operación USD</th>
                    <th className="px-2.5 py-2 text-right">TC pactado</th>
                    <th className="px-2.5 py-2 text-right">Equivalente (USD × TC)</th>
                    <th className="px-2.5 py-2 text-center">Cheques (fraccionamiento)</th>
                    <th className="px-2.5 py-2 text-right">Suma cheques ARS</th>
                    <th className="px-2.5 py-2 text-right">Diferencia vs. Eq.</th>
                  </tr>
                </thead>
                <tbody>
                  {ops.map((op) => {
                    const diff = op.sumaChequesCentavos - op.equivalenteCentavos
                    return (
                      <tr key={`${op.beneficiarioNormalizado}-${op.montoUsd}-${op.cotizacion}`} className="border-t border-subtle">
                        <td className="px-2.5 py-2 font-medium">{op.beneficiario}</td>
                        <td className="px-2.5 py-2 text-right font-semibold text-green-700 dark:text-green-400">
                          US$ {op.montoUsd.toLocaleString('es-AR')}
                        </td>
                        <td className="px-2.5 py-2 text-right tabular-nums">
                          $ {op.cotizacion.toLocaleString('es-AR')}
                        </td>
                        <td className="px-2.5 py-2 text-right tabular-nums">
                          {formatMoneyCentavos(op.equivalenteCentavos, 'ARS')}
                        </td>
                        <td className="px-2.5 py-2 text-center">
                          <span className="inline-block rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                            {op.cantidadCheques} {op.cantidadCheques === 1 ? 'cheque' : 'cheques'}
                          </span>
                        </td>
                        <td className="text-brand-primary px-2.5 py-2 text-right font-semibold tabular-nums">
                          {formatMoneyCentavos(op.sumaChequesCentavos, 'ARS')}
                        </td>
                        <td className={`px-2.5 py-2 text-right tabular-nums ${diff > 0 ? 'text-red-600 dark:text-red-400' : 'text-body-muted'}`}>
                          {diff === 0 ? '—' : `${diff > 0 ? '+' : ''}${formatMoneyCentavos(diff, 'ARS')}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      {subTabs}
      {resumen ? (
        <>
          <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <ResumenCard
              icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
              label="Compromisos pendientes"
              value={String(resumen.pendientesCantidad ?? resumen.totalCheques)}
              subvalue={
                resumen.pendientesMontoCentavos != null
                  ? formatMoneyCentavos(resumen.pendientesMontoCentavos, 'ARS')
                  : undefined
              }
              hint={
                resumen.fechasImposiblesCantidad
                  ? `Total: ${resumen.totalCheques} (${resumen.fechasImposiblesCantidad} fecha inv.)`
                  : `Total ocasionales: ${resumen.totalCheques}`
              }
            />
            <ResumenCard
              icon={<Link2 className="h-4 w-4 text-violet-500" />}
              label="Circuito financiero"
              value={String(resumen.financieros)}
              subvalue={
                resumen.financierosMontoCentavos != null
                  ? formatMoneyCentavos(resumen.financierosMontoCentavos, 'ARS')
                  : undefined
              }
              hint="No son proveedores reales"
            />
            <ResumenCard
              icon={<Link2 className="h-4 w-4 text-slate-500" />}
              label="Gasto real proveedor"
              value={String(resumen.gastoRealCantidad ?? Math.max(0, resumen.totalCheques - resumen.financieros))}
              subvalue={
                resumen.gastoRealMontoCentavos != null
                  ? formatMoneyCentavos(resumen.gastoRealMontoCentavos, 'ARS')
                  : undefined
              }
              hint="Fuera del circuito"
            />
            <ResumenCard
              icon={<RefreshCw className="h-4 w-4 text-blue-500" />}
              label="Con renovación"
              value={String(resumen.conRenovacion)}
              subvalue={
                resumen.costoFinanciero.cantidadCadenas > 0
                  ? `Interés: ${formatMoneyCentavos(resumen.costoFinanciero.interesTotalCentavos, 'ARS')}`
                  : undefined
              }
              hint={
                resumen.costoFinanciero.cantidadCadenas > 0
                  ? `${resumen.costoFinanciero.cantidadCadenas} cadenas · Tasa ${(resumen.costoFinanciero.tasaImplicitaPromedio * 100).toFixed(1)}%`
                  : undefined
              }
            />
            <ResumenCard
              icon={<DollarSign className="h-4 w-4 text-green-500" />}
              label="Operaciones USD"
              value={
                resumen.operacionesUsdUnicas != null
                  ? `${resumen.operacionesUsdUnicas} ops (${resumen.conUsd} chq)`
                  : String(resumen.conUsd)
              }
              subvalue={
                resumen.totalMontoUsd
                  ? `US$ ${resumen.totalMontoUsd.toLocaleString('es-AR')}`
                  : undefined
              }
              hint={
                resumen.cotizacionPromedioUsd
                  ? `TC prom. $ ${resumen.cotizacionPromedioUsd.toLocaleString('es-AR')} · click en solapa USD`
                  : undefined
              }
            />
          </div>

          {resumen.porMes && resumen.porMes.length > 0 ? (
            <div className="surface-card mb-4 rounded-2xl border border-neutral-200 p-3 dark:border-zinc-800">
              <p className="text-body-muted text-xs font-medium uppercase tracking-wide">
                Concentración de vencimientos pendientes por mes
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {resumen.porMes.map((m) => (
                  <div
                    key={m.mes}
                    className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800/60"
                  >
                    <span className="text-heading font-semibold">{m.mes}</span>
                    <span className="text-body-muted ml-1.5">({m.cantidad})</span>
                    <span className="text-brand-primary ml-2 font-semibold tabular-nums">
                      {formatMoneyCentavos(m.montoCentavos, 'ARS')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
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
            ch.revisar.length > 0 || !ch.beneficiario.trim() ? (
              <span className="inline-block rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                A revisar
              </span>
            ) : (
              <span className="text-body-muted text-xs">Gasto real</span>
            )
          ) : null}
        </div>
      </td>
      <td className="max-w-[200px] truncate px-3 py-2 text-xs text-body-muted" title={ch.obsOriginal}>
        {ch.obsOriginal || '—'}
      </td>
    </tr>
  )
}

function ResumenCard({
  icon,
  label,
  value,
  subvalue,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  subvalue?: string
  hint?: string
}) {
  return (
    <div className="surface-card rounded-2xl border border-neutral-200 p-3 dark:border-zinc-800">
      <div className="text-body-muted flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {label}
      </div>
      <p className="text-heading mt-1 text-lg font-bold tabular-nums">{value}</p>
      {subvalue ? <p className="text-brand-primary text-xs font-semibold tabular-nums">{subvalue}</p> : null}
      {hint ? <p className="text-body-muted mt-0.5 text-[11px]">{hint}</p> : null}
    </div>
  )
}

function OcasionalDetalleModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['finanzas', 'cheques-ocasionales', 'detalle', id],
    queryFn: () => fetchOcasionalDetalle(id),
  })
  const ch = data?.cheque
  const clasif = data?.clasificacion
  const cadena = data?.cadena
  const renovDe = data?.renovacionDeDetalle ?? []
  const renovPor = data?.renovadoPorDetalle ?? []

  const sumaViejosCentavos = renovDe.reduce((s, r) => s + (r.montoCentavos ?? 0), 0)
  const todosViejosConMonto = renovDe.length > 0 && renovDe.every((r) => r.montoCentavos !== null)
  const interesPasoCentavos =
    ch && todosViejosConMonto && renovDe.length === 1
      ? ch.montoCentavos - sumaViejosCentavos
      : null

  const equivalenteUsdCentavos =
    ch?.operacionUsd
      ? Math.round(ch.operacionUsd.montoUsd * ch.operacionUsd.cotizacion * 100)
      : null

  const rolLabel =
    clasif?.rolEnCadena === 'capital'
      ? 'Capital inicial de la cadena'
      : clasif?.rolEnCadena === 'mixto'
        ? 'Eslabón intermedio (renovado)'
        : clasif?.rolEnCadena === 'interes'
          ? 'Eslabón vigente (capital + interés acumulado)'
          : null

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
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {ch.esProveedorFinanciero || clasif?.clasificacion === 'operacion_financiera' ? (
                    <span className="inline-block rounded border border-violet-300 bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900 dark:border-violet-700 dark:bg-violet-900/40 dark:text-violet-200">
                      Circuito financiero (interés / divisa)
                    </span>
                  ) : (
                    <span className="inline-block rounded border border-neutral-300 bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      Gasto real de proveedor
                    </span>
                  )}
                  {rolLabel ? (
                    <span className="inline-block rounded border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                      {rolLabel}
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="text-brand-primary whitespace-nowrap text-lg font-semibold">
                {formatMoneyCentavos(ch.montoCentavos, 'ARS')}
              </p>
            </header>

            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-body-muted">Beneficiario real (DESTINATARIO)</dt>
              <dd className="font-medium">{ch.beneficiario || '—'}</dd>
              <dt className="text-body-muted">Emisión</dt>
              <dd>{formatFecha(ch.fechaEmision)}</dd>
              <dt className="text-body-muted">Vencimiento</dt>
              <dd>{formatFecha(ch.fechaVencimiento)}</dd>
              <dt className="text-body-muted">Pagado</dt>
              <dd>{ch.pagado ? 'Sí' : 'No (Compromiso pendiente)'}</dd>
              {ch.obsOriginal ? (
                <>
                  <dt className="text-body-muted">OBS original</dt>
                  <dd className="font-mono text-xs">{ch.obsOriginal}</dd>
                </>
              ) : null}
            </dl>

            {ch.operacionUsd ? (
              <div className="mt-4 rounded-xl border border-green-200 bg-green-50/60 p-3 text-sm dark:border-green-900/60 dark:bg-green-950/20">
                <p className="text-xs font-semibold uppercase tracking-wide text-green-800 dark:text-green-300">
                  Cálculo Operación en Dólares (OBS)
                </p>
                <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  <dt className="text-body-muted">Monto USD</dt>
                  <dd className="font-semibold">
                    US$ {ch.operacionUsd.montoUsd.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </dd>
                  <dt className="text-body-muted">Tipo de cambio pactado</dt>
                  <dd className="font-semibold">
                    $ {ch.operacionUsd.cotizacion.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </dd>
                  {equivalenteUsdCentavos !== null ? (
                    <>
                      <dt className="text-body-muted">Equivalente (USD × TC)</dt>
                      <dd className="font-semibold">{formatMoneyCentavos(equivalenteUsdCentavos, 'ARS')}</dd>
                      <dt className="text-body-muted">Importe de este cheque</dt>
                      <dd className="font-semibold">
                        {formatMoneyCentavos(ch.montoCentavos, 'ARS')}
                        {ch.montoCentavos < equivalenteUsdCentavos
                          ? ' (fraccionado en varios cheques)'
                          : ch.montoCentavos > equivalenteUsdCentavos
                            ? ` (+${formatMoneyCentavos(ch.montoCentavos - equivalenteUsdCentavos, 'ARS')} s/ equivalente)`
                            : ''}
                      </dd>
                    </>
                  ) : null}
                </dl>
              </div>
            ) : null}

            {(renovDe.length > 0 || renovPor.length > 0 || cadena) ? (
              <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/50 p-3 text-sm dark:border-violet-900/60 dark:bg-violet-950/20">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-900 dark:text-violet-300">
                  Tracking de Renovación y Costo Financiero
                </p>

                {renovDe.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-body-muted text-xs font-medium">
                      Reemplaza a ({renovDe.length} {renovDe.length === 1 ? 'cheque viejo' : 'cheques viejos'}):
                    </p>
                    <ul className="mt-1 space-y-1 text-xs">
                      {renovDe.map((r) => (
                        <li key={r.numeroCheque} className="flex flex-wrap items-center justify-between gap-2 font-mono">
                          <span>{r.numeroCheque}</span>
                          <span>
                            {r.montoCentavos !== null ? formatMoneyCentavos(r.montoCentavos, 'ARS') : 'Monto s/d'}
                            {r.fechaVencimiento ? ` · vto ${formatFecha(r.fechaVencimiento)}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {todosViejosConMonto && renovDe.length > 1 ? (
                      <p className="text-body-muted mt-1 text-xs">
                        Suma cheques reemplazados:{' '}
                        <span className="text-heading font-semibold">
                          {formatMoneyCentavos(sumaViejosCentavos, 'ARS')}
                        </span>
                      </p>
                    ) : null}
                    {interesPasoCentavos !== null ? (
                      <p className="mt-1 text-xs">
                        Diferencia / interés en este cheque:{' '}
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          {formatMoneyCentavos(interesPasoCentavos, 'ARS')}
                          {sumaViejosCentavos > 0
                            ? ` (${((interesPasoCentavos / sumaViejosCentavos) * 100).toFixed(1)}%)`
                            : ''}
                        </span>
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {renovPor.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-body-muted text-xs font-medium">Renovado posteriormente por:</p>
                    <ul className="mt-1 space-y-1 text-xs">
                      {renovPor.map((r) => (
                        <li key={r.numeroCheque} className="flex flex-wrap items-center justify-between gap-2 font-mono">
                          <span>{r.numeroCheque}</span>
                          <span>
                            {r.montoCentavos !== null ? formatMoneyCentavos(r.montoCentavos, 'ARS') : 'Monto s/d'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {cadena ? (
                  <div className="mt-2 border-t border-violet-200/70 pt-2 text-xs dark:border-violet-800/50">
                    <p className="text-body-muted">
                      Cadena completa ({cadena.cheques.length} eslabones):{' '}
                      <span className="text-heading font-medium">
                        {formatMoneyCentavos(cadena.capitalInicialCentavos, 'ARS')} →{' '}
                        {formatMoneyCentavos(cadena.montoFinalCentavos, 'ARS')}
                      </span>{' '}
                      · Interés:{' '}
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        {formatMoneyCentavos(cadena.interesTotalCentavos, 'ARS')} (
                        {(cadena.tasaImplicita * 100).toFixed(1)}%)
                      </span>
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

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
