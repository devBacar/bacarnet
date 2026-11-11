import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, Clock, Link2, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '../../../context'
import {
  fetchSeguimientoRenovaciones,
  recalcularSeguimiento,
  type BeneficiarioSeguimientoItem,
  type ChequeConEstadoItem,
  type EstadoChequeRenov,
  type OperacionSeguimientoItem,
  type SeguimientoEstadoFiltro,
} from '../../../services/finanzasChequesApi'
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

function etiquetaOp(op: OperacionSeguimientoItem): string {
  return `Op ${formatFecha(op.fechaEmision)}${op.banco ? ` · ${op.banco}` : ''}`
}

export function SeguimientoRenovaciones() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { params, cambiar } = useParamsUrl()
  const estado = valorPermitido<SeguimientoEstadoFiltro>(params.get('seg'), ['abiertas', 'todas'], 'abiertas')
  const setEstado = (v: SeguimientoEstadoFiltro) => cambiar({ seg: v === 'abiertas' ? null : v })
  /** Pila de navegación del drill-down (en la URL como ?cadena=id1,id2): la última es la operación que se está viendo. */
  const pila = useMemo(() => (params.get('cadena') ?? '').split(',').filter(Boolean), [params])
  const setPila = (nueva: string[]) => cambiar({ cadena: nueva.join(',') || null })

  const recalcularMut = useMutation({
    mutationFn: recalcularSeguimiento,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finanzas', 'cheques-ocasionales', 'seguimiento'] })
    },
  })

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

  const opActualId = pila[pila.length - 1]
  const opActual = opActualId ? opsPorId.get(opActualId) ?? null : null

  if (isLoading) return <p className="text-body-muted text-sm">Cargando seguimiento de renovaciones…</p>
  if (isError) {
    return (
      <p className="text-danger text-sm">
        {error instanceof Error ? error.message : 'No se pudo cargar el seguimiento de renovaciones'}
      </p>
    )
  }

  const totales = data?.totales
  const beneficiarios = data?.beneficiarios ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 dark:border-zinc-800">
          {([
            ['abiertas', 'Abiertas'],
            ['todas', 'Todas'],
          ] as const).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setEstado(val)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                estado === val ? 'bg-brand-primary text-white shadow-sm' : 'text-body-muted hover:text-heading'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={recalcularMut.isPending}
          onClick={() => recalcularMut.mutate()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${recalcularMut.isPending ? 'animate-spin' : ''}`} />
          {recalcularMut.isPending ? 'Recalculando…' : 'Recalcular'}
        </button>

        {recalcularMut.isError ? (
          <span className="text-xs text-red-600 dark:text-red-400">
            {recalcularMut.error instanceof Error ? recalcularMut.error.message : 'Error al recalcular'}
          </span>
        ) : recalcularMut.isSuccess ? (
          <span className="text-xs text-green-600 dark:text-green-400">
            Listo — {recalcularMut.data.operaciones} operaciones
          </span>
        ) : null}

        {totales ? (
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 dark:border-zinc-700 dark:bg-zinc-800/60">
              <span className="text-body-muted">Beneficiarios:</span>{' '}
              <span className="text-heading font-semibold">{totales.beneficiarios}</span>
            </span>
            <span className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 dark:border-zinc-700 dark:bg-zinc-800/60">
              <span className="text-body-muted">Posiciones abiertas:</span>{' '}
              <span className="text-heading font-semibold">{totales.posicionesAbiertas}</span>
            </span>
            <span className="rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-1.5 dark:border-amber-900/60 dark:bg-amber-950/20">
              <span className="text-body-muted">Exposición total:</span>{' '}
              <span className="text-heading font-semibold tabular-nums">
                {formatMoneyCentavos(totales.exposicionCentavos, 'ARS')}
              </span>
            </span>
          </div>
        ) : null}
      </div>

      {totales && (totales.vencidosCantidad > 0 || totales.porVencer7d > 0 || totales.porVencer30d > 0 || totales.profundidadMaxCadena > 0) ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {totales.vencidosCantidad > 0 ? (
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-3 dark:border-red-900/60 dark:bg-red-950/20">
              <div className="flex items-center gap-2 text-xs font-medium text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                Vencidos sin cobrar
              </div>
              <p className="mt-1 text-lg font-semibold tabular-nums text-red-900 dark:text-red-200">
                {totales.vencidosCantidad} {totales.vencidosCantidad === 1 ? 'cheque' : 'cheques'}
              </p>
              <p className="text-xs tabular-nums text-red-700/80 dark:text-red-400/80">
                {formatMoneyCentavos(totales.vencidosCentavos, 'ARS')}
              </p>
            </div>
          ) : null}

          {totales.porVencer30d > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
              <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                <Clock className="h-4 w-4" />
                Vencen pronto
              </div>
              <div className="mt-1 flex items-baseline gap-3">
                {totales.porVencer7d > 0 ? (
                  <span>
                    <span className="text-lg font-semibold tabular-nums text-amber-900 dark:text-amber-200">{totales.porVencer7d}</span>
                    <span className="ml-1 text-xs text-amber-700/80 dark:text-amber-400/80">en 7d</span>
                  </span>
                ) : null}
                {totales.porVencer15d > 0 ? (
                  <span>
                    <span className="text-lg font-semibold tabular-nums text-amber-900 dark:text-amber-200">{totales.porVencer15d}</span>
                    <span className="ml-1 text-xs text-amber-700/80 dark:text-amber-400/80">en 15d</span>
                  </span>
                ) : null}
                <span>
                  <span className="text-lg font-semibold tabular-nums text-amber-900 dark:text-amber-200">{totales.porVencer30d}</span>
                  <span className="ml-1 text-xs text-amber-700/80 dark:text-amber-400/80">en 30d</span>
                </span>
              </div>
            </div>
          ) : null}

          {totales.profundidadMaxCadena > 0 ? (
            <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900/60 dark:bg-violet-950/20">
              <div className="flex items-center gap-2 text-xs font-medium text-violet-700 dark:text-violet-400">
                <Link2 className="h-4 w-4" />
                Cadena más larga
              </div>
              <p className="mt-1 text-lg font-semibold tabular-nums text-violet-900 dark:text-violet-200">
                {totales.profundidadMaxCadena} {totales.profundidadMaxCadena === 1 ? 'eslabón' : 'eslabones'}
              </p>
              {totales.cadenaMasLargaOp ? (
                <p className="text-xs text-violet-600/80 dark:text-violet-400/80">
                  Última op: <span className="font-medium">{totales.cadenaMasLargaOp.beneficiario}</span>
                  <span className="ml-1 font-mono text-[10px] opacity-70">({totales.cadenaMasLargaOp.id})</span>
                </p>
              ) : null}
            </div>
          ) : null}

        </div>
      ) : null}

      {beneficiarios.length === 0 ? (
        <p className="text-body-muted px-4 py-8 text-center">
          {estado === 'abiertas' ? 'No hay posiciones abiertas.' : 'No hay operaciones de renovación.'}
        </p>
      ) : null}

      {beneficiarios.map((g) => (
        <BeneficiarioSeccion key={g.beneficiarioNormalizado} grupo={g} onVerCadena={(id) => setPila([id])} />
      ))}

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

function BeneficiarioSeccion({
  grupo: g,
  onVerCadena,
}: {
  grupo: BeneficiarioSeguimientoItem
  onVerCadena: (opId: string) => void
}) {
  const [abierto, setAbierto] = useState(false)

  return (
    <section className="surface-card rounded-2xl border border-neutral-200 p-4 dark:border-zinc-800">
      <button
        type="button"
        className="flex w-full flex-wrap items-baseline justify-between gap-2 text-left"
        onClick={() => setAbierto((v) => !v)}
      >
        <h3 className="text-heading text-sm font-semibold">
          {g.beneficiario || <span className="text-body-muted italic">(sin beneficiario)</span>}
        </h3>
        <span className="text-body-muted flex flex-wrap items-center gap-x-2 text-xs">
          <span>
            {g.posicionesAbiertas} {g.posicionesAbiertas === 1 ? 'posición abierta' : 'posiciones abiertas'}
          </span>
          {g.rechazadas > 0 ? (
            <span className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              {g.rechazadas} {g.rechazadas === 1 ? 'rechazado' : 'rechazados'}
            </span>
          ) : null}
          <span>
            · Exposición{' '}
            <span className="text-heading font-semibold tabular-nums">
              {formatMoneyCentavos(g.exposicionCentavos, 'ARS')}
            </span>
          </span>
          {abierto ? <ChevronUp className="h-4 w-4 text-neutral-400" /> : <ChevronDown className="h-4 w-4 text-neutral-400" />}
        </span>
      </button>

      {abierto ? (
        <div className="mt-3 space-y-3">
          {g.operaciones.map((op) => (
            <OperacionPosiciones key={op.id} op={op} onVerCadena={onVerCadena} />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function OperacionPosiciones({
  op,
  onVerCadena,
}: {
  op: OperacionSeguimientoItem
  onVerCadena: (opId: string) => void
}) {
  const pares = useMemo(() => armarPares(op), [op])

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-t-xl border-b border-neutral-200 bg-neutral-50/80 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-800/40">
        <span className="text-heading font-semibold">{etiquetaOp(op)}</span>
        <span
          className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${
            op.estadoOperacion === 'abierta' ? ESTADO_UI.pendiente.clase : ESTADO_UI.anulado.clase
          }`}
        >
          {op.estadoOperacion === 'abierta' ? 'Abierta' : 'Cerrada'}
        </span>
        {op.operacionesAnterioresIds.length > 0 ? (
          <span className="text-body-muted inline-flex items-center gap-1 text-xs">
            <Link2 className="h-3.5 w-3.5" />
            viene de {op.operacionesAnterioresIds.length === 1 ? 'otra operación' : `${op.operacionesAnterioresIds.length} operaciones`}
          </span>
        ) : null}
        {op.origenRevisar ? <NotaOrigenRevisar /> : null}
        <span className="text-body-muted ml-auto inline-flex items-center gap-3 text-xs tabular-nums">
          <span>
            Exposición{' '}
            <span className="text-heading font-semibold">{formatMoneyCentavos(op.exposicionCentavos, 'ARS')}</span>
          </span>
          <button type="button" className="text-brand-primary underline" onClick={() => onVerCadena(op.id)}>
            Ver cadena
          </button>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="text-body-muted bg-neutral-50/80 text-left dark:bg-zinc-800/40">
            <tr>
              <th className="px-2 py-1.5">Cheque viejo</th>
              <th className="px-2 py-1.5">Vto</th>
              <th className="px-2 py-1.5 text-right">Monto viejo</th>
              <th className="px-2 py-1.5">Cheque nuevo</th>
              <th className="px-2 py-1.5">Vto</th>
              <th className="px-2 py-1.5 text-right">Monto nuevo</th>
              <th className="px-2 py-1.5">Estado</th>
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
                  {p.nuevo ? <EstadoBadge estado={p.nuevo.estado} /> : null}
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
  const pares = useMemo(() => armarPares(op), [op])
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

        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-zinc-700">
          <table className="min-w-full text-xs">
            <thead className="text-body-muted bg-neutral-50/80 text-left dark:bg-zinc-800/40">
              <tr>
                <th className="px-2 py-1.5">Cheque viejo</th>
                <th className="px-2 py-1.5">Vto</th>
                <th className="px-2 py-1.5 text-right">Monto viejo</th>
                <th className="px-2 py-1.5">Cheque nuevo</th>
                <th className="px-2 py-1.5">Vto</th>
                <th className="px-2 py-1.5 text-right">Monto nuevo</th>
                <th className="px-2 py-1.5">Estado nuevo</th>
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
                        {p.nuevo.estado === 'renovado' && p.nuevo.operacionSiguienteId ? (() => {
                          const sigId = p.nuevo.operacionSiguienteId
                          const opSig = opsPorId.get(sigId)
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

        {op.obsOriginal ? (
          <p className="text-body-muted mt-2 font-mono text-[11px]">OBS: {op.obsOriginal}</p>
        ) : null}
      </div>
    </div>
  )
}
