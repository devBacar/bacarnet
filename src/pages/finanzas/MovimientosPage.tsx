import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownCircle, ArrowUpCircle, ListOrdered, Tags } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import toast from 'react-hot-toast'
import { useSearchParams } from 'react-router-dom'
import { CategoriasGestionModal } from '../../components/finanzas/CategoriasGestionModal'
import { CeldaContraparte } from '../../components/finanzas/ContraparteMovimiento'
import { finanzasInputClass } from '../../components/finanzas/FinanzasFormField'
import { formatMoneyCentavos } from '../../components/finanzas/formatMoney'
import { usePermisosFinanzas } from '../../components/finanzas/permisosFinanzas'
import { useAuth } from '../../context'
import { fetchChequeById, CHEQUE_ESTADO_LABELS, type ChequeListItem } from '../../services/finanzasChequesApi'
import { fetchFinanzasCuentas } from '../../services/finanzasApi'
import {
  actualizarMovimiento,
  aplicarReglasCategorizacion,
  completarContrapartes,
  crearCategoriaMovimiento,
  crearReglaCategorizacion,
  eliminarCategoriaMovimiento,
  fetchCategoriasMovimientos,
  fetchMovimientos,
  fusionarCategoriaMovimiento,
  patchCategoriaMovimiento,
  type CategoriaMovimiento,
  type MovimientoListItem,
  type MovimientoTipo,
} from '../../services/finanzasMovimientosApi'
import {
  CategoriaMovimientoChip,
  CategoriaMovimientoModal,
  type GuardarMovimientoInput,
} from './CategoriaMovimientoCampo'

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

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

function rangoInicial(params: URLSearchParams): { desde: string; hasta: string } {
  const hoy = isoArgentina(new Date())
  const desde = params.get('desde') ?? ''
  const hasta = params.get('hasta') ?? ''
  if (ISO_RE.test(desde) && ISO_RE.test(hasta) && desde <= hasta) return { desde, hasta }
  return { desde: addIsoDays(hoy, -29), hasta: hoy }
}

function formatFecha(iso: string): string {
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

export function FinanzasMovimientosPage() {
  const { user } = useAuth()
  const puedeCategorias = usePermisosFinanzas().categorias
  const queryClient = useQueryClient()
  // El Cashflow manda acá con ?cuenta=&desde=&hasta=&q= para categorizar lo que falta.
  const [searchParams] = useSearchParams()
  const [inicial] = useState(() => ({
    ...rangoInicial(searchParams),
    cuentaId: searchParams.get('cuenta') ?? '',
    q: searchParams.get('q')?.trim() ?? '',
  }))
  const [cuentaId, setCuentaId] = useState(inicial.cuentaId)
  const [desde, setDesde] = useState(inicial.desde)
  const [hasta, setHasta] = useState(inicial.hasta)
  const [tipo, setTipo] = useState<'' | MovimientoTipo>('')
  const [categoriaId, setCategoriaId] = useState('')
  const [q, setQ] = useState(inicial.q)
  const [qAplicada, setQAplicada] = useState(inicial.q)
  const [page, setPage] = useState(1)
  const [editando, setEditando] = useState<MovimientoListItem | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [gestionAbierta, setGestionAbierta] = useState(false)
  const [completando, setCompletando] = useState(false)
  const [chequeDetalle, setChequeDetalle] = useState<ChequeListItem | null>(null)
  const [chequeCargando, setChequeCargando] = useState(false)
  const categoriaFiltroId = useId()

  const { data: cuentasData } = useQuery({
    queryKey: ['finanzas', 'cuentas'],
    queryFn: fetchFinanzasCuentas,
    enabled: Boolean(user),
  })
  // Las cuentas que sincronizan con Interbanking son las que tienen movimientos (incluye CC en USD si aparecen).
  const cuentas = (cuentasData?.cuentas ?? []).filter((cuenta) => cuenta.origenSaldo === 'interbanking')

  useEffect(() => {
    if (cuentaId || cuentas.length === 0) return
    const cordoba = cuentas.find((cuenta) => cuenta.id === 'cordoba-cc')
    setCuentaId(cordoba?.id ?? cuentas[0].id)
  }, [cuentaId, cuentas])

  const filtrosListos = Boolean(cuentaId && desde && hasta && desde <= hasta)

  const { data: categorias = [] } = useQuery({
    queryKey: ['finanzas', 'categorias-movimientos'],
    queryFn: fetchCategoriasMovimientos,
    enabled: Boolean(user),
  })

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['finanzas', 'movimientos', cuentaId, desde, hasta, tipo, categoriaId, qAplicada, page],
    queryFn: () =>
      fetchMovimientos({
        cuentaId,
        desde,
        hasta,
        tipo,
        categoriaId,
        q: qAplicada,
        page,
        limit: PAGE_SIZE,
      }),
    enabled: Boolean(user) && filtrosListos,
    placeholderData: (prev) => prev,
  })

  async function invalidarTrasCambio() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['finanzas', 'movimientos'] }),
      queryClient.invalidateQueries({ queryKey: ['finanzas', 'categorias-movimientos'] }),
      queryClient.invalidateQueries({ queryKey: ['finanzas', 'cashflow'] }),
    ])
  }

  async function guardarMovimiento(input: GuardarMovimientoInput) {
    if (!editando) return
    setGuardando(true)
    try {
      await actualizarMovimiento(editando.id, {
        categoriaId: input.categoriaId,
        nota: input.nota,
        ...(input.contraparte
          ? {
              contraparteNombre: input.contraparte.nombre,
              contraparteCuit: input.contraparte.cuit,
            }
          : {}),
      })
      if (input.aplicarATodos && input.categoriaId) {
        const regla = await crearReglaCategorizacion({
          descripcionExacta: editando.descripcion,
          categoriaId: input.categoriaId,
        })
        toast.success(
          `Regla guardada: ${regla.movimientosActualizados.toLocaleString('es-AR')} movimientos con «${editando.descripcion}» categorizados`,
        )
      }
      setEditando(null)
      await invalidarTrasCambio()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  async function crearYRecordar(nombre: string) {
    const creada = await crearCategoriaMovimiento(nombre)
    await invalidarTrasCambio()
    return creada
  }

  async function crearCategoriaConGrupo(nombre: string, grupo: string | null) {
    await crearCategoriaMovimiento(nombre, grupo)
    await invalidarTrasCambio()
  }

  async function guardarGrupoCategoria(categoria: CategoriaMovimiento, grupo: string | null) {
    await patchCategoriaMovimiento(categoria.id, { grupo })
    await invalidarTrasCambio()
    toast.success(grupo ? `«${categoria.nombre}» quedó en ${grupo}` : `«${categoria.nombre}» quedó sin grupo`)
  }

  async function fusionarCategoria(origen: CategoriaMovimiento, destinoId: string) {
    const destino = categorias.find((item) => item.id === destinoId)
    await fusionarCategoriaMovimiento(origen.id, destinoId)
    if (categoriaId === origen.id) setCategoriaId('')
    await invalidarTrasCambio()
    toast.success(`«${origen.nombre}» pasó a «${destino?.nombre ?? 'la otra categoría'}».`)
  }

  async function aplicarReglas() {
    const result = await aplicarReglasCategorizacion()
    await invalidarTrasCambio()
    toast.success(
      `Se categorizaron ${result.categorizados.toLocaleString('es-AR')} de ${result.revisados.toLocaleString('es-AR')} movimientos`,
    )
  }

  async function completarAhora() {
    setCompletando(true)
    try {
      const result = await completarContrapartes()
      await invalidarTrasCambio()
      toast.success(
        result.actualizados > 0
          ? `Se completaron ${result.actualizados.toLocaleString('es-AR')} movimientos de los últimos 30 días`
          : 'No había contrapartes nuevas para completar en los últimos 30 días',
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron completar las contrapartes')
    } finally {
      setCompletando(false)
    }
  }

  async function eliminarCategoria(categoria: CategoriaMovimiento) {
    const result = await eliminarCategoriaMovimiento(categoria.id)
    if (categoriaId === categoria.id) setCategoriaId('')
    toast.success(
      `«${categoria.nombre}» eliminada. ${result.movimientosDesasignados.toLocaleString('es-AR')} movimientos quedaron sin categoría.`,
    )
    await invalidarTrasCambio()
  }

  function cambiarFiltro(apply: () => void) {
    apply()
    setPage(1)
  }

  const total = data?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const totales = data?.totales

  return (
    <>
      <header data-tour="movimientos" className="mb-4 flex min-h-10 flex-wrap items-center justify-between gap-3">
        <h1 className="text-heading text-2xl font-bold tracking-tight">Movimientos</h1>
        {puedeCategorias ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-tour="movimientos-ordenar-categorias"
              onClick={() => setGestionAbierta(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100 dark:hover:bg-zinc-800"
            >
              <Tags className="h-4 w-4" aria-hidden />
              Ordenar categorías
            </button>
            <button
              type="button"
              className="inline-flex items-center rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100 dark:hover:bg-zinc-800"
              disabled={completando}
              onClick={() => void completarAhora()}
            >
              {completando ? 'Completando…' : 'Completar contrapartes'}
            </button>
          </div>
        ) : null}
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
                {cuenta.moneda === 'USD' ? ' (USD)' : ''}
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
        <div className="text-sm">
          <div className="text-body-muted mb-1">
            <label htmlFor={categoriaFiltroId}>Categoría</label>
          </div>
          <select
            id={categoriaFiltroId}
            className={finanzasInputClass}
            value={categoriaId}
            onChange={(e) => cambiarFiltro(() => setCategoriaId(e.target.value))}
          >
            <option value="">Todas</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
        </div>
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
          <div className="surface-card rounded-2xl border border-emerald-200 p-3 dark:border-emerald-900/70">
            <div className="text-body-muted flex items-center gap-1.5 text-xs font-medium">
              <ArrowDownCircle className="h-4 w-4 text-emerald-500" aria-hidden />
              Entradas
            </div>
            <p className="mt-1 text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
              {formatMoneyCentavos(totales.entradasCentavos, 'ARS')}
            </p>
          </div>
          <div className="surface-card rounded-2xl border border-red-200 p-3 dark:border-red-900/70">
            <div className="text-body-muted flex items-center gap-1.5 text-xs font-medium">
              <ArrowUpCircle className="h-4 w-4 text-red-500" aria-hidden />
              Salidas
            </div>
            <p className="mt-1 text-lg font-bold tabular-nums text-red-600 dark:text-red-400">
              {formatMoneyCentavos(totales.salidasCentavos, 'ARS')}
            </p>
          </div>
          <div className="surface-card rounded-2xl border border-neutral-200 p-3 dark:border-zinc-800">
            <div className="text-body-muted flex items-center gap-1.5 text-xs font-medium">
              <ListOrdered className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />
              Movimientos
            </div>
            <p className="text-heading mt-1 text-lg font-bold tabular-nums">{totales.cantidad.toLocaleString('es-AR')}</p>
          </div>
        </div>
      ) : null}

      {isError ? (
        <p className="text-sm text-red-700">{error instanceof Error ? error.message : 'No se pudieron cargar los movimientos'}</p>
      ) : null}
      {!filtrosListos || isLoading ? (
        <p className="text-body-muted text-sm">Cargando movimientos…</p>
      ) : (
        <div className={`overflow-x-auto rounded-xl border border-neutral-300 bg-white dark:border-zinc-700 dark:bg-zinc-900 ${isFetching ? 'opacity-70' : ''}`}>
          <table className="min-w-full text-sm">
            <thead className="border-b border-[var(--color-primary-muted)] bg-brand-primary-light text-left text-xs font-medium text-brand-primary">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2">De / Para</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2 text-right">Monto</th>
                <th className="px-3 py-2">Cheque</th>
                <th className="px-3 py-2">Categoría</th>
              </tr>
            </thead>
            <tbody>
              {(data?.movimientos ?? []).map((row, indice) => {
                const entrada = row.tipo === 'credito'
                return (
                  <tr key={row.id} className="border-t border-neutral-100 dark:border-zinc-800">
                    <td className="whitespace-nowrap px-3 py-2">{formatFecha(row.fechaProceso)}</td>
                    <td className="px-3 py-2">{row.descripcion}</td>
                    <td className="px-3 py-2">
                      <CeldaContraparte
                        contraparte={row.contraparte}
                        onCompletar={puedeCategorias ? () => setEditando(row) : undefined}
                      />
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
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                      {row.reservadoPorChequeId ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                          title="Ver detalle del cheque"
                          onClick={async () => {
                            setChequeCargando(true)
                            try {
                              const ch = await fetchChequeById(row.reservadoPorChequeId!)
                              setChequeDetalle(ch)
                            } catch { toast.error('No se pudo cargar el cheque') }
                            finally { setChequeCargando(false) }
                          }}
                        >
                          {row.reservadoPorChequeId.replace(/^(recibido|emitido)_/, '')}
                        </button>
                      ) : null}
                    </td>
                    <td className="px-3 py-1.5">
                      <CategoriaMovimientoChip
                        categoria={categorias.find((categoria) => categoria.id === row.categoriaId) ?? null}
                        nota={row.nota}
                        tour={indice === 0 ? 'movimientos-categorizar' : undefined}
                        onClick={puedeCategorias ? () => setEditando(row) : undefined}
                      />
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

      <CategoriaMovimientoModal
        movimiento={puedeCategorias ? editando : null}
        categorias={categorias}
        saving={guardando}
        onClose={() => setEditando(null)}
        onGuardar={guardarMovimiento}
        onCrear={crearYRecordar}
      />
      <CategoriasGestionModal
        open={puedeCategorias && gestionAbierta}
        categorias={categorias}
        onClose={() => setGestionAbierta(false)}
        onCrear={crearCategoriaConGrupo}
        onEliminar={eliminarCategoria}
        onGuardarGrupo={guardarGrupoCategoria}
        onFusionar={fusionarCategoria}
        onAplicarReglas={aplicarReglas}
      />

      {chequeDetalle ? (
        <ChequeDetalleModal cheque={chequeDetalle} onClose={() => setChequeDetalle(null)} />
      ) : null}
      {chequeCargando ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="rounded-xl bg-white px-6 py-4 shadow-lg dark:bg-zinc-900">
            <p className="text-sm text-neutral-500">Cargando cheque…</p>
          </div>
        </div>
      ) : null}
    </>
  )
}

function ChequeDetalleModal({ cheque, onClose }: { cheque: ChequeListItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-gray-100">Detalle del cheque</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-neutral-500">Número</dt>
          <dd className="font-mono">{cheque.numero}</dd>

          <dt className="text-neutral-500">Dirección</dt>
          <dd>{cheque.direccion === 'emitido' ? 'Emitido' : 'Recibido'}</dd>

          {cheque.emisor ? <>
            <dt className="text-neutral-500">Emisor</dt>
            <dd>{cheque.emisor}</dd>
          </> : null}

          {cheque.destinatario ? <>
            <dt className="text-neutral-500">Destinatario</dt>
            <dd>{cheque.destinatario}</dd>
          </> : null}

          {cheque.bancoEmisor ? <>
            <dt className="text-neutral-500">Banco</dt>
            <dd>{cheque.bancoEmisor}</dd>
          </> : null}

          <dt className="text-neutral-500">Vencimiento</dt>
          <dd>{cheque.fechaPago ? formatFecha(cheque.fechaPago) : '—'}</dd>

          <dt className="text-neutral-500">Monto</dt>
          <dd className="font-medium text-neutral-900 dark:text-gray-100">
            {formatMoneyCentavos(cheque.montoCentavos, 'ARS')}
          </dd>

          <dt className="text-neutral-500">Estado</dt>
          <dd>{CHEQUE_ESTADO_LABELS[cheque.estado]}</dd>

          <dt className="text-neutral-500">Tipo</dt>
          <dd>{cheque.tipo === 'echeq' ? 'eCheq' : 'Físico'}</dd>

          {cheque.fechaAcreditacion ? <>
            <dt className="text-neutral-500">Acreditación</dt>
            <dd>{formatFecha(cheque.fechaAcreditacion)}</dd>
          </> : null}
        </dl>
        <div className="mt-5 text-right">
          <button
            type="button"
            className="inline-flex rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-100 dark:hover:bg-zinc-700"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
