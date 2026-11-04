import { useId } from 'react'
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

/** Tramo de curva suave (Bezier) entre cada par de puntos consecutivos: da el efecto "en S". No incluye el M inicial. */
function segmentosCurva(puntos: Array<{ x: number; y: number }>): string {
  let d = ''
  for (let i = 0; i < puntos.length - 1; i++) {
    const p0 = puntos[i]
    const p1 = puntos[i + 1]
    const mx = (p0.x + p1.x) / 2
    d += ` C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`
  }
  return d
}

function pathLinea(puntos: Array<{ x: number; y: number }>): string {
  if (puntos.length === 0) return ''
  return `M ${puntos[0].x} ${puntos[0].y}${segmentosCurva(puntos)}`
}

function pathArea(puntos: Array<{ x: number; y: number }>, baseY: number): string {
  if (puntos.length === 0) return ''
  const primero = puntos[0]
  const ultimo = puntos[puntos.length - 1]
  return `M ${primero.x} ${baseY} L ${primero.x} ${primero.y}${segmentosCurva(puntos)} L ${ultimo.x} ${baseY} Z`
}

/** Banda apilada: curva superior suave + curva inferior suave (el límite con la banda de abajo), cerrada. */
function pathBanda(puntosArriba: Array<{ x: number; y: number }>, puntosAbajoInvertidos: Array<{ x: number; y: number }>): string {
  if (puntosArriba.length === 0) return ''
  const primero = puntosArriba[0]
  const inicioAbajo = puntosAbajoInvertidos[0]
  return `M ${primero.x} ${primero.y}${segmentosCurva(puntosArriba)} L ${inicioAbajo.x} ${inicioAbajo.y}${segmentosCurva(puntosAbajoInvertidos)} Z`
}

/** Mix mensual por unidad de negocio: áreas apiladas con curvas suaves ("en S"), no barras. */
export function MixMensualPorUnegocio({
  datos,
}: {
  datos: Array<{ mes: string; porUnegocio: Array<{ idUnegocio: number | null; nombre: string; centavos: number }> }>
}) {
  const ancho = 720
  const alto = 240
  const izq = 4
  const der = 4
  const arriba = 20
  const abajo = 26
  const anchoUtil = ancho - izq - der
  const altoUtil = alto - arriba - abajo
  const n = datos.length
  const paso = n > 1 ? anchoUtil / (n - 1) : 0
  const xDe = (i: number) => izq + (n > 1 ? i * paso : anchoUtil / 2)
  const totales = datos.map((d) => d.porUnegocio.reduce((acc, u) => acc + u.centavos, 0))
  const maximo = Math.max(1, ...totales)
  const yDe = (v: number) => arriba + altoUtil * (1 - v / maximo)

  const nombresPorId = new Map<string, { idUnegocio: number | null; nombre: string; orden: number }>()
  datos.forEach((d) => {
    d.porUnegocio.forEach((u) => {
      const clave = u.idUnegocio !== null ? String(u.idUnegocio) : 'sin-unegocio'
      if (!nombresPorId.has(clave)) nombresPorId.set(clave, { idUnegocio: u.idUnegocio, nombre: u.nombre, orden: nombresPorId.size })
    })
  })
  const unidades = [...nombresPorId.values()]

  let acumulado = datos.map(() => 0)
  const bandas = unidades.map((u) => {
    const clave = u.idUnegocio !== null ? String(u.idUnegocio) : 'sin-unegocio'
    const inferior = acumulado
    const superior = datos.map((d, i) => {
      const valor = d.porUnegocio.find((x) => (x.idUnegocio !== null ? String(x.idUnegocio) : 'sin-unegocio') === clave)?.centavos ?? 0
      return inferior[i] + valor
    })
    acumulado = superior
    return { clave, unidad: u, inferior, superior }
  })

  return (
    <div className="min-w-0">
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="block h-auto w-full" role="img" aria-label="Mix mensual por unidad de negocio">
        {bandas.map((banda) => {
          const puntosArriba = banda.superior.map((v, i) => ({ x: xDe(i), y: yDe(v) }))
          const puntosAbajoInvertidos = [...banda.inferior.map((v, i) => ({ x: xDe(i), y: yDe(v) }))].reverse()
          const color = colorUnegocio(banda.unidad.idUnegocio, banda.unidad.orden)
          return <path key={banda.clave} d={pathBanda(puntosArriba, puntosAbajoInvertidos)} fill={color} fillOpacity={0.82} />
        })}
        {datos.map((d, i) => {
          const total = totales[i]
          if (total <= 0) return null
          return (
            <text key={`total-${d.mes}`} x={xDe(i)} y={Math.max(12, yDe(total) - 6)} textAnchor="middle" className="fill-neutral-700 text-[10px] font-medium dark:fill-gray-300">
              {plataCorta(total)}
            </text>
          )
        })}
        {datos.map((d, i) => (
          <text key={`mes-${d.mes}`} x={xDe(i)} y={alto - 8} textAnchor="middle" className="fill-neutral-500 text-[11px] dark:fill-gray-500">
            {mesCorto(d.mes)}
          </text>
        ))}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {unidades.map((u) => (
          <li key={u.idUnegocio ?? 'sin-unegocio'} className="flex items-center gap-1.5 text-[12px] text-neutral-700 dark:text-gray-300">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorUnegocio(u.idUnegocio, u.orden) }} />
            {u.nombre}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Evolución mensual: curva suave ("en S") con área debajo, en vez de barras. */
export function EvolucionMensual({ datos, moneda }: { datos: Array<{ mes: string; totalCentavos: number }>; moneda: 'ARS' | 'USD' }) {
  const idBase = useId().replace(/[^a-zA-Z0-9]/g, '')
  const ancho = 720
  const alto = 200
  const izq = 4
  const der = 4
  const arriba = 26
  const abajo = 26
  const anchoUtil = ancho - izq - der
  const altoUtil = alto - arriba - abajo
  const n = datos.length
  const paso = n > 1 ? anchoUtil / (n - 1) : 0
  const maximo = Math.max(1, ...datos.map((d) => d.totalCentavos))
  const xDe = (i: number) => izq + (n > 1 ? i * paso : anchoUtil / 2)
  const yDe = (v: number) => arriba + altoUtil * (1 - v / maximo)
  const puntos = datos.map((d, i) => ({ x: xDe(i), y: yDe(d.totalCentavos) }))
  const baseY = arriba + altoUtil
  const mesActual = datos[datos.length - 1]?.mes

  return (
    <div className="min-w-0">
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="block h-auto w-full" role="img" aria-label="Evolución mensual">
        <defs>
          <linearGradient id={`grad-evo-${idBase}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={AZUL_SECUENCIAL} stopOpacity="0.35" />
            <stop offset="100%" stopColor={AZUL_SECUENCIAL} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={pathArea(puntos, baseY)} fill={`url(#grad-evo-${idBase})`} />
        <path d={pathLinea(puntos)} fill="none" stroke={AZUL_SECUENCIAL} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {datos.map((d, i) => {
          const esActual = d.mes === mesActual
          const p = puntos[i]
          return (
            <g key={d.mes}>
              <circle cx={p.x} cy={p.y} r={esActual ? 4.5 : 3} fill={esActual ? AZUL_SECUENCIAL : 'white'} stroke={AZUL_SECUENCIAL} strokeWidth={esActual ? 0 : 2} />
              {d.totalCentavos > 0 ? (
                <text
                  x={p.x}
                  y={Math.max(10, p.y - 10)}
                  textAnchor="middle"
                  className={`text-[10.5px] ${esActual ? 'fill-neutral-900 font-semibold dark:fill-gray-100' : 'fill-neutral-600 dark:fill-gray-400'}`}
                >
                  {plataCorta(d.totalCentavos)}
                </text>
              ) : null}
              <text x={p.x} y={alto - 8} textAnchor="middle" className={`text-[11px] ${esActual ? 'fill-neutral-900 font-semibold dark:fill-gray-100' : 'fill-neutral-500 dark:fill-gray-500'}`}>
                {mesCorto(d.mes)}
              </text>
            </g>
          )
        })}
      </svg>
      <span className="sr-only">Moneda: {moneda}</span>
    </div>
  )
}
