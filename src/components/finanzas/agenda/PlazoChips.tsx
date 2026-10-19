import { formatMoneyCentavos } from '../formatMoney'
import { enPlazo, PLAZOS, type PlazoAgenda } from './plazoAgenda'

/** Botones de plazo con cantidad y total en pesos de cada uno. */
export function PlazoChips<T>({
  rows,
  fecha,
  moneda,
  plazo,
  onChange,
  hoy,
}: {
  rows: T[]
  fecha: (row: T) => string | null | undefined
  moneda: (row: T) => 'ARS' | 'USD'
  plazo: PlazoAgenda
  onChange: (p: PlazoAgenda) => void
  hoy: string
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Plazo">
      {PLAZOS.map((p) => {
        const filas = rows.filter((r) => enPlazo(fecha(r), p.id, hoy))
        const pesos = filas.filter((r) => moneda(r) === 'ARS').reduce((s, r) => s + ((r as { montoCentavos?: number }).montoCentavos ?? 0), 0)
        const activo = plazo === p.id
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={activo}
            onClick={() => onChange(p.id)}
            className={`rounded-full border-2 px-3 py-1.5 text-sm ${
              activo
                ? 'border-blue-600 bg-blue-50 font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-100'
                : p.id === 'atrasados' && filas.length > 0
                  ? 'border-red-300 bg-white text-red-900 dark:bg-zinc-900 dark:text-red-200'
                  : 'border-neutral-300 bg-white text-neutral-800 dark:border-neutral-600 dark:bg-zinc-900 dark:text-neutral-100'
            }`}
          >
            {p.label} · {filas.length} · {formatMoneyCentavos(pesos, 'ARS')}
          </button>
        )
      })}
    </div>
  )
}
