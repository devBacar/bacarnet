import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowRight,
  ArrowUpCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Scale,
  Wallet,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { syncMovimientosBancarios } from '../../services/finanzasMovimientosApi'
import {
  fetchCashflowDiario,
  type CashflowCategoriaItem,
  type CashflowDetalleItem,
  type CashflowDiario,
  type CashflowGrupoItem,
  type FinanzasMoneda,
} from '../../services/finanzasApi'
import { formatMoneyCentavos } from './formatMoney'

const AYUDA_SIN_CATEGORIA =
  'El sistema todavía no reconoce estos textos del banco. Tocá uno para categorizarlo; los próximos con el mismo texto se clasifican solos.'

const VENTANA_DIAS = 31

function hoyArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function sumarDias(fechaId: string, dias: number): string {
  const [year, month, day] = fechaId.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + dias))
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function esFinDeSemana(fechaId: string): boolean {
  const [year, month, day] = fechaId.split('-').map(Number)
  return [0, 6].includes(new Date(Date.UTC(year, month - 1, day)).getUTCDay())
}

function ultimoDiaHabil(fechaId: string): string {
  let cursor = fechaId
  while (esFinDeSemana(cursor)) cursor = sumarDias(cursor, -1)
  return cursor
}

function moverDiaHabil(fecha: string, delta: -1 | 1, minimo: string, maximo: string): string | null {
  let cursor = sumarDias(fecha, delta)
  while (esFinDeSemana(cursor)) cursor = sumarDias(cursor, delta)
  if (cursor < minimo || cursor > maximo) return null
  return cursor
}

function formatDay(fechaId: string): string {
  const [year, month, day] = fechaId.split('-').map(Number)
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

function formatPorcentaje(valor: number): string {
  return `${new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(valor)} %`
}

function linkCategorizar(item: CashflowDetalleItem, fecha: string): string {
  const params = new URLSearchParams({ desde: fecha, hasta: fecha })
  // "Sin descripción" es un rótulo del Cashflow, no un texto del banco: filtrarlo daría 0 resultados.
  if (item.descripcion !== 'Sin descripción') params.set('q', item.descripcion)
  if (item.cuentaId) params.set('cuenta', item.cuentaId)
  return `/finanzas/movimientos?${params.toString()}`
}

function esGrupoSinCategoria(grupo: CashflowGrupoItem): boolean {
  return grupo.sinCategoria || grupo.grupo === 'Sin categoría'
}

/** Una sola categoría con el mismo nombre que el grupo: el nivel intermedio no aporta. */
function muestraDetalleDirecto(grupo: CashflowGrupoItem): CashflowCategoriaItem | null {
  const unica = grupo.categorias.length === 1 ? grupo.categorias[0] : null
  if (!unica || unica.nombre !== grupo.grupo) return null
  return unica
}

function montoOGuion(centavos: number | null, moneda: FinanzasMoneda): string {
  if (centavos == null) return '—'
  return formatMoneyCentavos(centavos, moneda)
}

function subtituloArranque(origen: CashflowDiario['origenSaldos'] | undefined): string {
  if (origen === 'banco') return 'Cierre del banco del día anterior'
  return 'Cierre de las 15 hs del día anterior'
}

function subtituloCierre(estado: CashflowDiario['saldoFinal']['estado']): string {
  if (estado === 'cerrado') return 'Cierre del banco'
  if (estado === 'en_curso') return 'Hasta ahora, según el banco'
  return 'Estimado: todavía no cerró el día'
}

function MontoPorcentaje({
  centavos,
  porcentaje,
  moneda,
}: {
  centavos: number
  porcentaje: number
  moneda: FinanzasMoneda
}) {
  return (
    <span className="inline-flex shrink-0 items-baseline gap-2 tabular-nums">
      {formatMoneyCentavos(centavos, moneda)}
      <span className="text-body-muted w-14 text-right text-xs">{formatPorcentaje(porcentaje)}</span>
    </span>
  )
}

function DetalleMovimientos({
  categoria,
  moneda,
  fecha,
}: {
  categoria: CashflowCategoriaItem
  moneda: FinanzasMoneda
  fecha: string
}) {
  if (categoria.detalle.length === 0 && categoria.detalleRestantes <= 0) {
    return <p className="text-body-muted px-1.5 py-1 text-xs">No hay textos del banco en este corte.</p>
  }
  return (
    <ul className="space-y-0.5">
      {categoria.detalle.map((item) => (
        <li key={`${item.cuentaId}-${item.descripcion}`}>
          <Link
            to={linkCategorizar(item, fecha)}
            title={item.descripcion}
            className="group -mx-1.5 flex items-center justify-between gap-3 rounded-lg px-1.5 py-1 text-xs transition hover:bg-white dark:hover:bg-zinc-900"
          >
            <span className="min-w-0 truncate">
              <span className="text-heading font-medium">{item.descripcion}</span>
              <span className="text-body-muted">
                {' '}
                · {item.bancoNombre || 'Cuenta'} · {item.cantidad}{' '}
                {item.cantidad === 1 ? 'mov.' : 'movs.'}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
              {formatMoneyCentavos(item.centavos, moneda)}
              <ArrowRight
                className="h-3.5 w-3.5 text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-brand-primary"
                aria-hidden
              />
            </span>
          </Link>
        </li>
      ))}
      {categoria.detalleRestantes > 0 ? (
        <li className="text-body-muted px-1.5 py-1 text-xs">
          y {categoria.detalleRestantes.toLocaleString('es-AR')}{' '}
          {categoria.detalleRestantes === 1 ? 'texto más' : 'textos más'}
        </li>
      ) : null}
    </ul>
  )
}

function CategoriaFila({
  categoria,
  abierta,
  onToggle,
  moneda,
  fecha,
}: {
  categoria: CashflowCategoriaItem
  abierta: boolean
  onToggle: () => void
  moneda: FinanzasMoneda
  fecha: string
}) {
  return (
    <li>
      <button
        type="button"
        aria-expanded={abierta}
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-lg py-1.5 pr-0.5 pl-5 text-left text-sm transition hover:bg-neutral-50 dark:hover:bg-zinc-800/70"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform ${abierta ? 'rotate-180' : ''}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">{categoria.nombre}</span>
        <MontoPorcentaje centavos={categoria.centavos} porcentaje={categoria.porcentaje} moneda={moneda} />
      </button>
      {abierta ? (
        <div className="mb-1 ml-5 rounded-xl bg-neutral-50 px-3 py-2 dark:bg-zinc-950/50">
          <DetalleMovimientos categoria={categoria} moneda={moneda} fecha={fecha} />
        </div>
      ) : null}
    </li>
  )
}

function DesgloseTabla({
  titulo,
  rows,
  moneda,
  fecha,
  vacio,
}: {
  titulo: string
  rows: CashflowGrupoItem[]
  moneda: FinanzasMoneda
  fecha: string
  vacio: string
}) {
  const [gruposAbiertos, setGruposAbiertos] = useState<Record<string, boolean>>({})
  const [categoriasAbiertas, setCategoriasAbiertas] = useState<Record<string, boolean>>({})

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-zinc-800">
      <h3 className="text-heading border-b border-neutral-100 px-3 py-2 text-sm font-semibold dark:border-zinc-800">
        {titulo}
      </h3>
      {rows.length === 0 ? (
        <p className="text-body-muted px-3 py-4 text-sm">{vacio}</p>
      ) : (
        <ul>
          {rows.map((row, index) => {
            const clave = `${index}:${row.grupo}`
            const abierto = gruposAbiertos[clave] ?? esGrupoSinCategoria(row)
            const directo = muestraDetalleDirecto(row)
            const sinCategoria = esGrupoSinCategoria(row)
            return (
              <li
                key={clave}
                className="border-b border-neutral-100 text-sm last:border-b-0 dark:border-zinc-800"
              >
                <button
                  type="button"
                  aria-expanded={abierto}
                  onClick={() => setGruposAbiertos((prev) => ({ ...prev, [clave]: !abierto }))}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-neutral-50 dark:hover:bg-zinc-800/70"
                >
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${abierto ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-neutral-300 dark:border-zinc-600"
                    style={row.color ? { backgroundColor: row.color, borderColor: row.color } : undefined}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{row.grupo}</span>
                  <MontoPorcentaje centavos={row.centavos} porcentaje={row.porcentaje} moneda={moneda} />
                </button>
                {abierto ? (
                  <div className="space-y-1 px-3 pb-2">
                    {directo ? (
                      <div className="rounded-xl bg-neutral-50 px-3 py-2 dark:bg-zinc-950/50">
                        {sinCategoria ? (
                          <p className="text-body-muted mb-1.5 text-xs">{AYUDA_SIN_CATEGORIA}</p>
                        ) : null}
                        <DetalleMovimientos categoria={directo} moneda={moneda} fecha={fecha} />
                      </div>
                    ) : (
                      <>
                        {sinCategoria ? (
                          <p className="text-body-muted rounded-xl bg-neutral-50 px-3 py-2 text-xs dark:bg-zinc-950/50">
                            {AYUDA_SIN_CATEGORIA}
                          </p>
                        ) : null}
                        <ul>
                          {row.categorias.map((categoria, catIndex) => {
                            const catClave = `${clave}:${categoria.categoriaId ?? catIndex}`
                            const catAbierta = categoriasAbiertas[catClave] ?? false
                            return (
                              <CategoriaFila
                                key={catClave}
                                categoria={categoria}
                                abierta={catAbierta}
                                moneda={moneda}
                                fecha={fecha}
                                onToggle={() =>
                                  setCategoriasAbiertas((prev) => ({ ...prev, [catClave]: !catAbierta }))
                                }
                              />
                            )
                          })}
                        </ul>
                      </>
                    )}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Kpi({
  label,
  valor,
  valorClassName = 'text-heading',
  ayuda,
  icono,
  borde = 'border-neutral-200 dark:border-zinc-800',
}: {
  label: string
  valor: string
  valorClassName?: string
  ayuda: string
  icono?: ReactNode
  borde?: string
}) {
  return (
    <div className={`surface-card min-w-0 rounded-2xl border p-3 ${borde}`}>
      <div className="text-body-muted flex items-center gap-1.5 text-xs font-medium">
        {icono}
        <span>{label}</span>
      </div>
      <p className={`mt-1 text-lg font-bold tabular-nums ${valorClassName}`}>{valor}</p>
      <p className="text-body-muted mt-0.5 text-xs leading-snug">{ayuda}</p>
    </div>
  )
}

export function CashflowSection() {
  const hoy = useMemo(() => hoyArgentina(), [])
  const maximo = ultimoDiaHabil(hoy)
  const minimo = sumarDias(hoy, -VENTANA_DIAS)
  const [fecha, setFecha] = useState(maximo)
  const [moneda, setMoneda] = useState<FinanzasMoneda>('ARS')
  const [verPorBanco, setVerPorBanco] = useState(false)

  const anterior = moverDiaHabil(fecha, -1, minimo, maximo)
  const siguiente = moverDiaHabil(fecha, 1, minimo, maximo)

  const query = useQuery({
    queryKey: ['finanzas', 'cashflow', fecha, moneda],
    queryFn: () => fetchCashflowDiario(fecha, moneda),
    // Solo lee lo ya sincronizado (no consulta a Interbanking): los movimientos entran cada 30 min.
    refetchInterval: 60_000,
  })

  const queryClient = useQueryClient()
  const [actualizando, setActualizando] = useState(false)

  const handleActualizar = async () => {
    setActualizando(true)
    try {
      const result = await syncMovimientosBancarios()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['finanzas', 'cashflow'] }),
        queryClient.invalidateQueries({ queryKey: ['finanzas', 'movimientos'] }),
      ])
      toast.success(
        result.insertados > 0
          ? `Movimientos al día (${result.insertados.toLocaleString('es-AR')} leídos del banco)`
          : 'Movimientos al día',
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron traer los movimientos')
    } finally {
      setActualizando(false)
    }
  }

  const data = query.data
  const avisos = data?.avisos ?? []
  const bancos = data?.bancos ?? []

  const controlClass =
    'rounded-lg border border-neutral-200 bg-white text-sm dark:border-zinc-700 dark:bg-zinc-900'

  return (
    <section
      data-tour="saldos-dia"
      aria-labelledby="finanzas-cashflow-heading"
      className="flex flex-col overflow-hidden rounded-xl border border-neutral-300 bg-white dark:border-zinc-700 dark:bg-zinc-900"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-primary-muted)] bg-brand-primary-light px-4 py-2.5">
        <div>
          <h2 id="finanzas-cashflow-heading" className="text-brand-primary text-[15px] font-medium">
            Entradas y salidas del día
          </h2>
          <p className="text-brand-primary text-[13px]">
            Todas las cuentas juntas. Pesos y dólares por separado.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            aria-label="Moneda"
            value={moneda}
            onChange={(event) => setMoneda(event.target.value as FinanzasMoneda)}
            className={`${controlClass} px-2 py-1`}
          >
            <option value="ARS">Pesos</option>
            <option value="USD">Dólares</option>
          </select>
          <button
            type="button"
            aria-label="Día anterior"
            disabled={!anterior}
            onClick={() => anterior && setFecha(anterior)}
            className={`${controlClass} p-1.5 disabled:opacity-40`}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <input
            type="date"
            aria-label="Fecha de entradas y salidas"
            value={fecha}
            min={minimo}
            max={maximo}
            onChange={(event) => {
              const next = event.target.value
              if (next && next >= minimo && next <= maximo) setFecha(next)
            }}
            className={`${controlClass} px-2 py-1`}
          />
          <button
            type="button"
            aria-label="Día siguiente"
            disabled={!siguiente}
            onClick={() => siguiente && setFecha(siguiente)}
            className={`${controlClass} p-1.5 disabled:opacity-40`}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => void handleActualizar()}
            disabled={actualizando}
            title="Trae ahora los movimientos del banco (se actualizan solos cada 30 min)"
            className={`${controlClass} inline-flex items-center gap-1.5 px-2 py-1 disabled:opacity-60`}
          >
            <RefreshCw className={`h-4 w-4 ${actualizando ? 'animate-spin' : ''}`} aria-hidden />
            {actualizando ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </header>

      <div className="space-y-3 p-4">
      {query.isLoading ? (
        <div className="h-24 animate-pulse rounded-xl bg-neutral-100 dark:bg-zinc-800" />
      ) : query.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {query.error instanceof Error
            ? query.error.message
            : 'No se pudieron calcular las entradas y salidas del día'}
        </div>
      ) : data ? (
        <>
          <p className="text-heading text-xs font-semibold capitalize">{formatDay(data.fecha)}</p>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi
              label="Arrancamos el día con"
              valor={
                data.saldoInicial
                  ? formatMoneyCentavos(data.saldoInicial.centavos, moneda)
                  : 'Sin dato'
              }
              ayuda={subtituloArranque(data.origenSaldos)}
              icono={<Wallet className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />}
              borde="border-blue-200 dark:border-blue-900/70"
            />
            <Kpi
              label="Entró"
              valor={formatMoneyCentavos(data.entradasCentavos, moneda)}
              valorClassName="text-emerald-700 dark:text-emerald-400"
              ayuda="Plata que entró en el día."
              icono={<ArrowDownCircle className="h-4 w-4 text-emerald-500" aria-hidden />}
              borde="border-emerald-200 dark:border-emerald-900/70"
            />
            <Kpi
              label="Salió"
              valor={formatMoneyCentavos(data.salidasCentavos, moneda)}
              valorClassName="text-red-600 dark:text-red-400"
              ayuda="Plata que salió en el día."
              icono={<ArrowUpCircle className="h-4 w-4 text-red-500" aria-hidden />}
              borde="border-red-200 dark:border-red-900/70"
            />
            <Kpi
              label="Terminamos con"
              valor={montoOGuion(data.saldoFinal.centavos, moneda)}
              ayuda={subtituloCierre(data.saldoFinal.estado)}
              icono={<Scale className="h-4 w-4 text-emerald-500" aria-hidden />}
              borde="border-emerald-200 dark:border-emerald-900/70"
            />
          </div>
          {avisos.length > 0 ? (
            <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-snug text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-100">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300"
                aria-hidden
              />
              <ul className="min-w-0 space-y-1.5">
                {avisos.map((aviso) => (
                  <li key={`${aviso.bancoNombre}-${aviso.faltanteCentavos}`}>{aviso.texto}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <button
              type="button"
              aria-expanded={verPorBanco}
              onClick={() => setVerPorBanco((abierto) => !abierto)}
              className="text-sm font-medium text-teal-800 underline-offset-2 hover:underline dark:text-teal-300"
            >
              {verPorBanco ? 'Ocultar bancos' : 'Ver por banco'}
            </button>
            {verPorBanco ? (
              <div className="mt-2 overflow-x-auto rounded-xl border border-neutral-200 dark:border-zinc-800">
                <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="text-body-muted border-b border-neutral-200 text-xs dark:border-zinc-800">
                      <th className="px-2 py-2 font-medium">Banco</th>
                      <th className="px-2 py-2 text-right font-medium">Arrancó</th>
                      <th className="px-2 py-2 text-right font-medium">Entró</th>
                      <th className="px-2 py-2 text-right font-medium">Salió</th>
                      <th className="px-2 py-2 text-right font-medium">Terminó</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bancos.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-body-muted px-2 py-3">
                          No hay cuentas para mostrar.
                        </td>
                      </tr>
                    ) : (
                      bancos.map((banco) => (
                        <tr
                          key={banco.bancoNombre}
                          className="border-b border-neutral-100 last:border-0 dark:border-zinc-800/80"
                        >
                          <td className="px-2 py-2">
                            <span className="text-heading font-medium">{banco.bancoNombre}</span>
                            {banco.faltanteCentavos !== 0 ? (
                              <span className="text-amber-800 dark:text-amber-200"> · ⚠ falta detalle</span>
                            ) : null}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                            {montoOGuion(banco.saldoInicioCentavos, moneda)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap text-emerald-700 dark:text-emerald-400">
                            {formatMoneyCentavos(banco.entradasCentavos, moneda)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap text-red-600 dark:text-red-400">
                            {formatMoneyCentavos(banco.salidasCentavos, moneda)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                            {montoOGuion(banco.saldoFinCentavos, moneda)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <DesgloseTabla
              key={`entradas-${fecha}-${moneda}`}
              titulo="Entradas"
              rows={data.entradas}
              moneda={moneda}
              fecha={data.fecha}
              vacio="No hubo entradas este día."
            />
            <DesgloseTabla
              key={`salidas-${fecha}-${moneda}`}
              titulo="Salidas"
              rows={data.salidas}
              moneda={moneda}
              fecha={data.fecha}
              vacio="No hubo salidas este día."
            />
          </div>
        </>
      ) : null}
      </div>
    </section>
  )
}
