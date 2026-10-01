import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatMoneyCentavos } from '../formatMoney'
import { useAuth } from '../../../context'
import {
  fetchCompromisoHistorial,
  fetchPagosHechos,
  type MedioPago,
  type PagoHechoItem,
} from '../../../services/finanzasAgendaApi'

const control =
  'inline-flex items-center justify-center rounded-md border border-[var(--color-primary-muted)] bg-white/80 p-1 text-[var(--color-primary)] hover:bg-white dark:bg-zinc-900/60 dark:hover:bg-zinc-800'

function mesActual(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .slice(0, 7)
}

function moverMes(mes: string, delta: number): string {
  const [anio, numero] = mes.split('-').map(Number)
  const date = new Date(Date.UTC(anio, numero - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function etiquetaMes(mes: string): string {
  const [anio, numero] = mes.split('-').map(Number)
  const nombre = new Intl.DateTimeFormat('es-AR', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(anio, numero - 1, 1)),
  )
  return `${nombre} ${anio}`
}

function fechaVisible(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  return `${match[3]}/${match[2]}/${match[1]}`
}

function sinAcento(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function agrupar(pagos: PagoHechoItem[]): Array<{ compromisoId: string; pagos: PagoHechoItem[] }> {
  const grupos: Array<{ compromisoId: string; pagos: PagoHechoItem[] }> = []
  for (const pago of pagos) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.compromisoId === pago.compromisoId) ultimo.pagos.push(pago)
    else grupos.push({ compromisoId: pago.compromisoId, pagos: [pago] })
  }
  return grupos
}

export function PagosHechos() {
  const { user } = useAuth()
  const [mes, setMes] = useState(mesActual)
  const [medio, setMedio] = useState<'todos' | MedioPago>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [historialId, setHistorialId] = useState<string | null>(null)

  const consulta = useQuery({
    queryKey: ['finanzas', 'agenda', 'pagos-hechos', mes],
    queryFn: () => fetchPagosHechos(mes),
    enabled: Boolean(user),
  })

  const pagos = useMemo(() => {
    const texto = sinAcento(busqueda.trim())
    return (consulta.data?.pagos ?? []).filter((pago) => {
      if (medio !== 'todos' && pago.medio !== medio) return false
      if (!texto) return true
      return sinAcento(`${pago.proveedorONombre} ${pago.concepto}`).includes(texto)
    })
  }, [consulta.data?.pagos, medio, busqueda])

  const totales = useMemo(() => {
    let ars = 0
    let usd = 0
    for (const pago of pagos) {
      if (pago.moneda === 'USD') usd += pago.montoCentavos
      else ars += pago.montoCentavos
    }
    return { ars, usd }
  }, [pagos])

  const grupos = useMemo(() => agrupar(pagos), [pagos])
  const historial = useQuery({
    queryKey: ['finanzas', 'agenda', 'historial', historialId],
    queryFn: () => fetchCompromisoHistorial(historialId!),
    enabled: Boolean(historialId),
  })

  const totalTexto = consulta.isLoading
    ? '…'
    : totales.usd > 0 && totales.ars > 0
      ? `${formatMoneyCentavos(totales.ars, 'ARS')} · ${formatMoneyCentavos(totales.usd, 'USD')}`
      : totales.usd > 0
        ? formatMoneyCentavos(totales.usd, 'USD')
        : formatMoneyCentavos(totales.ars, 'ARS')

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-neutral-300 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <header className="border-b border-[var(--color-primary-muted)] bg-[var(--color-primary-light)] px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1">
            <button type="button" className={control} aria-label="Mes anterior" onClick={() => setMes((actual) => moverMes(actual, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-32 text-center text-[15px] font-medium capitalize text-[var(--color-primary)]">
              {etiquetaMes(mes)}
            </span>
            <button type="button" className={control} aria-label="Mes siguiente" onClick={() => setMes((actual) => moverMes(actual, 1))}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <select
            aria-label="Medio"
            className="rounded-lg border border-[var(--color-primary-muted)] bg-white px-2 py-1 text-[13px] text-neutral-800 dark:bg-zinc-900 dark:text-gray-100"
            value={medio}
            onChange={(event) => setMedio(event.target.value as 'todos' | MedioPago)}
          >
            <option value="todos">Todos</option>
            <option value="cheque">Cheque</option>
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
          </select>
          <input
            type="search"
            aria-label="Buscar por a quién o concepto"
            placeholder="A quién o concepto"
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            className="min-w-0 basis-full rounded-lg border border-[var(--color-primary-muted)] bg-white px-2 py-1 text-[13px] text-neutral-800 sm:max-w-xs sm:flex-1 sm:basis-auto dark:bg-zinc-900 dark:text-gray-100"
          />
          <p className="ml-auto text-right text-[13px] text-[var(--color-primary)]">
            Total pagado{' '}
            <span className="text-[15px] font-medium tabular-nums">{totalTexto}</span>
          </p>
        </div>
      </header>

      {consulta.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
        </div>
      ) : consulta.isError ? (
        <p className="px-4 py-6 text-[13px] text-red-700 dark:text-red-400">No se pudieron cargar los pagos hechos.</p>
      ) : pagos.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-neutral-500 dark:text-neutral-400">No hay pagos en este mes.</p>
      ) : (
        <>
          <div className="hidden md:block">
            <table className="w-full table-fixed border-collapse text-left">
              <thead>
                <tr className="border-b border-neutral-200 text-[13px] text-neutral-500 dark:border-zinc-700 dark:text-neutral-400">
                  <th className="w-[12%] px-3 py-2 font-medium">Fecha</th>
                  <th className="w-[16%] px-3 py-2 font-medium">A quién</th>
                  <th className="w-[22%] px-3 py-2 font-medium">Concepto</th>
                  <th className="w-[16%] px-3 py-2 text-right font-medium">Monto</th>
                  <th className="w-[20%] px-3 py-2 font-medium">Cómo se pagó</th>
                  <th className="w-[14%] px-2 py-2 font-medium">
                    <span className="sr-only">Historial</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((grupo, indiceGrupo) =>
                  grupo.pagos.map((pago, indice) => (
                    <tr
                      key={`${pago.compromisoId}-${pago.fecha}-${indice}`}
                      className={`border-b border-neutral-200 dark:border-zinc-800 ${
                        grupo.pagos.length > 1
                          ? 'bg-neutral-50/80 shadow-[inset_3px_0_0_0_var(--color-primary)] dark:bg-zinc-800/40'
                          : indiceGrupo % 2 === 1
                            ? 'bg-neutral-50/50 dark:bg-zinc-800/20'
                            : ''
                      }`}
                    >
                      <td className="px-3 py-2 text-[13px] tabular-nums text-neutral-700 dark:text-neutral-200">
                        {fechaVisible(pago.fecha)}
                      </td>
                      <td className="truncate px-3 py-2 text-[15px] text-neutral-900 dark:text-gray-100" title={pago.proveedorONombre}>
                        {pago.proveedorONombre}
                      </td>
                      <td className="px-3 py-2 text-[15px] text-neutral-900 dark:text-gray-100">
                        <span className="block truncate" title={pago.concepto}>
                          {pago.concepto}
                        </span>
                        {pago.cuota ? (
                          <span className="block truncate text-[13px] text-neutral-400 dark:text-neutral-500">cuota {pago.cuota}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right text-[15px] tabular-nums text-neutral-900 dark:text-gray-100">
                        {formatMoneyCentavos(pago.montoCentavos, pago.moneda)}
                      </td>
                      <td className="px-3 py-2">
                        <ComoSePago pago={pago} />
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          className="whitespace-nowrap rounded border border-neutral-300 px-2 py-1 text-[13px] font-medium text-neutral-700 dark:border-zinc-600 dark:text-gray-100"
                          onClick={() => setHistorialId(pago.compromisoId)}
                        >
                          Historial
                        </button>
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>

          <div className="md:hidden">
            {grupos.map((grupo) => (
              <div
                key={grupo.compromisoId}
                className={grupo.pagos.length > 1 ? 'border-l-2 border-l-[var(--color-primary)]' : undefined}
              >
                {grupo.pagos.map((pago, indice) => (
                  <article key={`${pago.compromisoId}-${pago.fecha}-${indice}`} className="border-b border-neutral-200 px-3 py-3 dark:border-zinc-800">
                    <p className="text-[15px] font-medium text-neutral-900 dark:text-gray-100">{pago.proveedorONombre}</p>
                    <p className="text-[15px] text-neutral-900 dark:text-gray-100">
                      {pago.concepto}
                      {pago.cuota ? <span className="ml-1 text-[13px] text-neutral-400 dark:text-neutral-500">cuota {pago.cuota}</span> : null}
                    </p>
                    <p className="mt-1 text-[13px] tabular-nums text-neutral-600 dark:text-neutral-300">{fechaVisible(pago.fecha)}</p>
                    <p className="text-[15px] font-medium tabular-nums text-neutral-900 dark:text-gray-100">
                      {formatMoneyCentavos(pago.montoCentavos, pago.moneda)}
                    </p>
                    <div className="mt-1">
                      <ComoSePago pago={pago} />
                    </div>
                    {indice === 0 ? (
                      <button
                        type="button"
                        className="mt-2 rounded border border-neutral-300 px-2 py-1 text-[13px] font-medium dark:border-zinc-600"
                        onClick={() => setHistorialId(pago.compromisoId)}
                      >
                        Historial
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {historialId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Cerrar" onClick={() => setHistorialId(null)} />
          <div className="relative max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900">
            <h3 className="text-heading font-semibold">Historial</h3>
            <ol className="mt-4 space-y-2 text-sm">
              {(historial.data ?? []).map((ev, i) => (
                <li key={i} className="rounded border border-neutral-200 px-3 py-2 dark:border-zinc-800">
                  <p className="font-medium">
                    {ev.estadoAnterior ?? 'Alta'} → {ev.estadoNuevo}
                  </p>
                  <p className="text-body-muted text-xs">{ev.fecha ? new Date(ev.fecha).toLocaleDateString('es-AR') : ''}</p>
                  {ev.nota ? <p className="mt-1">{ev.nota}</p> : null}
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function ComoSePago({ pago }: { pago: PagoHechoItem }) {
  if (!pago.link) {
    return <span className="text-[13px] text-neutral-800 dark:text-gray-100">{pago.comoSePago}</span>
  }
  return (
    <Link to={pago.link} className="text-[13px] font-medium text-[var(--color-primary)] underline-offset-2 hover:underline">
      {pago.comoSePago}
    </Link>
  )
}
