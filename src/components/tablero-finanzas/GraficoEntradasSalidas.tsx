import { useState } from 'react'
import type { MonedaTablero } from '../../services/finanzasTableroApi'
import { mesCorto, mesLargo, plata, plataCorta } from './formatoTablero'

const ALTO = 160

/** Barras pareadas que ocupan todo el ancho. Con pocos meses se lee el monto arriba; si no, al tocar. */
export function GraficoEntradasSalidas({
  meses,
  moneda,
}: {
  meses: Array<{ mes: string; entradasCentavos: number; salidasCentavos: number }>
  moneda: MonedaTablero
}) {
  const [activo, setActivo] = useState<string | null>(null)
  if (meses.length === 0) {
    return <p className="text-[14px] text-neutral-700 dark:text-gray-300">En estos meses no hay movimientos para mostrar.</p>
  }

  const elegidoId = activo && meses.some((mes) => mes.mes === activo) ? activo : meses[meses.length - 1].mes
  const elegido = meses.find((mes) => mes.mes === elegidoId) ?? meses[meses.length - 1]
  const max = Math.max(1, ...meses.flatMap((mes) => [mes.entradasCentavos, mes.salidasCentavos]))
  const mostrarArriba = meses.length <= 6

  return (
    <div className="grid min-w-0 gap-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-neutral-700 dark:text-gray-300">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-teal-700" aria-hidden />
          Entró
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-amber-700" aria-hidden />
          Salió
        </li>
      </ul>
      <div
        className="grid w-full min-w-0 items-end gap-px"
        style={{ gridTemplateColumns: `repeat(${meses.length}, minmax(0, 1fr))` }}
      >
        {meses.map((mes) => {
          const hEntro = Math.round((ALTO * mes.entradasCentavos) / max)
          const hSalio = Math.round((ALTO * mes.salidasCentavos) / max)
          const esta = mes.mes === elegido.mes
          return (
            <button
              key={mes.mes}
              type="button"
              aria-pressed={esta}
              aria-label={`${mesLargo(mes.mes)}: entró ${plata(mes.entradasCentavos, moneda)}, salió ${plata(mes.salidasCentavos, moneda)}`}
              onClick={() => setActivo(mes.mes)}
              className={`grid min-w-0 justify-items-stretch gap-1 rounded-md px-px py-1 ${esta ? 'bg-neutral-100 dark:bg-zinc-800' : ''}`}
            >
              {mostrarArriba ? (
                <span className="grid min-w-0 gap-0.5 text-center text-[10px] leading-tight sm:text-[11px]">
                  <span className="truncate text-teal-800 dark:text-teal-300">{plataCorta(mes.entradasCentavos)}</span>
                  <span className="truncate text-amber-800 dark:text-amber-300">{plataCorta(mes.salidasCentavos)}</span>
                </span>
              ) : null}
              <span className="flex h-40 w-full items-end gap-0.5">
                <span
                  className="min-w-0 flex-1 rounded-t-sm bg-teal-700"
                  style={{ height: `${Math.max(hEntro, mes.entradasCentavos > 0 ? 2 : 0)}px` }}
                />
                <span
                  className="min-w-0 flex-1 rounded-t-sm bg-amber-700"
                  style={{ height: `${Math.max(hSalio, mes.salidasCentavos > 0 ? 2 : 0)}px` }}
                />
              </span>
              <span className="block h-8 truncate text-center text-[10px] leading-tight text-neutral-700 sm:text-[12px] dark:text-gray-300">
                {mesCorto(mes.mes)}
                <span className="block text-[9px] text-neutral-500 dark:text-gray-400">{mes.mes.slice(0, 4)}</span>
              </span>
            </button>
          )
        })}
      </div>
      <p className="text-[14px] text-neutral-800 dark:text-gray-200">
        {mesLargo(elegido.mes)}: entró <strong className="tabular-nums">{plata(elegido.entradasCentavos, moneda)}</strong> y salió{' '}
        <strong className="tabular-nums">{plata(elegido.salidasCentavos, moneda)}</strong>.
      </p>
    </div>
  )
}
