export interface Serie {
  nombre: string
  color: string
  valores: number[]
}

/** Barras apiladas o agrupadas en SVG, con totales arriba y los períodos estimados rayados. */
export function GraficoBarras({
  etiquetas,
  subetiquetas,
  estimados,
  series,
  formato,
  apilado,
}: {
  etiquetas: string[]
  subetiquetas: string[]
  estimados: boolean[]
  series: Serie[]
  formato: (v: number) => string
  apilado: boolean
}) {
  const n = etiquetas.length
  // Entra en una pantalla común (≈1.100 px) hasta 28 períodos; con más, se desliza.
  const paso = Math.max(30, Math.min(120, 1000 / Math.max(1, n)))
  const compacto = paso < 60
  const ancho = Math.max(640, n * paso + 70)
  const alto = 320
  const arriba = 28
  const abajo = 48
  const izq = 60
  const totales = etiquetas.map((_, i) =>
    apilado ? series.reduce((s, se) => s + (se.valores[i] ?? 0), 0) : Math.max(...series.map((se) => se.valores[i] ?? 0)),
  )
  // Escala con números redondos (1, 2, 2,5 o 5 × 10ⁿ).
  const bruto = Math.max(1, ...totales) * 1.1
  const potencia = 10 ** Math.floor(Math.log10(bruto / 4))
  const pasoEje = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => bruto / p <= 5) ?? 10 * potencia
  const max = Math.ceil(bruto / pasoEje) * pasoEje
  const y = (v: number) => arriba + (alto - arriba - abajo) * (1 - v / max)
  const ticks = Array.from({ length: Math.round(max / pasoEje) + 1 }, (_, i) => i * pasoEje)
  const anchoBarra = paso * 0.62
  const visibles = series.filter((s) => s.valores.some((v) => v > 0))

  return (
    <div className="grid gap-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-neutral-700 dark:text-gray-300">
        {visibles.map((s) => (
          <li key={s.nombre} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
            {s.nombre}
          </li>
        ))}
        {estimados.some(Boolean) ? (
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-neutral-400 bg-[repeating-linear-gradient(45deg,#cbd5e1_0_2px,transparent_2px_5px)]" aria-hidden />
            Estimado
          </li>
        ) : null}
      </ul>
      <div className="max-w-full overflow-x-auto">
        <svg viewBox={`0 0 ${ancho} ${alto}`} width={ancho} height={alto} role="img" aria-label="Gráfico de evolución" className="block">
          <defs>
            <pattern id="evo-rayado" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="white" fillOpacity="0" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="white" strokeWidth="2.5" strokeOpacity="0.7" />
            </pattern>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={izq} x2={ancho - 8} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-neutral-200 dark:text-zinc-700" />
              <text x={izq - 6} y={y(t) + 4} textAnchor="end" className="fill-neutral-500 text-[11px] dark:fill-gray-400">
                {formato(t).replace(' h', '').replace(' días', '')}
              </text>
            </g>
          ))}
          {etiquetas.map((et, i) => {
            const cx = izq + paso * i + paso / 2
            let acumulado = 0
            return (
              <g key={et} opacity={estimados[i] ? 0.6 : 1}>
                {visibles.map((s, j) => {
                  const v = s.valores[i] ?? 0
                  if (v <= 0) return null
                  if (apilado) {
                    const y0 = y(acumulado)
                    acumulado += v
                    const y1 = y(acumulado)
                    return (
                      <g key={s.nombre}>
                        <rect x={cx - anchoBarra / 2} y={y1} width={anchoBarra} height={Math.max(0, y0 - y1)} fill={s.color}>
                          <title>{`${et} · ${s.nombre}: ${formato(v)}`}</title>
                        </rect>
                        {estimados[i] ? <rect x={cx - anchoBarra / 2} y={y1} width={anchoBarra} height={Math.max(0, y0 - y1)} fill="url(#evo-rayado)" /> : null}
                      </g>
                    )
                  }
                  const w = anchoBarra / visibles.length
                  return (
                    <rect key={s.nombre} x={cx - anchoBarra / 2 + j * w} y={y(v)} width={w - 1} height={y(0) - y(v)} fill={s.color}>
                      <title>{`${et} · ${s.nombre}: ${formato(v)}`}</title>
                    </rect>
                  )
                })}
                {apilado && totales[i] > 0 ? (
                  <text
                    x={cx}
                    y={y(totales[i]) - 6}
                    textAnchor="middle"
                    className={`fill-neutral-800 font-semibold dark:fill-gray-200 ${compacto ? 'text-[9.5px]' : 'text-[11.5px]'}`}
                  >
                    {compacto ? formato(totales[i]).replace(' h', '').replace(' días', '') : formato(totales[i])}
                  </text>
                ) : null}
                <text x={cx} y={alto - abajo + 18} textAnchor="middle" className={`fill-neutral-700 dark:fill-gray-300 ${compacto ? 'text-[10.5px]' : 'text-[12px]'}`}>
                  {et}
                </text>
                {subetiquetas[i] ? (
                  <text x={cx} y={alto - abajo + 33} textAnchor="middle" className="fill-neutral-500 text-[10.5px] dark:fill-gray-400">
                    {compacto && subetiquetas[i] === 'estimado' ? 'est.' : subetiquetas[i]}
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

export function Segmentado<T extends string>({ opciones, valor, onChange, etiqueta }: { opciones: { id: T; nombre: string }[]; valor: T; onChange: (v: T) => void; etiqueta: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-[12.5px] font-semibold text-neutral-600 dark:text-gray-400">{etiqueta}</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={etiqueta}>
        {opciones.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={o.id === valor}
            onClick={() => onChange(o.id)}
            className={`rounded-full border px-3.5 py-1.5 text-[14px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
              o.id === valor
                ? 'border-transparent bg-brand-primary text-white'
                : 'border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-200 dark:hover:bg-zinc-800'
            }`}
          >
            {o.nombre}
          </button>
        ))}
      </div>
    </div>
  )
}
