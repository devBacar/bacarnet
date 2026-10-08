import { mesCorto, plata } from './formatoTablero'
import type { MonedaTablero } from '../../services/finanzasTableroApi'

/** Barras pareadas. Si no entran en el ancho, se deslizan adentro de la tarjeta, no la página. */
export function GraficoEntradasSalidas({
  meses,
  moneda,
}: {
  meses: Array<{ mes: string; entradasCentavos: number; salidasCentavos: number }>
  moneda: MonedaTablero
}) {
  if (meses.length === 0) {
    return <p className="text-[14px] text-neutral-700 dark:text-gray-300">En estos meses no hay movimientos para mostrar.</p>
  }

  const max = Math.max(1, ...meses.flatMap((mes) => [mes.entradasCentavos, mes.salidasCentavos]))
  const alto = 220
  const paso = 64
  const ancho = meses.length * paso + 8
  const arriba = 12
  const abajo = 36
  const usable = alto - arriba - abajo
  const base = alto - abajo

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
      <div className="max-w-full overflow-x-auto">
        <svg width={ancho} height={alto} role="img" aria-label="Entradas y salidas por mes" className="block">
          {meses.map((mes, i) => {
            const x = 8 + i * paso
            const hEntro = (usable * mes.entradasCentavos) / max
            const hSalio = (usable * mes.salidasCentavos) / max
            const anio = i === 0 || mes.mes.slice(0, 4) !== meses[i - 1]?.mes.slice(0, 4)
            return (
              <g key={mes.mes}>
                <rect x={x + 8} y={base - hEntro} width={16} height={Math.max(hEntro, mes.entradasCentavos > 0 ? 1 : 0)} fill="#0f766e">
                  <title>{`Entró ${plata(mes.entradasCentavos, moneda)}`}</title>
                </rect>
                <rect x={x + 28} y={base - hSalio} width={16} height={Math.max(hSalio, mes.salidasCentavos > 0 ? 1 : 0)} fill="#b45309">
                  <title>{`Salió ${plata(mes.salidasCentavos, moneda)}`}</title>
                </rect>
                <text x={x + 26} y={base + 16} textAnchor="middle" className="fill-neutral-700 text-[12px] dark:fill-gray-300">
                  {mesCorto(mes.mes)}
                </text>
                {anio ? (
                  <text x={x + 26} y={base + 30} textAnchor="middle" className="fill-neutral-500 text-[10px] dark:fill-gray-400">
                    {mes.mes.slice(0, 4)}
                  </text>
                ) : null}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
