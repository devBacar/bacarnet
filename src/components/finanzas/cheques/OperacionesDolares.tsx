import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DollarSign, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import {
  listarOperacionesDolares,
  obtenerOperacionDolares,
  crearOperacionDolares,
  anularOperacionDolares,
  type OperacionDolaresInput,
} from '../../../services/finanzasOperacionesDolaresApi'
import { FinanzasFormField, finanzasInputClass } from '../FinanzasFormField'
import { formatMoneyCentavos } from '../formatMoney'

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

function formatPorcentaje(decimal: number): string {
  return `${(decimal * 100).toFixed(2)}%`
}

export function OperacionesDolares() {
  const [vista, setVista] = useState<'lista' | 'nueva' | 'detalle'>('lista')
  const [detalleId, setDetalleId] = useState<string | null>(null)

  if (vista === 'nueva') {
    return <FormOperacion onVolver={() => setVista('lista')} />
  }

  if (vista === 'detalle' && detalleId) {
    return <DetalleOperacion id={detalleId} onVolver={() => { setVista('lista'); setDetalleId(null) }} />
  }

  return <ListaOperaciones onNueva={() => setVista('nueva')} onDetalle={(id) => { setDetalleId(id); setVista('detalle') }} />
}

function ListaOperaciones({ onNueva, onDetalle }: { onNueva: () => void; onDetalle: (id: string) => void }) {
  const { data: operaciones, isLoading, isError } = useQuery({
    queryKey: ['finanzas', 'operaciones-dolares'],
    queryFn: listarOperacionesDolares,
  })

  const activas = (operaciones ?? []).filter((o) => o.estado === 'activa')
  const anuladas = (operaciones ?? []).filter((o) => o.estado === 'anulada')

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-heading text-sm font-semibold">Operaciones de Dólares</h3>
        <button
          type="button"
          onClick={onNueva}
          className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
        >
          <Plus className="h-3.5 w-3.5" /> Nueva operación
        </button>
      </div>

      {isLoading ? (
        <p className="text-body-muted text-sm">Cargando operaciones...</p>
      ) : isError ? (
        <p className="text-danger text-sm">No se pudieron cargar las operaciones</p>
      ) : activas.length === 0 && anuladas.length === 0 ? (
        <div className="surface-card rounded-2xl border border-neutral-200 p-8 text-center dark:border-zinc-800">
          <DollarSign className="mx-auto h-8 w-8 text-neutral-300" />
          <p className="text-body-muted mt-2 text-sm">No hay operaciones registradas.</p>
          <p className="text-body-muted text-xs">Cargá una nueva operación para empezar a trackear las compras de dólares.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-neutral-300 bg-white dark:border-zinc-700 dark:bg-zinc-900">
            <table className="min-w-full text-[0.8125rem]">
              <thead className="border-b border-[var(--color-primary-muted)] bg-brand-primary-light text-left text-xs font-medium text-brand-primary">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Inversor</th>
                  <th className="px-3 py-2 text-right">USD</th>
                  <th className="px-3 py-2 text-right">TC</th>
                  <th className="px-3 py-2 text-right">Tasa</th>
                  <th className="px-3 py-2 text-right">Cheques</th>
                  <th className="px-3 py-2 text-right">Total cheques</th>
                  <th className="px-3 py-2 text-right">Costo fin.</th>
                </tr>
              </thead>
              <tbody>
                {activas.map((op) => (
                  <tr
                    key={op.id}
                    className="cursor-pointer border-t border-subtle hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                    onClick={() => onDetalle(op.id)}
                  >
                    <td className="whitespace-nowrap px-3 py-2">{formatFecha(op.fecha)}</td>
                    <td className="px-3 py-2 font-medium">{op.inversor}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-green-700 dark:text-green-400">
                      US$ {op.montoUsd.toLocaleString('es-AR')}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      $ {op.cotizacion.toLocaleString('es-AR')}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {formatPorcentaje(op.tasaMensual)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {op.detalles.length}
                    </td>
                    <td className="text-brand-primary whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                      {formatMoneyCentavos(op.totalChequesCentavos, 'ARS')}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-red-600 tabular-nums dark:text-red-400">
                      {formatMoneyCentavos(op.totalInteresCentavos, 'ARS')}
                      <span className="text-body-muted ml-1 text-xs">({formatPorcentaje(op.costoFinancieroPorcentaje)})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {anuladas.length > 0 ? (
            <details className="mt-4">
              <summary className="text-body-muted cursor-pointer text-xs">{anuladas.length} anulada{anuladas.length > 1 ? 's' : ''}</summary>
              <div className="mt-2 overflow-x-auto rounded-xl border border-neutral-200 opacity-60 dark:border-zinc-800">
                <table className="min-w-full text-[0.8125rem]">
                  <tbody>
                    {anuladas.map((op) => (
                      <tr key={op.id} className="border-t border-subtle">
                        <td className="px-3 py-2">{formatFecha(op.fecha)}</td>
                        <td className="px-3 py-2">{op.inversor}</td>
                        <td className="px-3 py-2 text-right">US$ {op.montoUsd.toLocaleString('es-AR')}</td>
                        <td className="px-3 py-2 text-right line-through">{formatMoneyCentavos(op.totalChequesCentavos, 'ARS')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </>
      )}
    </div>
  )
}

interface ChequeLinea {
  numeroCheque: string
  fechaCobro: string
  importePesos: string // se guarda como string del form, se convierte al enviar
}

function lineaVacia(): ChequeLinea {
  return { numeroCheque: '', fechaCobro: '', importePesos: '' }
}

function FormOperacion({ onVolver }: { onVolver: () => void }) {
  const queryClient = useQueryClient()
  const [fecha, setFecha] = useState('')
  const [inversor, setInversor] = useState('')
  const [cotizacion, setCotizacion] = useState('')
  const [tasaMensual, setTasaMensual] = useState('')
  const [impuesto, setImpuesto] = useState('')
  const [montoUsd, setMontoUsd] = useState('')
  const [cashPesos, setCashPesos] = useState('')
  const [notas, setNotas] = useState('')
  const [lineas, setLineas] = useState<ChequeLinea[]>([lineaVacia()])
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (input: OperacionDolaresInput) => crearOperacionDolares(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finanzas', 'operaciones-dolares'] })
      onVolver()
    },
    onError: (err) => {
      setErrMsg(err instanceof Error ? err.message : 'Error al guardar')
    },
  })

  const actualizarLinea = (idx: number, campo: keyof ChequeLinea, valor: string) => {
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)))
  }

  const agregarLinea = () => setLineas((prev) => [...prev, lineaVacia()])

  const quitarLinea = (idx: number) => {
    setLineas((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx))
  }

  // Preview de cálculos en vivo
  const tasaNum = parseFloat(tasaMensual) / 100 || 0
  const impNum = parseFloat(impuesto) / 100 || 0
  const tcNum = parseFloat(cotizacion) || 0
  const usdNum = parseFloat(montoUsd) || 0

  const previews = lineas.map((l) => {
    const importe = Math.round((parseFloat(l.importePesos?.replace(/\./g, '').replace(',', '.') || '0') || 0) * 100)
    if (!fecha || !l.fechaCobro || importe <= 0 || tasaNum <= 0) return null
    const desde = new Date(`${fecha}T12:00:00-03:00`)
    const hasta = new Date(`${l.fechaCobro}T12:00:00-03:00`)
    const dias = Math.round((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24))
    if (dias <= 0) return null
    const tasaDiaria = tasaNum / 30
    const tasaEquiv = Math.round(tasaDiaria * dias * importe)
    const descuento = Math.round(impNum * importe)
    const liquidar = importe - tasaEquiv - descuento
    return { dias, tasaEquiv, descuento, liquidar, importe }
  })

  const totalCheques = previews.reduce((s, p) => s + (p?.importe ?? 0), 0)
  const totalLiquidar = previews.reduce((s, p) => s + (p?.liquidar ?? 0), 0)
  const totalInteres = totalCheques - totalLiquidar
  const equivalenteUsd = usdNum * tcNum * 100

  const handleSubmit = () => {
    setErrMsg(null)
    const input: OperacionDolaresInput = {
      fecha,
      inversor: inversor.trim(),
      cotizacion: tcNum,
      tasaMensual: tasaNum,
      impuestoPorcentaje: impNum,
      montoUsd: usdNum,
      cashCentavos: Math.round((parseFloat(cashPesos?.replace(/\./g, '').replace(',', '.') || '0') || 0) * 100),
      notas: notas.trim(),
      cheques: lineas
        .filter((l) => l.numeroCheque.trim() && l.fechaCobro && l.importePesos)
        .map((l) => ({
          numeroCheque: l.numeroCheque.trim(),
          fechaCobro: l.fechaCobro,
          importeCentavos: Math.round((parseFloat(l.importePesos.replace(/\./g, '').replace(',', '.')) || 0) * 100),
        })),
    }
    mutation.mutate(input)
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button type="button" onClick={onVolver} className="text-body-muted hover:text-heading text-sm">
          &larr; Volver
        </button>
        <h3 className="text-heading text-sm font-semibold">Nueva operación de dólares</h3>
      </div>

      <div className="surface-card rounded-2xl border border-neutral-200 p-4 dark:border-zinc-800">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FinanzasFormField label="Fecha de operación" htmlFor="op-fecha">
            <input id="op-fecha" type="date" className={finanzasInputClass} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="Inversor / Financiero" htmlFor="op-inversor">
            <input id="op-inversor" type="text" className={finanzasInputClass} placeholder="Ej: MANA" value={inversor} onChange={(e) => setInversor(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="Tipo de cambio (TC)" htmlFor="op-tc">
            <input id="op-tc" type="number" className={finanzasInputClass} placeholder="Ej: 1555" value={cotizacion} onChange={(e) => setCotizacion(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="Monto USD recibido" htmlFor="op-usd">
            <input id="op-usd" type="number" className={finanzasInputClass} placeholder="Ej: 70000" value={montoUsd} onChange={(e) => setMontoUsd(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="Tasa mensual (%)" htmlFor="op-tasa">
            <input id="op-tasa" type="number" step="0.01" className={finanzasInputClass} placeholder="Ej: 6.5" value={tasaMensual} onChange={(e) => setTasaMensual(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="Impuesto (%)" htmlFor="op-imp">
            <input id="op-imp" type="number" step="0.01" className={finanzasInputClass} placeholder="Ej: 2.5" value={impuesto} onChange={(e) => setImpuesto(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="Cash recibido (pesos)" htmlFor="op-cash" optional>
            <input id="op-cash" type="text" className={finanzasInputClass} placeholder="0" value={cashPesos} onChange={(e) => setCashPesos(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="Notas" htmlFor="op-notas" optional>
            <input id="op-notas" type="text" className={finanzasInputClass} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </FinanzasFormField>
        </div>

        {/* Resumen en vivo */}
        {usdNum > 0 && tcNum > 0 ? (
          <div className="mt-4 flex flex-wrap gap-4 rounded-lg border border-green-200 bg-green-50/60 px-3 py-2 text-xs dark:border-green-900/60 dark:bg-green-950/20">
            <span>
              <span className="text-body-muted">Equivalente:</span>{' '}
              <span className="font-semibold">{formatMoneyCentavos(equivalenteUsd, 'ARS')}</span>
            </span>
            {totalCheques > 0 ? (
              <>
                <span>
                  <span className="text-body-muted">Total cheques:</span>{' '}
                  <span className="font-semibold">{formatMoneyCentavos(totalCheques, 'ARS')}</span>
                </span>
                <span>
                  <span className="text-body-muted">A liquidar:</span>{' '}
                  <span className="font-semibold">{formatMoneyCentavos(totalLiquidar, 'ARS')}</span>
                </span>
                <span>
                  <span className="text-body-muted">Costo financiero:</span>{' '}
                  <span className="font-semibold text-red-600 dark:text-red-400">
                    {formatMoneyCentavos(totalInteres, 'ARS')}
                    {totalLiquidar > 0 ? ` (${((totalInteres / totalLiquidar) * 100).toFixed(1)}%)` : ''}
                  </span>
                </span>
                {Math.abs(totalLiquidar - equivalenteUsd) > 100 ? (
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    Diferencia vs equivalente USD: {formatMoneyCentavos(totalLiquidar - equivalenteUsd, 'ARS')}
                  </span>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        {/* Tabla de cheques */}
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-heading text-xs font-semibold uppercase tracking-wide">Cheques entregados</p>
            <button
              type="button"
              onClick={agregarLinea}
              className="inline-flex items-center gap-1 rounded border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Plus className="h-3 w-3" /> Agregar cheque
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-300 dark:border-zinc-700">
            <table className="min-w-full text-[0.8125rem]">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs font-medium text-neutral-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                <tr>
                  <th className="px-2 py-2 w-10">#</th>
                  <th className="px-2 py-2">Nro. cheque</th>
                  <th className="px-2 py-2">Fecha cobro</th>
                  <th className="px-2 py-2">Importe ($)</th>
                  <th className="px-2 py-2 text-right">Días</th>
                  <th className="px-2 py-2 text-right">Interés</th>
                  <th className="px-2 py-2 text-right">Impuesto</th>
                  <th className="px-2 py-2 text-right">A liquidar</th>
                  <th className="px-2 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => {
                  const p = previews[i]
                  return (
                    <tr key={i} className="border-t border-subtle">
                      <td className="px-2 py-1.5 text-xs text-body-muted">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          className={`${finanzasInputClass} font-mono text-xs`}
                          placeholder="39316524"
                          value={l.numeroCheque}
                          onChange={(e) => actualizarLinea(i, 'numeroCheque', e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="date"
                          className={`${finanzasInputClass} text-xs`}
                          value={l.fechaCobro}
                          onChange={(e) => actualizarLinea(i, 'fechaCobro', e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          className={`${finanzasInputClass} text-right text-xs tabular-nums`}
                          placeholder="5.500.000"
                          value={l.importePesos}
                          onChange={(e) => actualizarLinea(i, 'importePesos', e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right text-xs tabular-nums text-body-muted">
                        {p ? p.dias : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-xs tabular-nums text-body-muted">
                        {p ? formatMoneyCentavos(p.tasaEquiv, 'ARS') : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-xs tabular-nums text-body-muted">
                        {p ? formatMoneyCentavos(p.descuento, 'ARS') : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-xs tabular-nums font-medium">
                        {p ? formatMoneyCentavos(p.liquidar, 'ARS') : '—'}
                      </td>
                      <td className="px-2 py-1.5">
                        {lineas.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => quitarLinea(i)}
                            className="text-neutral-400 hover:text-red-500"
                            title="Quitar cheque"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {totalCheques > 0 ? (
                <tfoot className="border-t-2 border-neutral-300 text-xs font-semibold dark:border-zinc-600">
                  <tr>
                    <td colSpan={3} className="px-2 py-2">Total ({lineas.filter((l) => l.importePesos).length} cheques)</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatMoneyCentavos(totalCheques, 'ARS')}</td>
                    <td></td>
                    <td className="px-2 py-2 text-right tabular-nums text-red-600 dark:text-red-400">
                      {formatMoneyCentavos(previews.reduce((s, p) => s + (p?.tasaEquiv ?? 0), 0), 'ARS')}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-red-600 dark:text-red-400">
                      {formatMoneyCentavos(previews.reduce((s, p) => s + (p?.descuento ?? 0), 0), 'ARS')}
                    </td>
                    <td className="text-brand-primary px-2 py-2 text-right tabular-nums">
                      {formatMoneyCentavos(totalLiquidar, 'ARS')}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </div>

        {errMsg ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{errMsg}</p>
        ) : null}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={handleSubmit}
            className="btn-primary rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {mutation.isPending ? 'Guardando...' : 'Guardar operación'}
          </button>
          <button type="button" onClick={onVolver} className="text-body-muted text-sm hover:underline">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

function DetalleOperacion({ id, onVolver }: { id: string; onVolver: () => void }) {
  const queryClient = useQueryClient()
  const { data: op, isLoading, isError } = useQuery({
    queryKey: ['finanzas', 'operaciones-dolares', id],
    queryFn: () => obtenerOperacionDolares(id),
  })

  const anularMut = useMutation({
    mutationFn: () => anularOperacionDolares(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finanzas', 'operaciones-dolares'] })
      onVolver()
    },
  })

  if (isLoading) return <p className="text-body-muted text-sm">Cargando...</p>
  if (isError || !op) return <p className="text-danger text-sm">No se pudo cargar la operación</p>

  const equivalenteUsd = op.montoUsd * op.cotizacion * 100

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button type="button" onClick={onVolver} className="text-body-muted hover:text-heading text-sm">
          &larr; Volver
        </button>
        <h3 className="text-heading text-sm font-semibold">
          Operación USD — {op.inversor} — {formatFecha(op.fecha)}
        </h3>
        {op.estado === 'anulada' ? (
          <span className="rounded border border-red-300 bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900 dark:border-red-700 dark:bg-red-900/40 dark:text-red-200">
            Anulada
          </span>
        ) : null}
      </div>

      <div className="surface-card rounded-2xl border border-neutral-200 p-4 dark:border-zinc-800">
        {/* KPIs */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-green-200 bg-green-50/60 p-3 dark:border-green-900/60 dark:bg-green-950/20">
            <p className="text-body-muted text-xs">USD recibidos</p>
            <p className="text-heading text-lg font-bold">US$ {op.montoUsd.toLocaleString('es-AR')}</p>
            <p className="text-body-muted text-xs">TC $ {op.cotizacion.toLocaleString('es-AR')} = {formatMoneyCentavos(equivalenteUsd, 'ARS')}</p>
          </div>
          <div className="rounded-xl border border-neutral-200 p-3 dark:border-zinc-800">
            <p className="text-body-muted text-xs">Total cheques</p>
            <p className="text-heading text-lg font-bold tabular-nums">{formatMoneyCentavos(op.totalChequesCentavos, 'ARS')}</p>
            <p className="text-body-muted text-xs">{op.detalles.length} cheques</p>
          </div>
          <div className="rounded-xl border border-neutral-200 p-3 dark:border-zinc-800">
            <p className="text-body-muted text-xs">A liquidar</p>
            <p className="text-brand-primary text-lg font-bold tabular-nums">{formatMoneyCentavos(op.totalLiquidarCentavos, 'ARS')}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50/60 p-3 dark:border-red-900/60 dark:bg-red-950/20">
            <p className="text-body-muted text-xs">Costo financiero</p>
            <p className="text-lg font-bold text-red-600 tabular-nums dark:text-red-400">{formatMoneyCentavos(op.totalInteresCentavos, 'ARS')}</p>
            <p className="text-xs text-red-500">{formatPorcentaje(op.costoFinancieroPorcentaje)} sobre liquidado</p>
          </div>
        </div>

        {/* Condiciones */}
        <div className="mb-4 flex flex-wrap gap-4 text-sm">
          <span><span className="text-body-muted">Tasa mensual:</span> <span className="font-medium">{formatPorcentaje(op.tasaMensual)}</span></span>
          <span><span className="text-body-muted">Impuesto:</span> <span className="font-medium">{formatPorcentaje(op.impuestoPorcentaje)}</span></span>
          {op.cashCentavos > 0 ? (
            <span><span className="text-body-muted">Cash:</span> <span className="font-medium">{formatMoneyCentavos(op.cashCentavos, 'ARS')}</span></span>
          ) : null}
          {op.notas ? (
            <span><span className="text-body-muted">Notas:</span> <span className="font-medium">{op.notas}</span></span>
          ) : null}
        </div>

        {/* Tabla de cheques */}
        <div className="overflow-x-auto rounded-xl border border-neutral-300 dark:border-zinc-700">
          <table className="min-w-full text-[0.8125rem]">
            <thead className="border-b border-[var(--color-primary-muted)] bg-brand-primary-light text-left text-xs font-medium text-brand-primary">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Nro. cheque</th>
                <th className="px-3 py-2">Fecha cobro</th>
                <th className="px-3 py-2 text-right">Días</th>
                <th className="px-3 py-2 text-right">Importe</th>
                <th className="px-3 py-2 text-right">Interés</th>
                <th className="px-3 py-2 text-right">Impuesto</th>
                <th className="px-3 py-2 text-right">A liquidar</th>
              </tr>
            </thead>
            <tbody>
              {op.detalles.map((d, i) => (
                <tr key={d.numeroCheque} className="border-t border-subtle">
                  <td className="px-3 py-2 text-xs text-body-muted">{i + 1}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{d.numeroCheque}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatFecha(d.fechaCobro)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.dias}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMoneyCentavos(d.importeCentavos, 'ARS')}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-600 dark:text-red-400">{formatMoneyCentavos(d.tasaEquivalenteCentavos, 'ARS')}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-600 dark:text-red-400">{formatMoneyCentavos(d.descuentoCentavos, 'ARS')}</td>
                  <td className="text-brand-primary px-3 py-2 text-right tabular-nums font-medium">{formatMoneyCentavos(d.importeLiquidarCentavos, 'ARS')}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-neutral-300 text-xs font-semibold dark:border-zinc-600">
              <tr>
                <td colSpan={4} className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoneyCentavos(op.totalChequesCentavos, 'ARS')}</td>
                <td className="px-3 py-2 text-right tabular-nums text-red-600 dark:text-red-400">
                  {formatMoneyCentavos(op.detalles.reduce((s, d) => s + d.tasaEquivalenteCentavos, 0), 'ARS')}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-red-600 dark:text-red-400">
                  {formatMoneyCentavos(op.detalles.reduce((s, d) => s + d.descuentoCentavos, 0), 'ARS')}
                </td>
                <td className="text-brand-primary px-3 py-2 text-right tabular-nums">{formatMoneyCentavos(op.totalLiquidarCentavos, 'ARS')}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {op.estado === 'activa' ? (
          <div className="mt-4 text-right">
            <button
              type="button"
              disabled={anularMut.isPending}
              onClick={() => {
                if (confirm('Anular esta operación? No se puede deshacer.')) anularMut.mutate()
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <X className="h-3.5 w-3.5" /> Anular operación
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
