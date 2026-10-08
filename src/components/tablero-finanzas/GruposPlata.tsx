import { useState } from 'react'
import type { GrupoMonto, MonedaTablero } from '../../services/finanzasTableroApi'
import { plata, textoMovimientos, textoPct } from './formatoTablero'

function Barra({ porcentaje, gris }: { porcentaje: number | null; gris?: boolean }) {
  const ancho = Math.max(0, Math.min(100, porcentaje ?? 0))
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-zinc-800">
      <div className={`h-full rounded-full ${gris ? 'bg-neutral-400' : 'bg-[#1f3b63]'}`} style={{ width: `${ancho}%` }} />
    </div>
  )
}

export function GruposPlata({
  grupos,
  moneda,
  vacio,
}: {
  grupos: GrupoMonto[]
  moneda: MonedaTablero
  vacio: string
}) {
  const [abierto, setAbierto] = useState<string | null>(null)
  if (grupos.length === 0) return <p className="text-[14px] text-neutral-700 dark:text-gray-300">{vacio}</p>
  const haySinClasificar = grupos.some((grupo) => grupo.faltaClasificar)
  return (
    <div className="grid gap-2">
      <ul className="grid gap-2">
        {grupos.map((grupo) => {
          const abiertoEste = abierto === grupo.grupo
          const tono = grupo.faltaClasificar ? 'text-neutral-500 dark:text-gray-400' : 'text-neutral-900 dark:text-gray-100'
          return (
            <li key={grupo.grupo} className="min-w-0">
              <button
                type="button"
                aria-expanded={abiertoEste}
                onClick={() => setAbierto(abiertoEste ? null : grupo.grupo)}
                className="grid w-full min-w-0 gap-1.5 rounded-lg px-1 py-1.5 text-left hover:bg-neutral-50 dark:hover:bg-zinc-800"
              >
                <span className="flex min-w-0 items-baseline justify-between gap-3">
                  <span className={`min-w-0 truncate text-[15px] font-medium ${tono}`}>{grupo.grupo}</span>
                  <span className={`shrink-0 text-[14px] tabular-nums ${tono}`}>
                    {plata(grupo.centavos, moneda)}
                    {grupo.porcentaje != null ? <span className="text-neutral-500"> · {textoPct(grupo.porcentaje)}</span> : null}
                  </span>
                </span>
                <Barra porcentaje={grupo.porcentaje} gris={grupo.faltaClasificar} />
              </button>
              {abiertoEste ? (
                <ul className="mt-1 grid gap-2 border-l-2 border-neutral-200 py-1 pl-3 dark:border-zinc-700">
                  {grupo.categorias.map((categoria) => (
                    <li key={categoria.nombre} className="min-w-0">
                      <span className="flex min-w-0 items-baseline justify-between gap-3 text-[14px]">
                        <span className={`min-w-0 truncate ${grupo.faltaClasificar ? 'text-neutral-500 dark:text-gray-400' : 'text-neutral-800 dark:text-gray-200'}`}>
                          {categoria.nombre}
                        </span>
                        <span className="shrink-0 text-right tabular-nums text-neutral-700 dark:text-gray-300">
                          {plata(categoria.centavos, moneda)}
                          <span className="text-neutral-500"> · {textoMovimientos(categoria.cantidad)}</span>
                          {categoria.porcentaje != null ? ` · ${textoPct(categoria.porcentaje)}` : ''}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>
      {haySinClasificar ? (
        <p className="text-[13px] text-neutral-500 dark:text-gray-400">Falta clasificar: se corrige desde Movimientos.</p>
      ) : null}
    </div>
  )
}
