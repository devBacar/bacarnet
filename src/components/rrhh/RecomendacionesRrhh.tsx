import { useMemo, useState } from 'react'
import type { CategoriaRrhh, RecomendacionRrhh } from '../../services/rrhhApi'
import { mesLargo, pesosCorto } from './formatoRrhh'
import { PildoraSeveridad } from './PildoraSeveridad'
import { BORDE_SEVERIDAD } from './severidad'

type Filtro = 'todas' | CategoriaRrhh

/** Recomendaciones con pestañas por categoría, ordenadas por severidad e impacto (viene ordenado del backend). */
export function RecomendacionesRrhh({ recomendaciones }: { recomendaciones: RecomendacionRrhh[] }) {
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const categorias = useMemo(
    () => [...new Set(recomendaciones.map((r) => r.categoria))],
    [recomendaciones],
  )
  const activo: Filtro = filtro !== 'todas' && !categorias.includes(filtro) ? 'todas' : filtro
  const visibles = activo === 'todas' ? recomendaciones : recomendaciones.filter((r) => r.categoria === activo)

  if (recomendaciones.length === 0) {
    return <p className="text-body-muted text-[13px]">Sin recomendaciones para esta selección.</p>
  }

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por categoría">
        {(['todas', ...categorias] as Filtro[]).map((c) => {
          const n = c === 'todas' ? recomendaciones.length : recomendaciones.filter((r) => r.categoria === c).length
          const elegido = c === activo
          return (
            <button
              key={c}
              type="button"
              aria-pressed={elegido}
              onClick={() => setFiltro(c)}
              className={`rounded-full border px-3 py-1 text-[12.5px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
                elegido
                  ? 'border-transparent bg-brand-primary text-white'
                  : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-300 dark:hover:bg-zinc-800'
              }`}
            >
              {c === 'todas' ? 'Todas' : c} ({n})
            </button>
          )
        })}
      </div>
      <ul className="grid gap-2.5">
        {visibles.map((r) => (
          <li
            key={r.id}
            className={`grid gap-x-4 gap-y-1 rounded-md border border-l-4 border-neutral-200 p-3 dark:border-zinc-700 sm:grid-cols-[auto_1fr_auto] ${BORDE_SEVERIDAD[r.severidad]}`}
          >
            <div className="flex items-center gap-2 sm:row-span-2 sm:flex-col sm:items-start">
              <PildoraSeveridad severidad={r.severidad} />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-gray-400">{r.categoria}</span>
            </div>
            <p className="min-w-0 text-[14px] leading-snug text-neutral-800 dark:text-gray-200">
              <strong className="font-semibold text-neutral-900 dark:text-gray-100">{r.titulo}</strong> {r.detalle}
            </p>
            {r.impacto && r.impacto.monto > 0 ? (
              <p className="text-right text-[14px] font-semibold tabular-nums text-neutral-900 dark:text-gray-100 sm:row-span-2">
                {pesosCorto(r.impacto.monto)}
                <span className="block text-[11px] font-normal text-neutral-500 dark:text-gray-400">{r.impacto.etiqueta}</span>
              </p>
            ) : (
              <span className="hidden sm:row-span-2 sm:block" />
            )}
            <p className="text-[12px] text-neutral-500 dark:text-gray-400 sm:col-start-2">
              {r.area} · {mesLargo(r.mes)} · Norma: {r.regla}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
