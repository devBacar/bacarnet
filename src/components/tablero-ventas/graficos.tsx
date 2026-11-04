import { mesCorto, plataCorta } from '../tablero-finanzas/formatoTablero'

/**
 * Barras livianas en HTML (sin librería de gráficos). Paleta categórica fija del skill de
 * dataviz: el color va por entidad (idUnegocio), nunca por ranking, para que no cambie si se
 * reordena. Secuencial (un solo azul) para magnitudes sin identidad (ítems, evolución mensual).
 */
export const PALETA_CATEGORICA = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
const AZUL_SECUENCIAL = '#2a78d6'

/** Rampa secuencial azul (claro→oscuro), del skill de dataviz: para magnitud, nunca para identidad. */
const RAMPA_SECUENCIAL = ['#f0f6fd', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#1c5cab']

/** Color de fondo de una celda del mapa de calor, según qué tan grande es el valor contra el máximo de la tabla. */
export function colorCalor(valor: number, maximo: number): string {
  if (valor <= 0 || maximo <= 0) return RAMPA_SECUENCIAL[0]
  const intensidad = Math.min(valor / maximo, 1)
  const paso = Math.min(Math.floor(intensidad * RAMPA_SECUENCIAL.length), RAMPA_SECUENCIAL.length - 1)
  return RAMPA_SECUENCIAL[paso]
}

/** Paleta de estado (fija, nunca se reusa para series): good/warning/critical del skill de dataviz. */
export const COLOR_ESTADO = { good: '#0ca30c', warning: '#fab219', critical: '#d03b3b' } as const

/** Semáforo de salud de una unidad de negocio vs. el mes anterior. Nunca es solo color: siempre va con texto. */
export function estadoVariacion(variacionPorcentaje: number | null): { color: string; etiqueta: string } {
  if (variacionPorcentaje === null) return { color: '#898781', etiqueta: 'sin dato' }
  if (variacionPorcentaje <= -20) return { color: COLOR_ESTADO.critical, etiqueta: 'cayó fuerte' }
  if (variacionPorcentaje < 0) return { color: COLOR_ESTADO.warning, etiqueta: 'bajó' }
  return { color: COLOR_ESTADO.good, etiqueta: 'subió' }
}

export function colorUnegocio(idUnegocio: number | null, indiceOrden: number): string {
  // Orden estable por id (1..6) cuando existe, así el color de cada unidad no cambia entre meses.
  const indice = idUnegocio !== null && idUnegocio > 0 ? idUnegocio - 1 : indiceOrden
  return PALETA_CATEGORICA[indice % PALETA_CATEGORICA.length]
}

export function BarraHorizontal({
  etiqueta,
  valor,
  maximo,
  color,
  texto,
  onClick,
}: {
  etiqueta: string
  valor: number
  maximo: number
  color: string
  texto: string
  /** Si se pasa, toda la fila se vuelve clickeable (ej. abrir el detalle de un cliente). */
  onClick?: () => void
}) {
  const pct = maximo > 0 ? Math.max((valor / maximo) * 100, valor > 0 ? 2 : 0) : 0
  const contenido = (
    <>
      <div className="mb-1 flex min-w-0 items-baseline justify-between gap-3 text-[13px]">
        <span className={`min-w-0 truncate text-neutral-800 dark:text-gray-200 ${onClick ? 'hover:underline' : ''}`}>{etiqueta}</span>
        <span className="shrink-0 tabular-nums font-medium text-neutral-900 dark:text-gray-100">{texto}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-zinc-800">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </>
  )
  if (!onClick) return <li className="min-w-0">{contenido}</li>
  return (
    <li className="min-w-0">
      <button type="button" onClick={onClick} className="w-full min-w-0 rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]">
        {contenido}
      </button>
    </li>
  )
}

export function EvolucionMensual({ datos, moneda }: { datos: Array<{ mes: string; totalCentavos: number }>; moneda: 'ARS' | 'USD' }) {
  const maximo = Math.max(1, ...datos.map((d) => d.totalCentavos))
  const mesActual = datos[datos.length - 1]?.mes
  return (
    <div className="flex min-w-0 items-end gap-2 sm:gap-3">
      {datos.map((d) => {
        const alturaPct = Math.max((d.totalCentavos / maximo) * 100, d.totalCentavos > 0 ? 4 : 1)
        const esActual = d.mes === mesActual
        return (
          <div key={d.mes} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[11px] tabular-nums text-neutral-600 dark:text-gray-400">
              {d.totalCentavos > 0 ? plataCorta(d.totalCentavos) : ''}
            </span>
            <div className="flex h-24 w-full items-end sm:h-28">
              <div
                className="w-full rounded-t-[4px]"
                style={{
                  height: `${alturaPct}%`,
                  backgroundColor: esActual ? AZUL_SECUENCIAL : '#9ec5f4',
                }}
                title={plataCorta(d.totalCentavos)}
              />
            </div>
            <span className={`text-[11px] ${esActual ? 'font-semibold text-neutral-900 dark:text-gray-100' : 'text-neutral-500 dark:text-gray-500'}`}>
              {mesCorto(d.mes)}
            </span>
          </div>
        )
      })}
      <span className="sr-only">Moneda: {moneda}</span>
    </div>
  )
}
