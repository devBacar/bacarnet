import type { CSSProperties } from 'react'
import { M, mesCorto } from './domain/formato'

export interface SerieLinea {
  n: string
  c: string
  v: (m: string) => number | null | undefined
  dash?: boolean
}

/** Gráfico de líneas en SVG (el del prototipo). `marca` sombrea el período elegido. */
export function Lineas({
  xs,
  series,
  alto = 230,
  formato = M,
  cada = 3,
  marca = [],
}: {
  xs: string[]
  series: SerieLinea[]
  alto?: number
  formato?: (v: number) => string
  cada?: number
  marca?: string[]
}) {
  const W = 760
  const H = alto
  const pl = 64
  const pr = 12
  const pt = 12
  const pb = 28
  const vals = series.flatMap((s) => xs.map((m) => s.v(m)).filter((v): v is number => v != null && isFinite(v)))
  const max = Math.max(1, ...vals) * 1.08
  const min = Math.min(0, ...vals)
  const paso = (W - pl - pr) / Math.max(1, xs.length - 1)
  const X = (i: number): number => pl + i * paso
  const Y = (v: number): number => pt + (H - pt - pb) * (1 - (v - min) / (max - min))
  const idx = xs.map((m, i) => (marca.includes(m) ? i : -1)).filter((i) => i >= 0)

  const ticks = [0, 1, 2, 3, 4].map((t) => min + ((max - min) / 4) * t)
  const trazos = series.map((s) => {
    const seg: Array<Array<[number, number]>> = []
    let cur: Array<[number, number]> = []
    xs.forEach((m, i) => {
      const v = s.v(m)
      if (v == null || !isFinite(v)) {
        if (cur.length) seg.push(cur)
        cur = []
      } else cur.push([X(i), Y(v)])
    })
    if (cur.length) seg.push(cur)
    return { s, seg }
  })

  return (
    <>
      <div className="leyenda">
        {series.map((s) => (
          <span key={s.n} style={{ '--c': s.c } as CSSProperties}>
            {s.n}
          </span>
        ))}
        {marca.length ? <span style={{ '--c': 'var(--brand-soft)' } as CSSProperties}>período elegido</span> : null}
      </div>
      <div className="tabla-w">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Evolución mensual" style={{ minWidth: 520 }}>
          {idx.length ? (
            <rect x={X(idx[0]) - paso / 2} y={pt} width={(idx[idx.length - 1] - idx[0] + 1) * paso} height={H - pt - pb} fill="var(--brand-soft)" />
          ) : null}
          {ticks.map((v, t) => (
            <g key={t}>
              <line x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} stroke="var(--grid)" />
              <text x={pl - 6} y={Y(v) + 4} textAnchor="end">
                {formato(v).replace('US$ ', '').replace('$ ', '')}
              </text>
            </g>
          ))}
          {xs.map((m, i) =>
            i % cada === 0 ? (
              <text key={m} x={X(i)} y={H - 8} textAnchor="middle">
                {mesCorto(m)}
              </text>
            ) : null,
          )}
          {trazos.map(({ s, seg }) =>
            seg.map((p, k) =>
              p.length > 1 ? (
                <polyline
                  key={`${s.n}-${k}`}
                  points={p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
                  fill="none"
                  stroke={s.c}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeDasharray={s.dash ? '5 4' : undefined}
                />
              ) : (
                <circle key={`${s.n}-${k}`} cx={p[0][0]} cy={p[0][1]} r={3} fill={s.c} />
              ),
            ),
          )}
        </svg>
      </div>
    </>
  )
}

/** Mini gráfico de área para una tabla. */
export function Spark({ valores, color = 'var(--serie1)' }: { valores: number[]; color?: string }) {
  if (!valores.length) return null
  const W = 220
  const H = 40
  const max = Math.max(...valores, 1)
  const pts = valores.map((v, i) => [(i / Math.max(1, valores.length - 1)) * (W - 6) + 3, H - 4 - (Math.max(v, 0) / max) * (H - 10)] as const)
  const lista = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const ult = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden="true">
      <polygon points={`3,${H - 4} ${lista} ${W - 3},${H - 4}`} fill={color} opacity={0.12} />
      <polyline points={lista} fill="none" stroke={color} strokeWidth={2} />
      <circle cx={ult[0].toFixed(1)} cy={ult[1].toFixed(1)} r={3} fill={color} />
    </svg>
  )
}
