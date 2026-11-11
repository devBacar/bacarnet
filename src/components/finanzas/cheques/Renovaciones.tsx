import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, Clock, History, Search, TrendingUp, Wallet } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../../../context'
import {
  fetchSeguimientoRenovaciones,
  type BeneficiarioSeguimientoItem,
  type ChequeConEstadoItem,
  type EstadoChequeRenov,
  type OperacionSeguimientoItem,
  type SeguimientoEstadoFiltro,
} from '../../../services/finanzasChequesApi'
import { finanzasInputClass } from '../FinanzasFormField'
import { formatMoneyCentavos } from '../formatMoney'
import { useParamsUrl, valorPermitido } from './useParamsUrl'

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

function chequeCorto(num: string): string {
  const partes = num.split('-')
  return partes.length >= 4 ? partes[3]! : num
}

function formatTasa(interesCentavos: number, capitalCentavos: number): string {
  if (capitalCentavos <= 0) return '—'
  return `${((interesCentavos / capitalCentavos) * 100).toFixed(1)}%`
}

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Mismo criterio que usa el backend para juntar "HNA CLAUDIA" con "HERMANA CLAUDIA". */
function beneficiariosCompatibles(a: string, b: string): boolean {
  if (a === b) return true
  const wa = a.split(/\s+/).filter((w) => w.length >= 3)
  const wb = b.split(/\s+/).filter((w) => w.length >= 3)
  return wa.some((w) => wb.some((x) => x.startsWith(w) || w.startsWith(x)))
}

const ESTADO_UI: Record<EstadoChequeRenov, { label: string; clase: string }> = {
  pendiente: {
    label: 'Pendiente',
    clase: 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
  },
  rechazado: {
    label: 'Rechazado',
    clase: 'border-red-300 bg-red-100 text-red-900 dark:border-red-700 dark:bg-red-900/40 dark:text-red-200',
  },
  debitado: {
    label: 'Debitado',
    clase: 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  },
  renovado: {
    label: 'Renovado',
    clase: 'border-violet-300 bg-violet-100 text-violet-900 dark:border-violet-700 dark:bg-violet-900/40 dark:text-violet-200',
  },
  anulado: {
    label: 'Anulado',
    clase: 'border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  },
}

function EstadoBadge({ estado }: { estado: EstadoChequeRenov }) {
  const ui = ESTADO_UI[estado]
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${ui.clase}`}>{ui.label}</span>
  )
}

function EstadoOperacionBadge({ op }: { op: OperacionSeguimientoItem }) {
  const abierta = op.estadoOperacion === 'abierta'
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${
        abierta ? ESTADO_UI.pendiente.clase : ESTADO_UI.anulado.clase
      }`}
    >
      {abierta ? 'Abierta' : 'Cerrada'}
    </span>
  )
}

function etiquetaOp(op: OperacionSeguimientoItem): string {
  return `Op ${formatFecha(op.fechaEmision)}${op.banco ? ` · ${op.banco}` : ''}`
}

const EN_LA_CALLE: ReadonlySet<EstadoChequeRenov> = new Set(['pendiente', 'rechazado'])

/** Lo que suma interés y tasa: solo las operaciones con el cheque viejo identificado. */
function capitalEInteres(ops: OperacionSeguimientoItem[]): { capital: number; interes: number } {
  let capital = 0
  let interes = 0
  for (const op of ops) {
    if (!op.vinculada) continue
    capital += op.totalViejosCentavos
    interes += op.interesCentavos
  }
  return { capital, interes }
}

/** Próximo vencimiento de un cheque todavía en la calle. `vencido` si alguno ya pasó la fecha. */
function proximoVencimiento(ops: OperacionSeguimientoItem[], hoy: string): { fecha: string | null; vencido: boolean } {
  let fecha: string | null = null
  let vencido = false
  for (const op of ops) {
    for (const c of op.chequesNuevos) {
      if (!EN_LA_CALLE.has(c.estado) || !c.fechaVencimiento) continue
      if (c.fechaVencimiento < hoy) vencido = true
      else if (fecha === null || c.fechaVencimiento < fecha) fecha = c.fechaVencimiento
    }
  }
  return { fecha, vencido }
}

function coincideBusqueda(op: OperacionSeguimientoItem, grupo: string, q: string): boolean {
  if (normalizar(grupo).includes(q) || normalizar(op.beneficiario).includes(q)) return true
  for (const c of [...op.chequesNuevos, ...op.chequesViejos]) {
    if (c.numeroCheque.includes(q)) return true
    if (String(Math.round(c.montoCentavos / 100)).includes(q)) return true
  }
  return false
}

function coincideVencimiento(op: OperacionSeguimientoItem, desde: string, hasta: string): boolean {
  return [...op.chequesNuevos, ...op.chequesViejos].some(
    (c) => c.fechaVencimiento && (!desde || c.fechaVencimiento >= desde) && (!hasta || c.fechaVencimiento <= hasta),
  )
}

type Agrupar = 'proveedor' | 'operacion'

interface OperacionConGrupo {
  op: OperacionSeguimientoItem
  grupo: BeneficiarioSeguimientoItem
}

/**
 * Renovaciones y su seguimiento en una sola pantalla: qué cheques se cambiaron por cuáles, con qué interés,
 * y cuánta plata sigue en la calle. Se ve sumado por proveedor o una operación por fila.
 */
export function Renovaciones() {
  const { user } = useAuth()
  const { params, cambiar } = useParamsUrl()
  const estado = valorPermitido<SeguimientoEstadoFiltro>(params.get('seg'), ['abiertas', 'todas'], 'abiertas')
  const setEstado = (v: SeguimientoEstadoFiltro) => cambiar({ seg: v === 'abiertas' ? null : v })
  const agrupar = valorPermitido<Agrupar>(params.get('ver'), ['proveedor', 'operacion'], 'proveedor')
  const setAgrupar = (v: Agrupar) => cambiar({ ver: v === 'proveedor' ? null : v })
  /** Viene de "Renov." en la lista de Cheques: muestra solo ese beneficiario. */
  const beneficiarioFiltro = params.get('benef') ?? ''
  /** Pila de navegación de la cadena (en la URL como ?cadena=id1,id2): la última es la operación que se está viendo. */
  const pila = useMemo(() => (params.get('cadena') ?? '').split(',').filter(Boolean), [params])
  const setPila = (nueva: string[]) => cambiar({ cadena: nueva.join(',') || null })

  const [busqueda, setBusqueda] = useState('')
  const [q, setQ] = useState('')
  const [vtoDesde, setVtoDesde] = useState('')
  const [vtoHasta, setVtoHasta] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setQ(normalizar(busqueda.trim())), 300)
    return () => clearTimeout(t)
  }, [busqueda])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['finanzas', 'cheques-ocasionales', 'seguimiento', estado],
    queryFn: () => fetchSeguimientoRenovaciones(estado),
    enabled: Boolean(user),
  })

  const opsPorId = useMemo(() => {
    const m = new Map<string, OperacionSeguimientoItem>()
    for (const g of data?.beneficiarios ?? []) for (const op of g.operaciones) m.set(op.id, op)
    for (const op of data?.ancestros ?? []) m.set(op.id, op)
    return m
  }, [data])

  /** Los mismos grupos del backend, con solo las operaciones que pasan los filtros de pantalla. */
  const grupos = useMemo(() => {
    const out: BeneficiarioSeguimientoItem[] = []
    for (const g of data?.beneficiarios ?? []) {
      if (
        beneficiarioFiltro &&
        !beneficiariosCompatibles(g.beneficiarioNormalizado, beneficiarioFiltro) &&
        !g.operaciones.some((op) => beneficiariosCompatibles(op.beneficiarioNormalizado, beneficiarioFiltro))
      ) {
        continue
      }
      const operaciones = g.operaciones.filter(
        (op) =>
          (!q || coincideBusqueda(op, g.beneficiario, q)) &&
          (!(vtoDesde || vtoHasta) || coincideVencimiento(op, vtoDesde, vtoHasta)),
      )
      if (operaciones.length > 0) out.push({ ...g, operaciones })
    }
    return out
  }, [data, beneficiarioFiltro, q, vtoDesde, vtoHasta])

  const todasLasOps = useMemo(() => (data?.beneficiarios ?? []).flatMap((g) => g.operaciones), [data])
  const interesTotal = useMemo(() => capitalEInteres(todasLasOps), [todasLasOps])

  const opActualId = pila[pila.length - 1]
  const opActual = opActualId ? opsPorId.get(opActualId) ?? null : null

  if (isLoading) return <p className="text-body-muted text-sm">Cargando renovaciones…</p>
  if (isError) {
    return (
      <p className="text-danger text-sm">
        {error instanceof Error ? error.message : 'No se pudieron cargar las renovaciones'}
      </p>
    )
  }

  const totales = data?.totales
  const hoy = data?.hoy ?? new Date().toISOString().slice(0, 10)
  const hayFiltros = Boolean(busqueda || vtoDesde || vtoHasta)
  const verCadena = (id: string) => setPila([id])

  return (
    <div className="space-y-4">
      {totales ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Indicador
            icono={<Wallet className="h-4 w-4" />}
            titulo="Plata en la calle"
            valor={formatMoneyCentavos(totales.exposicionCentavos, 'ARS')}
            detalle={`${totales.posicionesAbiertas} ${totales.posicionesAbiertas === 1 ? 'cheque sin cobrar' : 'cheques sin cobrar'} · ${totales.beneficiarios} ${totales.beneficiarios === 1 ? 'proveedor' : 'proveedores'}`}
          />
          <Indicador
            tono={totales.vencidosCantidad > 0 ? 'rojo' : 'neutro'}
            icono={<AlertTriangle className="h-4 w-4" />}
            titulo="Vencidos sin cobrar"
            valor={`${totales.vencidosCantidad} ${totales.vencidosCantidad === 1 ? 'cheque' : 'cheques'}`}
            detalle={totales.vencidosCantidad > 0 ? formatMoneyCentavos(totales.vencidosCentavos, 'ARS') : 'Ninguno'}
          />
          <Indicador
            tono={totales.porVencer7d > 0 ? 'ambar' : 'neutro'}
            icono={<Clock className="h-4 w-4" />}
            titulo="Vencen pronto"
            valor={`${totales.porVencer7d} · ${totales.porVencer15d} · ${totales.porVencer30d}`}
            detalle="en 7 · 15 · 30 días"
          />
          <Indicador
            icono={<TrendingUp className="h-4 w-4" />}
            titulo="Interés de las renovaciones"
            valor={formatMoneyCentavos(interesTotal.interes, 'ARS')}
            valorClase="text-red-600 dark:text-red-400"
            detalle={`Tasa promedio ${formatTasa(interesTotal.interes, interesTotal.capital)} · ${estado === 'abiertas' ? 'operaciones abiertas' : 'todas las operaciones'}`}
          />
        </div>
      ) : null}

      <div className="surface-card rounded-2xl border border-neutral-200 p-4 dark:border-zinc-800">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Selector
            opciones={[
              ['abiertas', 'Abiertas'],
              ['todas', 'Todas'],
            ]}
            valor={estado}
            onCambiar={setEstado}
          />
          <Selector
            opciones={[
              ['proveedor', 'Por proveedor'],
              ['operacion', 'Operación por operación'],
            ]}
            valor={agrupar}
            onCambiar={setAgrupar}
          />
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              className={`${finanzasInputClass} pl-9`}
              placeholder="Proveedor, nº de cheque o importe"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs">
            <span className="text-body-muted whitespace-nowrap">Vence desde</span>
            <input type="date" className={`${finanzasInputClass} w-36 text-sm`} value={vtoDesde} onChange={(e) => setVtoDesde(e.target.value)} />
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <span className="text-body-muted">hasta</span>
            <input type="date" className={`${finanzasInputClass} w-36 text-sm`} value={vtoHasta} onChange={(e) => setVtoHasta(e.target.value)} />
          </label>
          {hayFiltros ? (
            <button
              type="button"
              className="text-brand-primary text-xs underline"
              onClick={() => {
                setBusqueda('')
                setVtoDesde('')
                setVtoHasta('')
              }}
            >
              Limpiar filtros
            </button>
          ) : null}
        </div>

        {beneficiarioFiltro ? (
          <div className="mb-3 flex items-center gap-2 text-sm">
            <span className="text-body-muted">Mostrando solo:</span>
            <span className="inline-block rounded border border-violet-300 bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900 dark:border-violet-700 dark:bg-violet-900/40 dark:text-violet-200">
              {grupos[0]?.beneficiario ?? beneficiarioFiltro}
            </span>
            <button type="button" className="text-brand-primary text-xs underline" onClick={() => cambiar({ benef: null })}>
              Ver todos
            </button>
          </div>
        ) : null}

        {grupos.length === 0 ? (
          <p className="text-body-muted py-8 text-center text-sm">
            {hayFiltros || beneficiarioFiltro
              ? 'No hay renovaciones con esos filtros.'
              : estado === 'abiertas'
                ? 'No hay renovaciones abiertas. Elegí "Todas" para ver las cerradas.'
                : 'No hay operaciones de renovación.'}
          </p>
        ) : agrupar === 'proveedor' ? (
          <TablaPorProveedor grupos={grupos} hoy={hoy} abrirSolo={Boolean(beneficiarioFiltro)} onVerCadena={verCadena} />
        ) : (
          <TablaPorOperacion grupos={grupos} onVerCadena={verCadena} />
        )}
      </div>

      {opActual ? (
        <CadenaModal
          op={opActual}
          opsPorId={opsPorId}
          camino={pila}
          onIr={(id) => setPila([...pila, id])}
          onSaltar={(i) => setPila(pila.slice(0, i + 1))}
          onCerrar={() => setPila([])}
        />
      ) : null}
    </div>
  )
}

function Indicador({
  icono,
  titulo,
  valor,
  detalle,
  tono = 'neutro',
  valorClase = 'text-heading',
}: {
  icono: ReactNode
  titulo: string
  valor: string
  detalle: string
  tono?: 'neutro' | 'rojo' | 'ambar'
  valorClase?: string
}) {
  const marco = {
    neutro: 'border-neutral-200 dark:border-zinc-800',
    rojo: 'border-red-200 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/20',
    ambar: 'border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20',
  }[tono]
  const colorTitulo = {
    neutro: 'text-body-muted',
    rojo: 'text-red-700 dark:text-red-400',
    ambar: 'text-amber-700 dark:text-amber-400',
  }[tono]
  return (
    <div className={`surface-card rounded-2xl border p-3 ${marco}`}>
      <div className={`flex items-center gap-1.5 text-xs font-medium ${colorTitulo}`}>
        {icono}
        {titulo}
      </div>
      <p className={`mt-1 text-lg font-bold tabular-nums ${valorClase}`}>{valor}</p>
      <p className="text-body-muted text-[11px]">{detalle}</p>
    </div>
  )
}

function Selector<T extends string>({
  opciones,
  valor,
  onCambiar,
}: {
  opciones: ReadonlyArray<readonly [T, string]>
  valor: T
  onCambiar: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 dark:border-zinc-800">
      {opciones.map(([val, label]) => (
        <button
          key={val}
          type="button"
          onClick={() => onCambiar(val)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            valor === val ? 'bg-brand-primary text-white shadow-sm' : 'text-body-muted hover:text-heading'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function SinAsignarBadge() {
  return (
    <span
      className="ml-1.5 inline-block rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      title="Este nombre todavía no está asignado a ningún proveedor. Se asigna en la solapa Proveedores financieros."
    >
      Sin asignar
    </span>
  )
}

function Chevron({ abierto }: { abierto: boolean }) {
  return abierto ? <ChevronUp className="inline h-3.5 w-3.5" /> : <ChevronDown className="inline h-3.5 w-3.5" />
}

function TablaPorProveedor({
  grupos,
  hoy,
  abrirSolo,
  onVerCadena,
}: {
  grupos: BeneficiarioSeguimientoItem[]
  hoy: string
  /** Si hay un solo proveedor (vino filtrado desde Cheques), se muestra abierto. */
  abrirSolo: boolean
  onVerCadena: (opId: string) => void
}) {
  const [expandido, setExpandido] = useState<string | null>(null)
  const claveDe = (g: BeneficiarioSeguimientoItem) => g.proveedorId ?? `sin-${g.beneficiarioNormalizado}`

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="border-b border-subtle text-left text-body-muted">
          <tr>
            <th className="w-6 px-1 py-2"></th>
            <th className="px-2.5 py-2">Proveedor</th>
            <th className="px-2.5 py-2 text-center">Operaciones</th>
            <th className="px-2.5 py-2 text-center">Cheques sin cobrar</th>
            <th className="px-2.5 py-2 text-right">Plata en la calle</th>
            <th className="px-2.5 py-2 text-right">Interés</th>
            <th className="px-2.5 py-2 text-right">Tasa</th>
            <th className="px-2.5 py-2 text-right">Próximo vencimiento</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => {
            const clave = claveDe(g)
            const abierto = expandido === clave || (abrirSolo && grupos.length === 1 && expandido === null)
            const { capital, interes } = capitalEInteres(g.operaciones)
            const proximo = proximoVencimiento(g.operaciones, hoy)
            return (
              <Fragment key={clave}>
                <tr
                  className={`cursor-pointer border-t border-subtle hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${abierto ? 'bg-neutral-50/70 dark:bg-zinc-800/30' : ''}`}
                  onClick={() => setExpandido(abierto ? (expandido === null ? '' : null) : clave)}
                >
                  <td className="px-1 py-2 text-center text-body-muted">
                    <Chevron abierto={abierto} />
                  </td>
                  <td className="px-2.5 py-2">
                    <span className="font-medium">{g.beneficiario || '(sin beneficiario)'}</span>
                    {g.proveedorId === null ? <SinAsignarBadge /> : null}
                  </td>
                  <td className="px-2.5 py-2 text-center tabular-nums">{g.operaciones.length}</td>
                  <td className="px-2.5 py-2 text-center tabular-nums">
                    {g.posicionesAbiertas}
                    {g.rechazadas > 0 ? (
                      <span className="ml-1.5 font-semibold text-red-600 dark:text-red-400">
                        ({g.rechazadas} {g.rechazadas === 1 ? 'rechazado' : 'rechazados'})
                      </span>
                    ) : null}
                  </td>
                  <td className="text-brand-primary px-2.5 py-2 text-right font-semibold tabular-nums">
                    {formatMoneyCentavos(g.exposicionCentavos, 'ARS')}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-red-600 dark:text-red-400">
                    {interes !== 0 ? formatMoneyCentavos(interes, 'ARS') : '—'}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{formatTasa(interes, capital)}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums">
                    {proximo.vencido ? (
                      <span className="font-semibold text-red-600 dark:text-red-400">Hay vencidos</span>
                    ) : (
                      formatFecha(proximo.fecha)
                    )}
                  </td>
                </tr>
                {abierto ? (
                  <tr className="border-t border-dashed border-neutral-200 dark:border-zinc-700">
                    <td colSpan={8} className="px-2.5 py-2">
                      <OperacionesDelProveedor operaciones={g.operaciones} onVerCadena={onVerCadena} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function OperacionesDelProveedor({
  operaciones,
  onVerCadena,
}: {
  operaciones: OperacionSeguimientoItem[]
  onVerCadena: (opId: string) => void
}) {
  const abiertas = operaciones.filter((op) => op.estadoOperacion === 'abierta')
  const cerradas = operaciones.filter((op) => op.estadoOperacion !== 'abierta')
  const [verCerradas, setVerCerradas] = useState(abiertas.length === 0)

  return (
    <div className="ml-6 overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50/80 dark:border-zinc-700 dark:bg-zinc-800/50">
      <table className="min-w-full text-xs">
        <CabeceraOperaciones conProveedor={false} />
        <tbody>
          {abiertas.map((op) => (
            <FilaOperacion key={op.id} op={op} onVerCadena={onVerCadena} />
          ))}
          {cerradas.length > 0 && abiertas.length > 0 ? (
            <tr className="border-t border-neutral-200/60 dark:border-zinc-700/60">
              <td colSpan={9} className="px-2.5 py-1.5">
                <button
                  type="button"
                  className="text-body-muted inline-flex items-center gap-1.5 hover:text-heading"
                  onClick={() => setVerCerradas((v) => !v)}
                >
                  <History className="h-3.5 w-3.5" />
                  {verCerradas ? 'Ocultar' : 'Ver'} {cerradas.length}{' '}
                  {cerradas.length === 1 ? 'operación cerrada' : 'operaciones cerradas'}
                  <Chevron abierto={verCerradas} />
                </button>
              </td>
            </tr>
          ) : null}
          {verCerradas ? cerradas.map((op) => <FilaOperacion key={op.id} op={op} onVerCadena={onVerCadena} />) : null}
        </tbody>
      </table>
    </div>
  )
}

function TablaPorOperacion({
  grupos,
  onVerCadena,
}: {
  grupos: BeneficiarioSeguimientoItem[]
  onVerCadena: (opId: string) => void
}) {
  /** Primero lo que vence antes; las que no tienen fecha, al final. */
  const filas = useMemo<OperacionConGrupo[]>(
    () =>
      grupos
        .flatMap((grupo) => grupo.operaciones.map((op) => ({ op, grupo })))
        .sort(
          (a, b) =>
            (a.op.fechaVtoMax ?? '9999').localeCompare(b.op.fechaVtoMax ?? '9999') || a.op.id.localeCompare(b.op.id),
        ),
    [grupos],
  )

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <CabeceraOperaciones conProveedor />
        <tbody>
          {filas.map(({ op, grupo }) => (
            <FilaOperacion key={op.id} op={op} grupo={grupo} onVerCadena={onVerCadena} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CabeceraOperaciones({ conProveedor }: { conProveedor: boolean }) {
  return (
    <thead className="border-b border-subtle text-left text-body-muted">
      <tr>
        <th className="w-6 px-1 py-2"></th>
        {conProveedor ? <th className="px-2.5 py-2">Proveedor</th> : null}
        <th className="px-2.5 py-2">Operación</th>
        <th className="px-2.5 py-2 text-right">Cheques viejos → nuevos</th>
        <th className="px-2.5 py-2 text-right">Interés</th>
        <th className="px-2.5 py-2 text-right">Tasa</th>
        <th className="px-2.5 py-2 text-right">Días</th>
        <th className="px-2.5 py-2">Estado</th>
        <th className="px-2.5 py-2 text-right">Plata en la calle</th>
        <th className="px-2.5 py-2"></th>
      </tr>
    </thead>
  )
}

function FilaOperacion({
  op,
  grupo,
  onVerCadena,
}: {
  op: OperacionSeguimientoItem
  /** Solo en la vista "operación por operación", donde hace falta mostrar de quién es. */
  grupo?: BeneficiarioSeguimientoItem
  onVerCadena: (opId: string) => void
}) {
  const [abierta, setAbierta] = useState(false)
  const columnas = grupo ? 10 : 9

  return (
    <>
      <tr
        className="cursor-pointer border-t border-neutral-200/60 hover:bg-white/70 dark:border-zinc-700/60 dark:hover:bg-zinc-800/60"
        onClick={() => setAbierta((v) => !v)}
      >
        <td className="px-1 py-1.5 text-center text-body-muted">
          <Chevron abierto={abierta} />
        </td>
        {grupo ? (
          <td className="px-2.5 py-1.5">
            <span className="font-medium">{grupo.beneficiario || '(sin beneficiario)'}</span>
            {grupo.proveedorId === null ? <SinAsignarBadge /> : null}
          </td>
        ) : null}
        <td className="whitespace-nowrap px-2.5 py-1.5">
          {etiquetaOp(op)}
          {!op.vinculada ? (
            <span
              className="ml-1.5 inline-block rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
              title="No se encontró el cheque viejo que reemplaza (puede ser anterior a los datos que hay)."
            >
              Sin cheque viejo
            </span>
          ) : null}
          {op.origenRevisar ? (
            <span
              className="ml-1.5 inline-block rounded border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-900 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-200"
              title="Vientri no la marcó como renovación: alguien la armó a mano desde la lista A revisar."
            >
              Armada a mano
            </span>
          ) : null}
        </td>
        <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">
          {op.vinculada ? `${formatMoneyCentavos(op.totalViejosCentavos, 'ARS')} → ` : ''}
          <span className="font-medium">{formatMoneyCentavos(op.totalNuevosCentavos, 'ARS')}</span>
        </td>
        <td className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums text-red-600 dark:text-red-400">
          {op.vinculada && op.interesCentavos !== 0 ? formatMoneyCentavos(op.interesCentavos, 'ARS') : '—'}
        </td>
        <td className="px-2.5 py-1.5 text-right tabular-nums">
          {op.vinculada ? formatTasa(op.interesCentavos, op.totalViejosCentavos) : '—'}
        </td>
        <td className="px-2.5 py-1.5 text-right tabular-nums">{op.diasRenovacion ?? '—'}</td>
        <td className="px-2.5 py-1.5">
          <EstadoOperacionBadge op={op} />
        </td>
        <td className="whitespace-nowrap px-2.5 py-1.5 text-right font-medium tabular-nums">
          {op.exposicionCentavos > 0 ? formatMoneyCentavos(op.exposicionCentavos, 'ARS') : '—'}
        </td>
        <td className="whitespace-nowrap px-2.5 py-1.5 text-right">
          <button
            type="button"
            className="text-brand-primary underline"
            onClick={(e) => {
              e.stopPropagation()
              onVerCadena(op.id)
            }}
          >
            Ver cadena
          </button>
        </td>
      </tr>
      {abierta ? (
        <tr className="border-t border-dashed border-neutral-200 dark:border-zinc-700">
          <td colSpan={columnas} className="px-2.5 py-2">
            <div className="ml-6 space-y-1.5">
              <TablaPares op={op} />
              {op.obsOriginal ? <p className="text-body-muted font-mono text-[11px]">OBS: {op.obsOriginal}</p> : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}

/** Qué cheque viejo se cambió por cuál nuevo, y en qué quedó el nuevo. */
function TablaPares({ op, onIr, opsPorId }: { op: OperacionSeguimientoItem; onIr?: (opId: string) => void; opsPorId?: Map<string, OperacionSeguimientoItem> }) {
  const pares = useMemo(() => armarPares(op), [op])
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <table className="min-w-full text-xs">
        <thead className="text-body-muted bg-neutral-50/80 text-left dark:bg-zinc-800/40">
          <tr>
            <th className="px-2 py-1.5">Cheque viejo</th>
            <th className="px-2 py-1.5">Vto</th>
            <th className="px-2 py-1.5 text-right">Monto viejo</th>
            <th className="px-2 py-1.5">Cheque nuevo</th>
            <th className="px-2 py-1.5">Vto</th>
            <th className="px-2 py-1.5 text-right">Monto nuevo</th>
            <th className="px-2 py-1.5">Estado del nuevo</th>
          </tr>
        </thead>
        <tbody>
          {pares.map((p, i) => (
            <tr
              key={i}
              className={`border-t border-subtle ${p.nuevo?.estado === 'rechazado' ? 'bg-red-50/70 dark:bg-red-950/20' : ''}`}
            >
              <td className="whitespace-nowrap px-2 py-1.5 font-mono">{p.viejo ? chequeCorto(p.viejo.numeroCheque) : '—'}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{p.viejo ? formatFecha(p.viejo.fechaVencimiento) : ''}</td>
              <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                {p.viejo ? formatMoneyCentavos(p.viejo.montoCentavos, 'ARS') : ''}
              </td>
              <td className="whitespace-nowrap px-2 py-1.5 font-mono">{p.nuevo ? chequeCorto(p.nuevo.numeroCheque) : '—'}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{p.nuevo ? formatFecha(p.nuevo.fechaVencimiento) : ''}</td>
              <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                {p.nuevo ? formatMoneyCentavos(p.nuevo.montoCentavos, 'ARS') : ''}
              </td>
              <td className="whitespace-nowrap px-2 py-1.5">
                {p.nuevo ? (
                  <span className="inline-flex items-center gap-1.5">
                    <EstadoBadge estado={p.nuevo.estado} />
                    {onIr && p.nuevo.estado === 'renovado' && p.nuevo.operacionSiguienteId ? (() => {
                      const sigId = p.nuevo.operacionSiguienteId
                      const opSig = opsPorId?.get(sigId)
                      return (
                        <button
                          type="button"
                          onClick={() => onIr(sigId)}
                          className="rounded border border-violet-300 bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-900 hover:bg-violet-200 dark:border-violet-700 dark:bg-violet-900/40 dark:text-violet-200"
                        >
                          → {opSig ? etiquetaOp(opSig) : sigId}
                        </button>
                      )
                    })() : null}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
        {pares.length > 1 ? (
          <tfoot className="border-t-2 border-neutral-300 text-xs font-semibold dark:border-zinc-600">
            <tr>
              <td colSpan={2} className="px-2 py-1.5">
                Total ({op.chequesViejos.length} → {op.chequesNuevos.length})
              </td>
              <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                {op.totalViejosCentavos > 0 ? formatMoneyCentavos(op.totalViejosCentavos, 'ARS') : ''}
              </td>
              <td colSpan={2} />
              <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                {formatMoneyCentavos(op.totalNuevosCentavos, 'ARS')}
              </td>
              <td className="px-2 py-1.5 text-red-600 dark:text-red-400">
                {op.interesCentavos !== 0 ? `Interés ${formatMoneyCentavos(op.interesCentavos, 'ARS')}` : ''}
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  )
}

interface ParCheques {
  viejo: OperacionSeguimientoItem['chequesViejos'][number] | null
  nuevo: ChequeConEstadoItem | null
}

function armarPares(op: OperacionSeguimientoItem): ParCheques[] {
  const viejos = [...op.chequesViejos].sort((a, b) => (a.fechaVencimiento ?? '').localeCompare(b.fechaVencimiento ?? ''))
  const nuevos = [...op.chequesNuevos].sort((a, b) => (a.fechaVencimiento ?? '').localeCompare(b.fechaVencimiento ?? ''))
  const len = Math.max(viejos.length, nuevos.length)
  const pares: ParCheques[] = []
  for (let i = 0; i < len; i++) pares.push({ viejo: viejos[i] ?? null, nuevo: nuevos[i] ?? null })
  return pares
}

function NotaOrigenRevisar() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs text-sky-900 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-200"
      title="Vientri no la marcó como renovación: alguien la armó a mano desde la lista A revisar."
    >
      Esta renovación se originó en A revisar
    </span>
  )
}

function CadenaModal({
  op,
  opsPorId,
  camino,
  onIr,
  onSaltar,
  onCerrar,
}: {
  op: OperacionSeguimientoItem
  opsPorId: Map<string, OperacionSeguimientoItem>
  /** Operaciones abiertas en orden; la última es `op`. */
  camino: string[]
  onIr: (opId: string) => void
  /** Vuelve a la operación en esa posición del camino. */
  onSaltar: (indice: number) => void
  onCerrar: () => void
}) {
  const etiquetaDe = (id: string) => {
    const o = opsPorId.get(id)
    return o ? etiquetaOp(o) : id
  }
  const anteriorId = camino.length > 1 ? camino[camino.length - 2] : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCerrar}>
      <div
        className="surface-card max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {anteriorId ? (
          <nav className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50/80 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/40">
            <button
              type="button"
              onClick={() => onSaltar(camino.length - 2)}
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-sm font-medium text-heading hover:bg-neutral-100 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a {etiquetaDe(anteriorId)}
            </button>
            <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
              <span className="text-body-muted">Recorrido:</span>
              {camino.map((id, i) => {
                const esActual = i === camino.length - 1
                return (
                  <span key={`${id}-${i}`} className="inline-flex items-center gap-1">
                    {i > 0 ? <span className="text-body-muted">›</span> : null}
                    {esActual ? (
                      <span className="font-semibold text-heading">{etiquetaDe(id)}</span>
                    ) : (
                      <button type="button" onClick={() => onSaltar(i)} className="text-brand-primary underline">
                        {etiquetaDe(id)}
                      </button>
                    )}
                  </span>
                )
              })}
            </div>
          </nav>
        ) : null}

        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-heading text-lg font-semibold">{etiquetaOp(op)}</h2>
            <p className="text-body-muted text-sm">
              {op.beneficiario || '—'} ·{' '}
              <span className="font-medium">{op.estadoOperacion === 'abierta' ? 'Abierta' : 'Cerrada'}</span>
              {op.diasRenovacion != null ? ` · ${op.diasRenovacion} días` : ''}
            </p>
            {op.origenRevisar ? (
              <p className="mt-1">
                <NotaOrigenRevisar />
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onCerrar} className="text-body-muted hover:text-heading px-1 text-xl leading-none">
            ×
          </button>
        </header>

        {op.operacionesAnterioresIds.length > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-body-muted">Viene de:</span>
            {op.operacionesAnterioresIds.map((id) => {
              const anterior = opsPorId.get(id)
              return anterior ? (
                <button
                  key={id}
                  type="button"
                  onClick={() => onIr(id)}
                  className="rounded border border-violet-300 bg-violet-100 px-2 py-0.5 font-medium text-violet-900 hover:bg-violet-200 dark:border-violet-700 dark:bg-violet-900/40 dark:text-violet-200"
                >
                  {etiquetaOp(anterior)}
                </button>
              ) : (
                <span key={id} className="text-body-muted font-mono">{id}</span>
              )
            })}
          </div>
        ) : (
          <p className="text-body-muted mb-3 text-xs">
            {op.vinculada ? 'Origen de la cadena: no viene de otra operación.' : 'Sin cheques viejos vinculados.'}
          </p>
        )}

        <TablaPares op={op} onIr={onIr} opsPorId={opsPorId} />

        {op.obsOriginal ? (
          <p className="text-body-muted mt-2 font-mono text-[11px]">OBS: {op.obsOriginal}</p>
        ) : null}
      </div>
    </div>
  )
}
