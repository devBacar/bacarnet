import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import toast from 'react-hot-toast'
import { useSearchParams } from 'react-router-dom'
import { CategoriasGestionModal } from '../../components/finanzas/CategoriasGestionModal'
import { finanzasInputClass } from '../../components/finanzas/FinanzasFormField'
import { formatMoneyCentavos } from '../../components/finanzas/formatMoney'
import { useAuth } from '../../context'
import { fetchFinanzasCuentas } from '../../services/finanzasApi'
import {
  actualizarMovimiento,
  aplicarReglasCategorizacion,
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
      await actualizarMovimiento(editando.id, { categoriaId: input.categoriaId, nota: input.nota })
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
      <header className="mb-6">
        <h1 className="text-heading text-2xl font-semibold">Movimientos</h1>
        <p className="text-body-muted mt-1 text-sm">
          Extracto de las cuentas corrientes, traído de Interbanking. La lista se pide de a una página.
        </p>
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
          <div className="text-body-muted mb-1 flex items-center justify-between">
            <label htmlFor={categoriaFiltroId}>Categoría</label>
            <button
              type="button"
              className="text-xs text-brand-primary hover:underline"
              onClick={() => setGestionAbierta(true)}
            >
              Gestionar
            </button>
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
                <th className="px-3 py-2">Categoría</th>
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
                    <td className="px-3 py-1.5">
                      <CategoriaMovimientoChip
                        categoria={categorias.find((categoria) => categoria.id === row.categoriaId) ?? null}
                        nota={row.nota}
                        onClick={() => setEditando(row)}
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
        movimiento={editando}
        categorias={categorias}
        saving={guardando}
        onClose={() => setEditando(null)}
        onGuardar={guardarMovimiento}
        onCrear={crearYRecordar}
      />
      <CategoriasGestionModal
        open={gestionAbierta}
        categorias={categorias}
        onClose={() => setGestionAbierta(false)}
        onCrear={crearCategoriaConGrupo}
        onEliminar={eliminarCategoria}
        onGuardarGrupo={guardarGrupoCategoria}
        onFusionar={fusionarCategoria}
        onAplicarReglas={aplicarReglas}
      />
    </>
  )
}
