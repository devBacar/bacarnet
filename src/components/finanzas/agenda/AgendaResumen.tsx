import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, CalendarClock, CalendarDays, Scale } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatMoneyCentavos } from '../formatMoney'
import {
  PLAZOS,
  PLAZOS_PRINCIPALES,
  totalesEnPlazo,
  type PlazoAgenda,
  type TotalesPlazo,
} from './plazoAgenda'

/** Cómo leer fecha, moneda e importe de una fila de la Agenda. */
export interface CamposAgenda<T> {
  fecha: (row: T) => string | null | undefined
  sinFecha?: (row: T) => boolean
  moneda: (row: T) => 'ARS' | 'USD'
  monto: (row: T) => number
}

const ESTILO_PLAZO: Record<
  'atrasados' | 'hoy' | 'proximos',
  { icono: ReactNode; activo: string; inactivo: string; numero: string }
> = {
  atrasados: {
    icono: <AlertTriangle className="h-5 w-5" aria-hidden />,
    activo: 'border-red-600 bg-red-50 ring-2 ring-red-600/30 dark:bg-red-950/60',
    inactivo: 'border-red-200 bg-white hover:border-red-400 dark:border-red-900 dark:bg-zinc-900',
    numero: 'text-red-700 dark:text-red-300',
  },
  hoy: {
    icono: <CalendarClock className="h-5 w-5" aria-hidden />,
    activo: 'border-amber-500 bg-amber-50 ring-2 ring-amber-500/30 dark:bg-amber-950/50',
    inactivo: 'border-amber-200 bg-white hover:border-amber-400 dark:border-amber-900 dark:bg-zinc-900',
    numero: 'text-amber-700 dark:text-amber-300',
  },
  proximos: {
    icono: <CalendarDays className="h-5 w-5" aria-hidden />,
    activo: 'border-blue-600 bg-blue-50 ring-2 ring-blue-600/30 dark:bg-blue-950/60',
    inactivo: 'border-blue-200 bg-white hover:border-blue-400 dark:border-blue-900 dark:bg-zinc-900',
    numero: 'text-blue-700 dark:text-blue-300',
  },
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`
}

function Importes({ tot, conUsd }: { tot: TotalesPlazo; conUsd: boolean }) {
  return (
    <>
      <span className="block tabular-nums">{formatMoneyCentavos(tot.ARS, 'ARS')}</span>
      {conUsd ? <span className="block tabular-nums">{formatMoneyCentavos(tot.USD, 'USD')}</span> : null}
    </>
  )
}

/**
 * Filtro de plazo y KPIs de la Agenda: lo mismo filtra los compromisos (egresos)
 * y los cobros esperados (ingresos), y muestra cuánto sale, cuánto entra y el neto.
 */
export function AgendaResumen<E, I>({
  egresos,
  camposEgreso,
  ingresos,
  camposIngreso,
  plazo,
  onChange,
  hoy,
}: {
  egresos: E[]
  camposEgreso: CamposAgenda<E>
  ingresos: I[]
  camposIngreso: CamposAgenda<I>
  plazo: PlazoAgenda
  onChange: (p: PlazoAgenda) => void
  hoy: string
}) {
  const totales = (p: PlazoAgenda) => ({
    egresos: totalesEnPlazo(egresos, camposEgreso, p, hoy),
    ingresos: totalesEnPlazo(ingresos, camposIngreso, p, hoy),
  })
  const actual = totales(plazo)
  const conUsd =
    egresos.some((r) => camposEgreso.moneda(r) === 'USD') || ingresos.some((r) => camposIngreso.moneda(r) === 'USD')
  const neto: TotalesPlazo = {
    cantidad: actual.ingresos.cantidad + actual.egresos.cantidad,
    ARS: actual.ingresos.ARS - actual.egresos.ARS,
    USD: actual.ingresos.USD - actual.egresos.USD,
  }
  const etiquetaPlazo = PLAZOS.find((p) => p.id === plazo)?.label ?? ''
  const secundarios = PLAZOS.filter((p) => !PLAZOS_PRINCIPALES.includes(p.id))

  return (
    <section data-tour="agenda-resumen" aria-label="Plazo y totales" className="mb-4 space-y-3">
      <div className="grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Plazo">
        {PLAZOS_PRINCIPALES.map((id) => {
          const estilo = ESTILO_PLAZO[id as keyof typeof ESTILO_PLAZO]
          const t = totales(id)
          const activo = plazo === id
          const cantidad = t.egresos.cantidad + t.ingresos.cantidad
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activo}
              title="Compromisos y cobros en este plazo"
              onClick={() => onChange(id)}
              className={`rounded-2xl border-2 p-3 text-left transition ${activo ? estilo.activo : estilo.inactivo}`}
            >
              <span className={`flex items-center gap-2 text-sm font-semibold ${estilo.numero}`}>
                {estilo.icono}
                {PLAZOS.find((p) => p.id === id)?.label}
                <span className="ml-auto text-2xl font-bold tabular-nums">{cantidad}</span>
              </span>
              <span className="text-body-muted mt-1 flex justify-between gap-2 text-xs">
                <span>Sale {formatMoneyCentavos(t.egresos.ARS, 'ARS')}</span>
                <span>Entra {formatMoneyCentavos(t.ingresos.ARS, 'ARS')}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Otros plazos">
        {secundarios.map((p) => {
          const t = totales(p.id)
          const activo = plazo === p.id
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={activo}
              onClick={() => onChange(p.id)}
              className={`rounded-full border px-3 py-1 text-xs ${
                activo
                  ? 'border-neutral-800 bg-neutral-800 font-semibold text-white dark:border-neutral-200 dark:bg-neutral-200 dark:text-zinc-900'
                  : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500 dark:border-neutral-600 dark:bg-zinc-900 dark:text-neutral-200'
              }`}
            >
              {p.label} · {t.egresos.cantidad + t.ingresos.cantidad}
            </button>
          )
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-3" aria-live="polite">
        <Kpi
          icono={<ArrowUpCircle className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden />}
          titulo="Egresos (a pagar)"
          detalle={plural(actual.egresos.cantidad, 'compromiso', 'compromisos')}
        >
          <Importes tot={actual.egresos} conUsd={conUsd} />
        </Kpi>
        <Kpi
          icono={<ArrowDownCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />}
          titulo="Ingresos (a cobrar)"
          detalle={plural(actual.ingresos.cantidad, 'cobro', 'cobros')}
        >
          <Importes tot={actual.ingresos} conUsd={conUsd} />
        </Kpi>
        <Kpi
          icono={<Scale className="text-heading h-5 w-5" aria-hidden />}
          titulo="Neto (entra − sale)"
          detalle={etiquetaPlazo}
        >
          <span
            className={`block tabular-nums ${neto.ARS < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}
          >
            {formatMoneyCentavos(neto.ARS, 'ARS')}
          </span>
          {conUsd ? (
            <span
              className={`block tabular-nums ${neto.USD < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}
            >
              {formatMoneyCentavos(neto.USD, 'USD')}
            </span>
          ) : null}
        </Kpi>
      </div>
    </section>
  )
}

function Kpi({
  icono,
  titulo,
  detalle,
  children,
}: {
  icono: ReactNode
  titulo: string
  detalle: string
  children: ReactNode
}) {
  return (
    <div className="surface-card rounded-2xl border border-neutral-200 p-3 dark:border-zinc-800">
      <p className="text-body-muted flex items-center gap-2 text-xs font-medium">
        {icono}
        {titulo}
      </p>
      <div className="text-heading mt-1 text-lg font-bold">{children}</div>
      <p className="text-body-muted text-xs">{detalle}</p>
    </div>
  )
}
