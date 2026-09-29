import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { fetchCashflowDiario, type CashflowDesgloseItem, type FinanzasMoneda } from '../../services/finanzasApi'
import { formatMoneyCentavos } from './formatMoney'

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

function DesgloseTabla({
  titulo,
  rows,
  moneda,
  vacio,
}: {
  titulo: string
  rows: CashflowDesgloseItem[]
  moneda: FinanzasMoneda
  vacio: string
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-heading border-b border-neutral-100 px-4 py-3 text-sm font-semibold dark:border-zinc-800">
        {titulo}
      </h3>
      {rows.length === 0 ? (
        <p className="text-body-muted px-4 py-6 text-sm">{vacio}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-body-muted border-b border-neutral-100 text-left text-xs dark:border-zinc-800">
              <th className="px-4 py-2 font-medium">Categoría</th>
              <th className="px-4 py-2 text-right font-medium">Monto</th>
              <th className="px-4 py-2 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.categoriaId ?? 'sin-categoria'}
                className="border-b border-neutral-100 last:border-b-0 dark:border-zinc-800"
              >
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full border border-neutral-300 dark:border-zinc-600"
                      style={row.color ? { backgroundColor: row.color, borderColor: row.color } : undefined}
                      aria-hidden
                    />
                    {row.nombre}
                  </span>
                  {row.categoriaId == null ? (
                    <p className="text-body-muted mt-0.5 max-w-xs text-xs">
                      Estos movimientos todavía no se identificaron automáticamente — podés
                      categorizarlos en Movimientos.
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatMoneyCentavos(row.centavos, moneda)}
                </td>
                <td className="text-body-muted px-4 py-2.5 text-right tabular-nums">
                  {formatPorcentaje(row.porcentaje)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function CashflowSection() {
  const hoy = useMemo(() => hoyArgentina(), [])
  const maximo = ultimoDiaHabil(hoy)
  const minimo = sumarDias(hoy, -VENTANA_DIAS)
  const [fecha, setFecha] = useState(maximo)
  const [moneda, setMoneda] = useState<FinanzasMoneda>('ARS')

  const anterior = moverDiaHabil(fecha, -1, minimo, maximo)
  const siguiente = moverDiaHabil(fecha, 1, minimo, maximo)

  const query = useQuery({
    queryKey: ['finanzas', 'cashflow', fecha, moneda],
    queryFn: () => fetchCashflowDiario(fecha, moneda),
  })

  const data = query.data
  const saldoInicialOtroDia =
    data?.saldoInicial != null && data.saldoInicial.fechaId !== sumarDias(fecha, -1)

  return (
    <section aria-labelledby="finanzas-cashflow-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="finanzas-cashflow-heading" className="text-heading text-lg font-semibold">
            Cashflow
          </h2>
          <p className="text-body-muted mt-1 max-w-xl text-sm">
            Suma todas las cuentas de la empresa juntas. Pesos y dólares van por separado,
            nunca mezclados. El saldo inicial es con qué plata arrancó el día.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-body-muted text-xs font-medium" htmlFor="cashflow-moneda">
            Moneda
          </label>
          <select
            id="cashflow-moneda"
            value={moneda}
            onChange={(event) => setMoneda(event.target.value as FinanzasMoneda)}
            className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
          <button
            type="button"
            aria-label="Día anterior"
            disabled={!anterior}
            onClick={() => anterior && setFecha(anterior)}
            className="rounded-lg border border-neutral-200 bg-white p-1.5 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <input
            type="date"
            aria-label="Fecha del cashflow"
            value={fecha}
            min={minimo}
            max={maximo}
            onChange={(event) => {
              const next = event.target.value
              if (next && next >= minimo && next <= maximo) setFecha(next)
            }}
            className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="button"
            aria-label="Día siguiente"
            disabled={!siguiente}
            onClick={() => siguiente && setFecha(siguiente)}
            className="rounded-lg border border-neutral-200 bg-white p-1.5 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="surface-card rounded-2xl border border-neutral-200 p-6 dark:border-zinc-800">
          <div className="h-5 w-48 animate-pulse rounded bg-neutral-200 dark:bg-zinc-700" />
        </div>
      ) : query.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {query.error instanceof Error ? query.error.message : 'No se pudo calcular el cashflow'}
        </div>
      ) : data ? (
        <div className="space-y-4">
          <p className="text-heading text-sm font-semibold capitalize">{formatDay(data.fecha)}</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-body-muted text-xs">Saldo inicial</p>
              <p className="text-heading mt-1 text-base font-semibold tabular-nums">
                {data.saldoInicial
                  ? formatMoneyCentavos(data.saldoInicial.centavos, moneda)
                  : 'Sin cierre anterior'}
              </p>
              <p className="text-body-muted mt-1 text-xs">
                {data.saldoInicial
                  ? saldoInicialOtroDia
                    ? `Arranque tomado del cierre del ${formatDay(data.saldoInicial.fechaId)}.`
                    : 'Arranque tomado del cierre de ayer.'
                  : 'Todavía no hay un cierre anterior a este día.'}
              </p>
            </article>
            <article className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-body-muted text-xs">Entradas</p>
              <p className="mt-1 text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatMoneyCentavos(data.entradasCentavos, moneda)}
              </p>
              <p className="text-body-muted mt-1 text-xs">Plata que entró en el día a todas las cuentas.</p>
            </article>
            <article className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-body-muted text-xs">Salidas</p>
              <p className="mt-1 text-base font-semibold tabular-nums text-red-600 dark:text-red-400">
                {formatMoneyCentavos(data.salidasCentavos, moneda)}
              </p>
              <p className="text-body-muted mt-1 text-xs">Plata que salió en el día de todas las cuentas.</p>
            </article>
            <article className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-body-muted text-xs">Saldo final</p>
              <p className="text-heading mt-1 text-base font-semibold tabular-nums">
                {data.saldoFinal.centavos == null
                  ? '—'
                  : formatMoneyCentavos(data.saldoFinal.centavos, moneda)}
              </p>
              <p className="text-body-muted mt-1 text-xs">
                {data.saldoFinal.estado === 'cerrado'
                  ? 'Cierre de las 15hs. Esta foto ya quedó firme y no se mueve.'
                  : 'En vivo, cierre pendiente. Este número va a seguir cambiando hasta las 15hs, cuando se cierra de manera definitiva.'}
              </p>
            </article>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <DesgloseTabla
              titulo="Entradas por categoría"
              rows={data.entradas}
              moneda={moneda}
              vacio="No hubo entradas este día."
            />
            <DesgloseTabla
              titulo="Salidas por categoría"
              rows={data.salidas}
              moneda={moneda}
              vacio="No hubo salidas este día."
            />
          </div>
        </div>
      ) : null}
    </section>
  )
}
