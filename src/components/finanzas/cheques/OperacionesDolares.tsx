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
import { CargaDiariaPanel, EtiquetaCargaDia } from '../cargaDiaria/CargaDiariaPanel'

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

function formatPorcentaje(decimal: number): string {
  return `${(decimal * 100).toFixed(2)}%`
}

/** Limpia un string con formato moneda a solo dígitos */
function limpiarImporte(val: string): string {
  return val.replace(/[^0-9]/g, '')
}

/** Formatea dígitos a "$ 5.500.000,00" */
function formatImporteInput(raw: string): string {
  const digitos = limpiarImporte(raw)
  if (!digitos) return ''
  const num = parseInt(digitos, 10)
  if (isNaN(num)) return ''
  return `$ ${num.toLocaleString('es-AR')},00`
}

/** Parsea "$ 5.500.000,00" o "5500000" a centavos */
function parsearImporteCentavos(val: string): number {
  const digitos = limpiarImporte(val)
  if (!digitos) return 0
  return parseInt(digitos, 10) * 100
}

export function OperacionesDolares() {
  const [modalNueva, setModalNueva] = useState(false)
  const [detalleId, setDetalleId] = useState<string | null>(null)

  return (
    <>
      <ListaOperaciones onNueva={() => setModalNueva(true)} onDetalle={(id) => setDetalleId(id)} />
      {modalNueva ? <ModalFormOperacion onClose={() => setModalNueva(false)} /> : null}
      {detalleId ? <ModalDetalleOperacion id={detalleId} onClose={() => setDetalleId(null)} /> : null}
    </>
  )
}

/** Botón para abrir el form de nueva operación USD desde cualquier lugar */
export function BotonNuevaOperacionUsd() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400 dark:hover:bg-green-900/40"
      >
        <DollarSign className="h-3.5 w-3.5" /> Nueva Op. USD
      </button>
      {open ? <ModalFormOperacion onClose={() => setOpen(false)} /> : null}
    </>
  )
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
                  <th className="px-3 py-2">#</th>
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
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-body-muted">{op.id}</td>
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
                        <td className="px-3 py-2 font-mono text-xs">{op.id}</td>
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

interface MovimientoLinea {
  fechaCobro: string
  importePesos: string
}

function lineaVacia(): MovimientoLinea {
  return { fechaCobro: '', importePesos: '' }
}

function ModalFormOperacion({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [inversor, setInversor] = useState('')
  const [cotizacion, setCotizacion] = useState('')
  const [tasaMensual, setTasaMensual] = useState('')
  const [impuesto, setImpuesto] = useState('2.5')
  const [montoUsd, setMontoUsd] = useState('')
  const [importeOriginal, setImporteOriginal] = useState('')
  const [notas, setNotas] = useState('')
  const [lineas, setLineas] = useState<MovimientoLinea[]>([lineaVacia()])
  const [lineaActiva, setLineaActiva] = useState(0)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (input: OperacionDolaresInput) => crearOperacionDolares(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finanzas', 'operaciones-dolares'] })
      onClose()
    },
    onError: (err) => {
      setErrMsg(err instanceof Error ? err.message : 'Error al guardar')
    },
  })

  const actualizarLinea = (idx: number, campo: keyof MovimientoLinea, valor: string) => {
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)))
  }

  const agregarLinea = () => setLineas((prev) => [...prev, lineaVacia()])

  const quitarLinea = (idx: number) => {
    setLineas((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx))
  }

  // Importe original = TC × USD (se autocompleta)
  const tcNum = parseFloat(cotizacion) || 0
  const usdNum = parseFloat(montoUsd) || 0
  const importeOriginalAuto = tcNum > 0 && usdNum > 0
    ? (tcNum * usdNum).toLocaleString('es-AR', { maximumFractionDigits: 0 })
    : ''
  // Preview de cálculos en vivo — tasa diaria = tasaMensual * 12 / 365
  const tasaNum = parseFloat(tasaMensual) / 100 || 0
  const impNum = parseFloat(impuesto) / 100 || 0

  const previews = lineas.map((l) => {
    const importe = parsearImporteCentavos(l.importePesos)
    if (!fecha || !l.fechaCobro || importe <= 0 || tasaNum <= 0) return null
    const desde = new Date(`${fecha}T12:00:00-03:00`)
    const hasta = new Date(`${l.fechaCobro}T12:00:00-03:00`)
    const dias = Math.round((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24))
    if (dias <= 0) return null
    const tasaDiaria = (tasaNum * 12) / 365
    const tasaEquiv = Math.round(tasaDiaria * dias * importe)
    const descuento = Math.round(impNum * importe)
    const liquidar = importe - tasaEquiv - descuento
    return { dias, tasaEquiv, descuento, liquidar, importe }
  })

  const totalCheques = previews.reduce((s, p) => s + (p?.importe ?? 0), 0)
  const totalLiquidar = previews.reduce((s, p) => s + (p?.liquidar ?? 0), 0)
  const totalInteres = totalCheques - totalLiquidar
  const equivalenteUsd = usdNum * tcNum * 100
  const dolarReal = usdNum > 0 && totalCheques > 0 ? totalCheques / usdNum / 100 : 0

  const handleSubmit = () => {
    setErrMsg(null)
    const input: OperacionDolaresInput = {
      fecha,
      inversor: inversor.trim(),
      cotizacion: tcNum,
      tasaMensual: tasaNum,
      impuestoPorcentaje: impNum,
      montoUsd: usdNum,
      cashCentavos: parsearImporteCentavos(importeOriginal || importeOriginalAuto),
      notas: notas.trim(),
      cheques: lineas
        .filter((l) => l.fechaCobro && parsearImporteCentavos(l.importePesos) > 0)
        .map((l) => ({
          fechaCobro: l.fechaCobro,
          importeCentavos: parsearImporteCentavos(l.importePesos),
        })),
    }
    mutation.mutate(input)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-6" onClick={onClose}>
      <div
        className="surface-card w-full max-w-5xl rounded-2xl p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-heading text-base font-semibold">Nueva operación de dólares</h3>
          <button type="button" onClick={onClose} className="text-body-muted hover:text-heading rounded p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FinanzasFormField label="Fecha de operación" htmlFor="op-fecha">
            <input id="op-fecha" type="date" className={`${finanzasInputClass} text-sm`} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="Inversor / Financiero" htmlFor="op-inversor">
            <input id="op-inversor" type="text" className={`${finanzasInputClass} text-sm`} placeholder="Ej: MANA" value={inversor} onChange={(e) => setInversor(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="Tipo de cambio (TC)" htmlFor="op-tc">
            <input id="op-tc" type="number" className={`${finanzasInputClass} text-sm`} placeholder="Ej: 1555" value={cotizacion} onChange={(e) => setCotizacion(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="Monto USD solicitados" htmlFor="op-usd">
            <input id="op-usd" type="number" className={`${finanzasInputClass} text-sm`} placeholder="Ej: 70000" value={montoUsd} onChange={(e) => setMontoUsd(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="Tasa mensual (%)" htmlFor="op-tasa">
            <input id="op-tasa" type="number" step="0.01" className={`${finanzasInputClass} text-sm`} placeholder="Ej: 6.5" value={tasaMensual} onChange={(e) => setTasaMensual(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="Imp. cheque y débito (%)" htmlFor="op-imp">
            <input id="op-imp" type="number" step="0.01" className={`${finanzasInputClass} text-sm`} placeholder="2.5" value={impuesto} onChange={(e) => setImpuesto(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="Importe original (TC × USD)" htmlFor="op-importe-orig">
            <input id="op-importe-orig" type="text" className={`${finanzasInputClass} text-sm bg-neutral-50 dark:bg-zinc-800/50`} placeholder={importeOriginalAuto || 'Se calcula solo'} value={importeOriginal} onChange={(e) => setImporteOriginal(e.target.value)} readOnly={!importeOriginal && !!importeOriginalAuto} />
          </FinanzasFormField>
          <FinanzasFormField label="Notas" htmlFor="op-notas" optional>
            <input id="op-notas" type="text" className={`${finanzasInputClass} text-sm`} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </FinanzasFormField>
        </div>

        {/* Resumen en vivo */}
        {usdNum > 0 && tcNum > 0 ? (
          <div className="mt-4 flex flex-wrap gap-4 rounded-lg border border-green-200 bg-green-50/60 px-3 py-2.5 text-sm dark:border-green-900/60 dark:bg-green-950/20">
            <span>
              <span className="text-body-muted">Equivalente (USD × TC):</span>{' '}
              <span className="font-semibold">{formatMoneyCentavos(equivalenteUsd, 'ARS')}</span>
            </span>
            {totalCheques > 0 ? (
              <>
                <span>
                  <span className="text-body-muted">Total cheques:</span>{' '}
                  <span className="font-semibold">{formatMoneyCentavos(totalCheques, 'ARS')}</span>
                </span>
                <span>
                  <span className="text-body-muted">Costo financiero:</span>{' '}
                  <span className="font-semibold text-red-600 dark:text-red-400">
                    {formatMoneyCentavos(totalInteres, 'ARS')}
                    {totalLiquidar > 0 ? ` (${((totalInteres / totalLiquidar) * 100).toFixed(1)}%)` : ''}
                  </span>
                </span>
                <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 dark:border-amber-700 dark:bg-amber-900/30">
                  <span className="text-body-muted">Dólar real pagado:</span>{' '}
                  <span className="font-bold text-amber-800 dark:text-amber-300">
                    $ {dolarReal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </span>
              </>
            ) : null}
          </div>
        ) : null}

        {/* Asistente: qué días están livianos de pagos */}
        <div className="mt-4">
          <CargaDiariaPanel
            diaElegido={lineas[lineaActiva]?.fechaCobro}
            onElegirDia={(fecha) => {
              const vacia = lineas.findIndex((l) => !l.fechaCobro)
              actualizarLinea(vacia >= 0 ? vacia : Math.min(lineaActiva, lineas.length - 1), 'fechaCobro', fecha)
            }}
          />
        </div>

        {/* Movimientos de cheques */}
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-heading text-sm font-semibold uppercase tracking-wide">Movimientos de cheques</p>
            <button
              type="button"
              onClick={agregarLinea}
              className="inline-flex items-center gap-1 rounded border border-neutral-200 px-2.5 py-1 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar movimiento
            </button>
          </div>

          <div className="max-h-[45vh] overflow-auto rounded-xl border border-neutral-300 dark:border-zinc-700">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 border-b border-neutral-200 bg-neutral-50 text-left text-sm font-medium text-neutral-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                <tr>
                  <th className="px-2 py-2 w-10">#</th>
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
                      <td className="px-2 py-2 text-sm text-body-muted">{i + 1}</td>
                      <td className="px-2 py-2">
                        <input
                          type="date"
                          className={`${finanzasInputClass} text-sm`}
                          value={l.fechaCobro}
                          onChange={(e) => actualizarLinea(i, 'fechaCobro', e.target.value)}
                          onFocus={() => setLineaActiva(i)}
                        />
                        <EtiquetaCargaDia fecha={l.fechaCobro} />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          className={`${finanzasInputClass} text-right text-sm tabular-nums`}
                          placeholder="$ 5.500.000,00"
                          value={l.importePesos}
                          onChange={(e) => actualizarLinea(i, 'importePesos', e.target.value)}
                          onBlur={() => {
                            const formatted = formatImporteInput(l.importePesos)
                            if (formatted) actualizarLinea(i, 'importePesos', formatted)
                          }}
                        />
                      </td>
                      <td className="px-2 py-2 text-right text-sm tabular-nums text-body-muted">
                        {p ? p.dias : '—'}
                      </td>
                      <td className="px-2 py-2 text-right text-sm tabular-nums text-body-muted">
                        {p ? formatMoneyCentavos(p.tasaEquiv, 'ARS') : '—'}
                      </td>
                      <td className="px-2 py-2 text-right text-sm tabular-nums text-body-muted">
                        {p ? formatMoneyCentavos(p.descuento, 'ARS') : '—'}
                      </td>
                      <td className="px-2 py-2 text-right text-sm tabular-nums font-medium">
                        {p ? formatMoneyCentavos(p.liquidar, 'ARS') : '—'}
                      </td>
                      <td className="px-2 py-2">
                        {lineas.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => quitarLinea(i)}
                            className="text-neutral-400 hover:text-red-500"
                            title="Quitar movimiento"
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
                <tfoot className="border-t-2 border-neutral-300 text-sm font-semibold dark:border-zinc-600">
                  <tr>
                    <td colSpan={2} className="px-2 py-2.5">Total ({lineas.filter((l) => l.importePesos).length} movimientos)</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatMoneyCentavos(totalCheques, 'ARS')}</td>
                    <td></td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">
                      {formatMoneyCentavos(previews.reduce((s, p) => s + (p?.tasaEquiv ?? 0), 0), 'ARS')}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">
                      {formatMoneyCentavos(previews.reduce((s, p) => s + (p?.descuento ?? 0), 0), 'ARS')}
                    </td>
                    <td className="text-brand-primary px-2 py-2.5 text-right tabular-nums">
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

        <div className="mt-4 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="text-body-muted text-sm hover:underline">
            Cancelar
          </button>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={handleSubmit}
            className="btn-primary rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {mutation.isPending ? 'Guardando...' : 'Guardar operación'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalDetalleOperacion({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: op, isLoading, isError } = useQuery({
    queryKey: ['finanzas', 'operaciones-dolares', id],
    queryFn: () => obtenerOperacionDolares(id),
  })

  const anularMut = useMutation({
    mutationFn: () => anularOperacionDolares(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finanzas', 'operaciones-dolares'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8" onClick={onClose}>
      <div
        className="surface-card w-full max-w-3xl rounded-2xl p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading ? (
          <p className="text-body-muted py-8 text-center text-sm">Cargando...</p>
        ) : isError || !op ? (
          <p className="text-danger py-8 text-center text-sm">No se pudo cargar la operación</p>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-heading text-sm font-semibold">
                {op.id} — {op.inversor} — {formatFecha(op.fecha)}
              </h3>
              <div className="flex items-center gap-2">
                {op.estado === 'anulada' ? (
                  <span className="rounded border border-red-300 bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900 dark:border-red-700 dark:bg-red-900/40 dark:text-red-200">
                    Anulada
                  </span>
                ) : null}
                <button type="button" onClick={onClose} className="text-body-muted hover:text-heading rounded p-1">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* KPIs */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-green-200 bg-green-50/60 p-3 dark:border-green-900/60 dark:bg-green-950/20">
                <p className="text-body-muted text-xs">USD recibidos</p>
                <p className="text-heading text-lg font-bold">US$ {op.montoUsd.toLocaleString('es-AR')}</p>
                <p className="text-body-muted text-xs">TC $ {op.cotizacion.toLocaleString('es-AR')} = {formatMoneyCentavos(op.montoUsd * op.cotizacion * 100, 'ARS')}</p>
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
          </>
        )}
      </div>
    </div>
  )
}
