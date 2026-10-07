import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, ClipboardPaste, Search, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { fetchMovimientoById, type MovimientoListItem } from '../../services/finanzasMovimientosApi'
import toast from 'react-hot-toast'
import { finanzasInputClass } from '../../components/finanzas/FinanzasFormField'
import { formatMoneyCentavos } from '../../components/finanzas/formatMoney'
import { usePermisosFinanzas } from '../../components/finanzas/permisosFinanzas'
import { useAuth } from '../../context'
import {
  CHEQUE_DIRECCION_LABELS,
  CHEQUE_ESTADO_LABELS,
  fetchCheques,
  fetchResumenDiario,
  importChequesExcel,
  ingresarChequesPegados,
  type ChequeDireccion,
  type ChequeEstado,
  type ChequeOrigen,
  type ChequeTipo,
  type IngresarChequesRow,
} from '../../services/finanzasChequesApi'

const CHEQUE_ORIGEN_LABELS: Record<ChequeOrigen, string> = {
  cliente: 'Cliente',
  tercero: 'Tercero',
  propio: 'Propio',
}

const PAGE_SIZE = 50

const FISICO_RE = /^\d{3}-\d{3}-\d{4}-\d{8}$/

function detectTipo(numero: string): ChequeTipo {
  if (numero.toUpperCase().startsWith('E-CHEQ')) return 'echeq'
  return FISICO_RE.test(numero.trim()) ? 'fisico' : 'echeq'
}

function formatFecha(iso: string): string {
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

function calcDias(fechaEmision: string, fechaPago: string): number | null {
  if (!fechaEmision || !fechaPago) return null
  const a = new Date(fechaEmision + 'T00:00:00')
  const b = new Date(fechaPago + 'T00:00:00')
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

// ── Main page ───────────────────────────────────────────────────────

function mesActual() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const last = new Date(y, now.getMonth() + 1, 0).getDate()
  return { desde: `${y}-${m}-01`, hasta: `${y}-${m}-${String(last).padStart(2, '0')}` }
}

export function FinanzasChequesPage() {
  const { user } = useAuth()
  const puedeCheques = usePermisosFinanzas().cheques
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [movDetalle, setMovDetalle] = useState<MovimientoListItem | null>(null)
  const [movCargando, setMovCargando] = useState(false)

  const [direccion, setDireccion] = useState<ChequeDireccion | ''>('')
  const [origen, setOrigen] = useState<ChequeOrigen | ''>('')
  const [estado, setEstado] = useState<ChequeEstado | ''>('')
  const [tipo, setTipo] = useState<ChequeTipo | ''>('')
  const [vinculacion, setVinculacion] = useState<'' | 'vinculado' | 'sin_vincular'>('')
  const { desde: mesDesde, hasta: mesHasta } = mesActual()
  const [desde, setDesde] = useState(() => {
    try { return sessionStorage.getItem('cheques_desde') ?? mesDesde } catch { return mesDesde }
  })
  const [hasta, setHasta] = useState(() => {
    try { return sessionStorage.getItem('cheques_hasta') ?? mesHasta } catch { return mesHasta }
  })
  const [page, setPage] = useState(1)
  const [showPegar, setShowPegar] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(busqueda.trim())
      setPage(1)
    }, 400)
    return () => clearTimeout(t)
  }, [busqueda])

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['finanzas', 'cheques', direccion, origen, estado, tipo, vinculacion, desde, hasta, q, page],
    queryFn: () =>
      fetchCheques({
        direccion,
        origen,
        estado,
        tipo,
        vinculacion,
        desde: desde || undefined,
        hasta: hasta || undefined,
        q: q || undefined,
        page,
        limit: PAGE_SIZE,
      }),
    enabled: Boolean(user),
    placeholderData: (prev) => prev,
  })

  const { data: resumen } = useQuery({
    queryKey: ['finanzas', 'cheques', 'resumen-diario'],
    queryFn: fetchResumenDiario,
    enabled: Boolean(user),
  })

  const importMutation = useMutation({
    mutationFn: importChequesExcel,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['finanzas', 'cheques'] })
      const parts: string[] = [`${result.insertados} nuevos`]
      if (result.actualizados > 0) parts.push(`${result.actualizados} actualizados`)
      if (result.duplicados > 0) parts.push(`${result.duplicados} duplicados`)
      if (result.ignorados > 0) parts.push(`${result.ignorados} ignorados`)
      toast.success(parts.join(', '))
      if (result.errores.length > 0) {
        toast.error(result.errores.slice(0, 5).join('\n'), { duration: 8000 })
      }
      if (result.avisos.length > 0) {
        const max = 5
        const texto = result.avisos.slice(0, max).join('\n')
        const extra = result.avisos.length > max ? `\n… y ${result.avisos.length - max} más` : ''
        toast(texto + extra, { duration: 8000, icon: 'ℹ️' })
      }
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    importMutation.mutate(file)
    e.target.value = ''
  }

  function cambiarFiltro(apply: () => void) {
    apply()
    setPage(1)
  }

  const total = data?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const DIR_TABS: [ChequeDireccion | '', string][] = [
    ['', 'Todos'],
    ['recibido', 'Recibidos'],
    ['emitido', 'Emitidos'],
  ]

  const TIPO_TABS: [ChequeTipo | '', string][] = [['', 'Todos'], ['echeq', 'eCheq'], ['fisico', 'Físicos']]

  const estadosVisibles: ChequeEstado[] = direccion === 'emitido'
    ? ['pendiente', 'debitado', 'rechazado']
    : direccion === 'recibido'
      ? ['en_cartera', 'depositado', 'vendido', 'rechazado']
      : ['en_cartera', 'depositado', 'vendido', 'rechazado', 'pendiente', 'debitado']

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-heading text-2xl font-semibold">Chequera Virtual</h1>
        </div>
        {puedeCheques ? <div className="flex gap-2">
          <button
            type="button"
            data-tour="cheques-ingresar"
            className="btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
            onClick={() => setShowPegar(true)}
          >
            <ClipboardPaste className="h-4 w-4" />
            Ingresar cheques
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            className="border-subtle text-body-muted inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
            disabled={importMutation.isPending}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {importMutation.isPending ? 'Importando…' : 'Importar Excel'}
          </button>
        </div> : null}
      </header>

      {resumen ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <div className="card-minimal px-5 py-4" data-tour="cheques-resumen">
            <p className="text-brand-muted text-xs font-medium uppercase tracking-wide">
              Hoy {formatFecha(resumen.fecha)}
            </p>
            <p className="text-brand-primary mt-1 text-lg font-semibold">
              {resumen.cantidadACobrar === 0
                ? 'No hay cheques que venzan hoy'
                : `${resumen.cantidadACobrar} cheque${resumen.cantidadACobrar === 1 ? '' : 's'} a cobrar por ${formatMoneyCentavos(resumen.totalACobrarCentavos, 'ARS')}`}
            </p>
          </div>
          <div className="card-minimal px-5 py-4">
            <p className="text-brand-muted text-xs font-medium uppercase tracking-wide">
              Próximos vencimientos
            </p>
            <p className="text-brand-primary mt-1 text-lg font-semibold">
              {resumen.proximos.cantidadACobrar === 0
                ? 'No hay cheques próximos a vencer'
                : `${resumen.proximos.cantidadACobrar} cheque${resumen.proximos.cantidadACobrar === 1 ? '' : 's'} por ${formatMoneyCentavos(resumen.proximos.totalACobrarCentavos, 'ARS')}`}
            </p>
          </div>
        </div>
      ) : null}

      {/* Tabs: dirección */}
      <div className="mb-4" data-tour="cheques">
        <div className="inline-flex rounded-xl border border-neutral-200 p-1 dark:border-zinc-800">
          {DIR_TABS.map(([val, label]) => (
            <button
              key={val}
              type="button"
              data-tour={val === 'recibido' ? 'cheques-direccion' : undefined}
              onClick={() => cambiarFiltro(() => { setDireccion(val); setEstado('') })}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                direccion === val
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'text-body-muted hover:text-heading'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Cards resumen por dirección */}
      {data ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="card-minimal px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-success, #16a34a)' }}>
              <ArrowDownLeft className="mr-1 inline h-3 w-3" />
              Recibidos
            </p>
            <p className="mt-1 text-lg font-semibold" style={{ color: 'var(--color-success, #16a34a)' }}>
              {formatMoneyCentavos(data.recibidosCentavos, 'ARS')}
            </p>
          </div>
          <div className="card-minimal px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-danger, #dc2626)' }}>
              <ArrowUpRight className="mr-1 inline h-3 w-3" />
              Emitidos
            </p>
            <p className="mt-1 text-lg font-semibold" style={{ color: 'var(--color-danger, #dc2626)' }}>
              {formatMoneyCentavos(data.emitidosCentavos, 'ARS')}
            </p>
          </div>
          <div className="card-minimal px-4 py-3">
            <p className="text-brand-muted text-xs font-medium uppercase tracking-wide">
              Neto
            </p>
            <p className="text-brand-primary mt-1 text-lg font-semibold">
              {formatMoneyCentavos(data.recibidosCentavos - data.emitidosCentavos, 'ARS')}
            </p>
          </div>
        </div>
      ) : null}

      {/* Buscador */}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          className={`${finanzasInputClass} pl-9`}
          placeholder="Buscar por número, contraparte o cliente…"
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

      {/* Filtros */}
      <div className="mb-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          <span className="text-body-muted mb-1 block">Tipo</span>
          <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 dark:border-zinc-800">
            {TIPO_TABS.map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => cambiarFiltro(() => setTipo(val))}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  tipo === val
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'text-body-muted hover:text-heading'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </label>
        <label className="text-sm" data-tour="cheques-filtro-estado">
          <span className="text-body-muted mb-1 block">Estado</span>
          <select
            className={finanzasInputClass}
            value={estado}
            onChange={(e) => cambiarFiltro(() => setEstado(e.target.value as ChequeEstado | ''))}
          >
            <option value="">Todos</option>
            {estadosVisibles.map((val) => (
              <option key={val} value={val}>{CHEQUE_ESTADO_LABELS[val]}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-body-muted mb-1 block">Origen</span>
          <select
            className={finanzasInputClass}
            value={origen}
            onChange={(e) => cambiarFiltro(() => setOrigen(e.target.value as ChequeOrigen | ''))}
          >
            <option value="">Todos</option>
            {Object.entries(CHEQUE_ORIGEN_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-body-muted mb-1 block">Movimiento</span>
          <select
            className={finanzasInputClass}
            value={vinculacion}
            onChange={(e) => cambiarFiltro(() => setVinculacion(e.target.value as '' | 'vinculado' | 'sin_vincular'))}
          >
            <option value="">Todos</option>
            <option value="vinculado">Con movimiento</option>
            <option value="sin_vincular">Sin movimiento</option>
          </select>
        </label>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm" data-tour="cheques-filtro-desde">
          <span className="text-body-muted mb-1 block">Vencimiento desde</span>
          <input
            type="date"
            className={finanzasInputClass}
            value={desde}
            onChange={(e) => cambiarFiltro(() => { setDesde(e.target.value); try { sessionStorage.setItem('cheques_desde', e.target.value) } catch {} })}
          />
        </label>
        <label className="text-sm" data-tour="cheques-filtro-hasta">
          <span className="text-body-muted mb-1 block">Vencimiento hasta</span>
          <input
            type="date"
            className={finanzasInputClass}
            value={hasta}
            onChange={(e) => cambiarFiltro(() => { setHasta(e.target.value); try { sessionStorage.setItem('cheques_hasta', e.target.value) } catch {} })}
          />
        </label>
      </div>

      {/* Total del filtro actual */}
      {data ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="card-minimal px-4 py-3">
            <p className="text-brand-muted text-xs font-medium uppercase tracking-wide">Total en filtro</p>
            <p className="text-brand-primary mt-1 text-lg font-semibold">
              {formatMoneyCentavos(data.totalCentavos, 'ARS')}
            </p>
          </div>
          <div className="card-minimal px-4 py-3">
            <p className="text-body-muted text-xs font-medium uppercase tracking-wide">Cheques</p>
            <p className="text-heading mt-1 text-lg font-semibold">{total.toLocaleString('es-AR')}</p>
          </div>
        </div>
      ) : null}

      {isError ? (
        <p className="text-danger text-sm">{error instanceof Error ? error.message : 'No se pudieron cargar los cheques'}</p>
      ) : null}

      {isLoading ? (
        <p className="text-body-muted text-sm">Cargando cheques…</p>
      ) : (
        <div className={`surface-card overflow-x-auto ${isFetching ? 'opacity-70' : ''}`} data-tour="cheques-lista">
          <table className="min-w-full text-sm">
            <thead className="surface-muted text-left text-xs uppercase tracking-wide">
              <tr className="text-body-muted">
                {!direccion ? <th className="px-3 py-2">Dir.</th> : null}
                <th className="px-3 py-2">Nº</th>
                <th className="px-3 py-2">
                  {direccion === 'emitido' ? 'Destinatario' : direccion === 'recibido' ? 'Emisor' : 'Contraparte'}
                </th>
                {direccion !== 'emitido' ? <th className="px-3 py-2">Cliente</th> : null}
                <th className="px-3 py-2">Emisión</th>
                <th className="px-3 py-2">Vencimiento</th>
                <th className="px-3 py-2 text-center">Días</th>
                <th className="px-3 py-2 text-right">Importe</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Mov.</th>
                <th className="px-3 py-2">Obs.</th>
              </tr>
            </thead>
            <tbody>
              {(data?.cheques ?? []).map((ch) => (
                <tr key={ch.id} className="border-t border-subtle">
                  {!direccion ? (
                    <td className="px-3 py-2">
                      <DireccionBadge direccion={ch.direccion} />
                    </td>
                  ) : null}
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                    {ch.numero}
                    {ch.bancoEmisor ? <span className="text-body-muted block font-sans text-[11px]">{ch.bancoEmisor}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    {ch.direccion === 'emitido'
                      ? (ch.destinatario || '—')
                      : (ch.emisor || '—')}
                    {ch.emisorCuit && ch.direccion === 'recibido' ? <span className="text-body-muted block text-xs">{ch.emisorCuit}</span> : null}
                  </td>
                  {direccion !== 'emitido' ? (
                    <td className="px-3 py-2 text-xs">{ch.cliente || '—'}</td>
                  ) : null}
                  <td className="whitespace-nowrap px-3 py-2">{ch.fechaEmision ? formatFecha(ch.fechaEmision) : '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2">{ch.fechaPago ? formatFecha(ch.fechaPago) : '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-center text-xs">
                    {(() => {
                      const dias = calcDias(ch.fechaEmision, ch.fechaPago)
                      if (dias == null) return '—'
                      return <span className="text-body-muted">{dias}d</span>
                    })()}
                  </td>
                  <td className="text-brand-primary whitespace-nowrap px-3 py-2 text-right font-medium">
                    {formatMoneyCentavos(ch.montoCentavos, 'ARS')}
                  </td>
                  <td className="px-3 py-2"><TipoBadge tipo={ch.tipo} /></td>
                  <td className="px-3 py-2">
                    <CondicionBadge estado={ch.estado} />
                    {ch.estado === 'rechazado' && ch.estadoBancario && /confirmado.*resumen/i.test(ch.estadoBancario) ? (
                      <span
                        className="group relative ml-1 inline-block cursor-help align-middle text-xs text-amber-600 dark:text-amber-400"
                      >
                        &#9432;
                        <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-neutral-800 px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover:block dark:bg-zinc-700">
                          Debitado
                        </span>
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    {ch.movimientoBancarioId ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50"
                        title={`Ver movimiento del ${ch.movimientoFecha ?? ''}`}
                        onClick={async () => {
                          setMovCargando(true)
                          try {
                            const mov = await fetchMovimientoById(ch.movimientoBancarioId!)
                            setMovDetalle(mov)
                          } catch { toast.error('No se pudo cargar el movimiento') }
                          finally { setMovCargando(false) }
                        }}
                      >
                        ✓ {ch.movimientoFecha ? formatFecha(ch.movimientoFecha) : 'Vinculado'}
                      </button>
                    ) : (
                      <span className="text-body-muted">—</span>
                    )}
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-xs" title={ch.observaciones ?? ''}>
                    {ch.observaciones || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(data?.cheques.length ?? 0) === 0 ? (
            <p className="text-body-muted px-4 py-8 text-center">No hay cheques con esos filtros.</p>
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

      {puedeCheques && showPegar ? (
        <PegarChequesModal
          onClose={() => setShowPegar(false)}
          onSuccess={() => {
            setShowPegar(false)
            queryClient.invalidateQueries({ queryKey: ['finanzas', 'cheques'] })
          }}
        />
      ) : null}

      {movDetalle ? (
        <MovimientoDetalleModal movimiento={movDetalle} onClose={() => setMovDetalle(null)} />
      ) : null}
      {movCargando ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="surface-card rounded-xl px-6 py-4 shadow-lg">
            <p className="text-body-muted text-sm">Cargando movimiento…</p>
          </div>
        </div>
      ) : null}
    </>
  )
}

// ── Badges ───────────────────────────────────────────────────────────

function DireccionBadge({ direccion }: { direccion: ChequeDireccion }) {
  const isRecibido = direccion === 'recibido'
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${
      isRecibido
        ? 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
        : 'border-orange-300 bg-orange-100 text-orange-900 dark:border-orange-700 dark:bg-orange-900/40 dark:text-orange-200'
    }`}>
      {isRecibido
        ? <ArrowDownLeft className="h-3 w-3" />
        : <ArrowUpRight className="h-3 w-3" />}
      {CHEQUE_DIRECCION_LABELS[direccion]}
    </span>
  )
}

function CondicionBadge({ estado }: { estado: ChequeEstado }) {
  const styles: Record<ChequeEstado, string> = {
    en_cartera: 'bg-brand-primary-light text-brand-primary',
    depositado: 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
    vendido: 'border-purple-300 bg-purple-100 text-purple-900 dark:border-purple-700 dark:bg-purple-900/40 dark:text-purple-200',
    rechazado: 'bg-[var(--color-danger-bg)] text-[var(--color-danger-text)] border-[var(--color-danger-border)]',
    pendiente: 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
    debitado: 'border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-200',
  }
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${styles[estado]}`}>
      {CHEQUE_ESTADO_LABELS[estado]}
    </span>
  )
}

function TipoBadge({ tipo }: { tipo: string }) {
  const isEcheq = tipo === 'echeq'
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${
      isEcheq
        ? 'bg-brand-primary-light text-brand-primary border-[var(--color-primary-muted)]'
        : 'border-subtle surface-muted text-body-muted'
    }`}>
      {isEcheq ? 'eCheq' : 'Físico'}
    </span>
  )
}

// ── Paste modal ─────────────────────────────────────────────────────

interface ParsedRow extends IngresarChequesRow {
  _valid: boolean
  estadoVisual: string
}

const HEADER_HINTS = ['n°', 'nro', 'numero', 'emisor']

function looksLikeHeader(firstCell: string): boolean {
  const norm = firstCell.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  return HEADER_HINTS.some((h) => norm.includes(h))
}

function parseTSVRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let i = 0
  const len = text.length

  while (i < len) {
    if (text[i] === '"') {
      i++
      let field = ''
      while (i < len) {
        if (text[i] === '"') {
          if (i + 1 < len && text[i + 1] === '"') { field += '"'; i += 2 }
          else { i++; break }
        } else { field += text[i]; i++ }
      }
      row.push(field)
    } else {
      let field = ''
      while (i < len && text[i] !== '\t' && text[i] !== '\n' && text[i] !== '\r') {
        field += text[i]; i++
      }
      row.push(field)
    }

    if (i < len && text[i] === '\t') { i++ }
    else {
      if (i < len && text[i] === '\r') i++
      if (i < len && text[i] === '\n') i++
      rows.push(row)
      row = []
    }
  }
  if (row.length > 0) rows.push(row)
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

function buildRow(cols: string[]): ParsedRow {
  const numero = (cols[0] ?? '').trim()
  const montoPesos = (cols[4] ?? '').trim()
  return {
    numero,
    emisor: (cols[1] ?? '').trim(),
    fechaEmision: (cols[2] ?? '').trim(),
    fechaPago: (cols[3] ?? '').trim(),
    montoPesos,
    cmc7: (cols[5] ?? '').trim(),
    endosante: (cols[6] ?? '').trim(),
    bancoEmisor: (cols[7] ?? '').trim(),
    tipo: detectTipo(numero),
    condicion: (cols[9] ?? '').trim(),
    estadoVisual: (cols[10] ?? '').trim(),
    _valid: numero.length > 0 && montoPesos.length > 0 && montoPesos !== '0',
  }
}

function emptyRow(): ParsedRow {
  return buildRow([])
}

const INPUT_CLS = 'w-full rounded border border-transparent bg-transparent px-1 py-0.5 focus:border-neutral-300 focus:outline-none dark:focus:border-zinc-600'

function MovimientoDetalleModal({ movimiento, onClose }: { movimiento: MovimientoListItem; onClose: () => void }) {
  const entrada = movimiento.tipo === 'credito'
  const contraparte = typeof movimiento.contraparte === 'string'
    ? movimiento.contraparte
    : movimiento.contraparte?.nombre ?? null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="surface-card w-full max-w-md rounded-2xl p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-heading mb-4 text-lg font-semibold">Detalle del movimiento</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-body-muted">Fecha</dt>
          <dd>{formatFecha(movimiento.fechaProceso)}</dd>

          <dt className="text-body-muted">Descripción</dt>
          <dd>{movimiento.descripcion}</dd>

          {contraparte ? <>
            <dt className="text-body-muted">Contraparte</dt>
            <dd>{contraparte}</dd>
          </> : null}

          <dt className="text-body-muted">Tipo</dt>
          <dd>
            <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${
              entrada
                ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
                : 'border-red-300 bg-red-100 text-red-900'
            }`}>
              {entrada ? 'Entrada' : 'Salida'}
            </span>
          </dd>

          <dt className="text-body-muted">Monto</dt>
          <dd className={`font-medium ${entrada ? 'text-emerald-800' : 'text-red-800'}`}>
            {entrada ? '' : '−'}{formatMoneyCentavos(movimiento.montoCentavos, 'ARS')}
          </dd>

          <dt className="text-body-muted">Cuenta</dt>
          <dd>{movimiento.bancoNombre}</dd>

          {movimiento.nota ? <>
            <dt className="text-body-muted">Nota</dt>
            <dd>{movimiento.nota}</dd>
          </> : null}
        </dl>
        <div className="mt-5 text-right">
          <button type="button" className="btn-primary rounded-lg px-4 py-2 text-sm font-medium" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function PegarChequesModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [direccionModal, setDireccionModal] = useState<ChequeDireccion>('recibido')
  const [origenModal, setOrigenModal] = useState<ChequeOrigen>('tercero')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [saving, setSaving] = useState(false)

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text/plain')
    if (!text.includes('\t') && !text.includes('\n')) return
    e.preventDefault()

    const tsvRows = parseTSVRows(text.trim())
    if (tsvRows.length === 0) return

    const start = looksLikeHeader(tsvRows[0][0] ?? '') ? 1 : 0
    const parsed = tsvRows.slice(start).map((cols) => buildRow(cols))

    if (parsed.length > 0) {
      setRows(parsed)
      toast.success(`${parsed.length} fila${parsed.length === 1 ? '' : 's'} pegada${parsed.length === 1 ? '' : 's'}`)
    }
  }

  function updateRow(idx: number, field: keyof IngresarChequesRow, value: string) {
    setRows((prev) => {
      const next = [...prev]
      const row = { ...next[idx], [field]: value }
      if (field === 'numero') row.tipo = detectTipo(value)
      row._valid = row.numero.trim().length > 0 && row.montoPesos.trim().length > 0 && row.montoPesos.trim() !== '0'
      next[idx] = row
      return next
    })
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()])
  }

  async function handleConfirm() {
    const validRows = rows.filter((r) => r._valid)
    if (validRows.length === 0) {
      toast.error('No hay filas válidas para ingresar')
      return
    }
    setSaving(true)
    try {
      const payload = validRows.map(({ _valid: _, estadoVisual: __, ...r }) => r)
      const result = await ingresarChequesPegados({ direccion: direccionModal, origen: origenModal, rows: payload })
      const parts: string[] = [`${result.insertados} nuevos`]
      if (result.actualizados > 0) parts.push(`${result.actualizados} actualizados`)
      if (result.duplicados > 0) parts.push(`${result.duplicados} duplicados`)
      if (result.ignorados > 0) parts.push(`${result.ignorados} ignorados`)
      toast.success(parts.join(', '))
      if (result.errores.length > 0) {
        toast.error(result.errores.slice(0, 5).join('\n'), { duration: 8000 })
      }
      if (result.avisos?.length > 0) {
        const max = 5
        const texto = result.avisos.slice(0, max).join('\n')
        const extra = result.avisos.length > max ? `\n… y ${result.avisos.length - max} más` : ''
        toast(texto + extra, { duration: 8000, icon: 'ℹ️' })
      }
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al ingresar cheques')
    } finally {
      setSaving(false)
    }
  }

  const validCount = rows.filter((r) => r._valid).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Cerrar" />
      <section data-tour="cheques-ingresar-ventana" className="relative flex max-h-[95vh] w-full max-w-[95vw] flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-zinc-900">
        <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-zinc-700">
          <h2 className="text-heading text-lg font-semibold">Ingresar cheques</h2>
          <button type="button" className="text-body-muted hover:text-heading text-xl leading-none" onClick={onClose}>×</button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <div className="max-w-xs" data-tour="cheques-ingresar-direccion">
              <label className="text-sm">
                <span className="text-body-muted mb-1 block">Dirección</span>
                <select
                  className={finanzasInputClass}
                  value={direccionModal}
                  onChange={(e) => {
                    const dir = e.target.value as ChequeDireccion
                    setDireccionModal(dir)
                    if (dir === 'emitido') setOrigenModal('propio')
                    else setOrigenModal('tercero')
                  }}
                >
                  {Object.entries(CHEQUE_DIRECCION_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="max-w-xs">
              <label className="text-sm">
                <span className="text-body-muted mb-1 block">Origen del lote</span>
                <select
                  className={finanzasInputClass}
                  value={origenModal}
                  onChange={(e) => setOrigenModal(e.target.value as ChequeOrigen)}
                >
                  {Object.entries(CHEQUE_ORIGEN_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              data-tour="cheques-ingresar-agregar-fila"
              className="border-subtle text-body-muted rounded-lg border px-3 py-2 text-sm font-medium"
              onClick={addRow}
            >
              + Agregar fila
            </button>
          </div>

          <div
            className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-zinc-700"
            data-tour="cheques-ingresar-tabla"
            onPaste={handlePaste}
          >
            <table className="min-w-[1400px] text-xs">
              <thead className="surface-muted text-left uppercase tracking-wide">
                <tr className="text-body-muted">
                  <th className="w-10 px-2 py-1.5 text-center">#</th>
                  <th className="w-36 px-2 py-1.5">N°</th>
                  <th className="w-48 px-2 py-1.5">Emisor</th>
                  <th className="w-28 px-2 py-1.5">Emisión</th>
                  <th className="w-28 px-2 py-1.5">Pago</th>
                  <th className="w-32 px-2 py-1.5">Importe</th>
                  <th className="w-32 px-2 py-1.5">Estado</th>
                  <th className="w-44 px-2 py-1.5">CMC7</th>
                  <th className="w-44 px-2 py-1.5">Endosante</th>
                  <th className="w-40 px-2 py-1.5">Banco</th>
                  <th className="w-16 px-2 py-1.5">Tipo</th>
                  <th className="w-28 px-2 py-1.5">Condición</th>
                  <th className="w-8 px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="text-body-muted px-4 py-10 text-center">
                      Pegue datos copiados de Excel aquí (Ctrl+V)
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => (
                    <tr key={idx} data-tour={idx === 0 ? 'cheques-ingresar-fila' : undefined} className={`border-t border-subtle ${row._valid ? '' : 'bg-red-50 dark:bg-red-900/20'}`}>
                      <td className="text-body-muted px-2 py-1 text-center">{idx + 1}</td>
                      <td className="px-1 py-1">
                        <input className={`${INPUT_CLS} font-mono`} value={row.numero} onChange={(e) => updateRow(idx, 'numero', e.target.value)} />
                      </td>
                      <td className="px-1 py-1">
                        <textarea className={`${INPUT_CLS} resize-none text-xs leading-tight`} rows={row.emisor.includes('\n') ? 2 : 1} value={row.emisor} onChange={(e) => updateRow(idx, 'emisor', e.target.value)} />
                      </td>
                      <td className="px-1 py-1">
                        <input className={INPUT_CLS} value={row.fechaEmision} onChange={(e) => updateRow(idx, 'fechaEmision', e.target.value)} />
                      </td>
                      <td className="px-1 py-1">
                        <input className={INPUT_CLS} value={row.fechaPago} onChange={(e) => updateRow(idx, 'fechaPago', e.target.value)} />
                      </td>
                      <td className="px-1 py-1">
                        <input className={`${INPUT_CLS} text-right`} value={row.montoPesos} onChange={(e) => updateRow(idx, 'montoPesos', e.target.value)} />
                      </td>
                      <td className="px-1 py-1">
                        <input className={INPUT_CLS} value={row.estadoVisual} onChange={(e) => { setRows((prev) => { const next = [...prev]; next[idx] = { ...next[idx], estadoVisual: e.target.value }; return next }) }} />
                      </td>
                      <td className="px-1 py-1">
                        <input className={`${INPUT_CLS} font-mono`} value={row.cmc7} onChange={(e) => updateRow(idx, 'cmc7', e.target.value)} />
                      </td>
                      <td className="px-1 py-1">
                        <input className={INPUT_CLS} value={row.endosante} onChange={(e) => updateRow(idx, 'endosante', e.target.value)} />
                      </td>
                      <td className="px-1 py-1">
                        <input className={INPUT_CLS} value={row.bancoEmisor} onChange={(e) => updateRow(idx, 'bancoEmisor', e.target.value)} />
                      </td>
                      <td className="px-2 py-1"><TipoBadge tipo={row.tipo} /></td>
                      <td className="px-1 py-1">
                        <input className={INPUT_CLS} value={row.condicion} onChange={(e) => updateRow(idx, 'condicion', e.target.value)} />
                      </td>
                      <td className="px-1 py-1 text-center">
                        <button type="button" className="text-body-muted hover:text-danger text-sm" onClick={() => removeRow(idx)} title="Quitar fila">×</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-neutral-200 px-6 py-4 dark:border-zinc-700">
          <div className="text-body-muted text-sm">
            {rows.length > 0 ? `${validCount} de ${rows.length} fila${rows.length === 1 ? '' : 's'} válida${validCount === 1 ? '' : 's'}` : ''}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="border-subtle rounded-lg border px-4 py-2 text-sm font-medium"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="button"
              data-tour="cheques-ingresar-confirmar"
              className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
              disabled={saving || validCount === 0}
              onClick={handleConfirm}
            >
              {saving ? 'Guardando…' : `Confirmar ${validCount} cheque${validCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
