import { useState } from 'react'
import type { TipoMesRrhh } from '../../services/rrhhApi'
import { mesCorto, mesLargo, numero, pesosCorto } from './formatoRrhh'

export interface MesAgregado {
  mes: string
  tipo: TipoMesRrhh
  he50: number
  he100: number
  fer: number
  costo: number
  vacaciones: number
  licencias: number
  feriados: number
}

const SERIES = [
  { clave: 'he50', nombre: 'Extra 50%', clase: 'fill-[#2a78d6] dark:fill-[#3987e5]', muestra: 'bg-[#2a78d6] dark:bg-[#3987e5]' },
  { clave: 'he100', nombre: 'Extra 100%', clase: 'fill-[#eb6834] dark:fill-[#d95926]', muestra: 'bg-[#eb6834] dark:bg-[#d95926]' },
  { clave: 'fer', nombre: 'Feriado', clase: 'fill-[#1baf7a] dark:fill-[#199e70]', muestra: 'bg-[#1baf7a] dark:bg-[#199e70]' },
] as const

const ANCHO = 760
const ALTO = 270
const IZQ = 52
const DER = 8
const ARRIBA = 26
const ABAJO = 40

function pasoLindo(v: number): number {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

const GRUPO: Record<TipoMesRrhh, string> = { real: 'Real', actual: 'Actual', prevision: 'Previsión' }

/** Barras apiladas de horas extra: 3 meses reales, el actual y la previsión (rayados), y la tabla con el detalle. */
export function LineaTiempoRrhh({ meses }: { meses: MesAgregado[] }) {
  const [activo, setActivo] = useState<number | null>(null)
  const totales = meses.map((m) => m.he50 + m.he100 + m.fer)
  const paso = pasoLindo(Math.max(...totales, 1) / 4)
  const maximo = paso * Math.ceil((Math.max(...totales, 1) * 1.08) / paso)
  const anchoUtil = ANCHO - IZQ - DER
  const altoUtil = ALTO - ARRIBA - ABAJO
  const anchoMes = anchoUtil / meses.length
  const separacion = anchoMes * 0.32
  const y = (v: number) => ARRIBA + altoUtil - (altoUtil * v) / maximo
  const lineas: number[] = []
  for (let v = 0; v <= maximo + 1e-6; v += paso) lineas.push(v)
  const iActual = meses.findIndex((m) => m.tipo === 'actual')
  const iPrimeraPrevision = meses.findIndex((m) => m.tipo === 'prevision')
  const variacion = (i: number) => {
    if (i === 0 || !totales[i - 1]) return null
    return ((totales[i] - totales[i - 1]) / totales[i - 1]) * 100
  }

  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-neutral-600 dark:text-gray-400">
        {SERIES.map((s) => (
          <span key={s.clave} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${s.muestra}`} aria-hidden />
            {s.nombre}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm border border-neutral-400"
            style={{ background: 'repeating-linear-gradient(135deg, #a3a3a3 0 2px, transparent 2px 5px)' }}
            aria-hidden
          />
          Proyectado
        </span>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="block h-auto w-full" role="img" aria-label="Horas extra por mes, reales y proyectadas">
          <defs>
            <pattern id="rrhh-rayado" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" strokeWidth="2.2" className="stroke-white dark:stroke-zinc-900" />
            </pattern>
          </defs>
          {lineas.map((v) => (
            <g key={v}>
              <line x1={IZQ} x2={ANCHO - DER} y1={y(v)} y2={y(v)} className="stroke-neutral-100 dark:stroke-zinc-800" />
              <text x={IZQ - 6} y={y(v) + 4} textAnchor="end" className="fill-neutral-500 text-[11px] dark:fill-gray-400">
                {v >= 1000 ? `${numero(v / 1000)} k` : numero(v)}
              </text>
            </g>
          ))}
          {iActual >= 0 && (
            <rect
              x={IZQ + iActual * anchoMes}
              y={ARRIBA - 18}
              width={anchoMes}
              height={altoUtil + 18}
              className="fill-[var(--color-primary-light,#eaf2fb)] dark:fill-zinc-800/60"
            />
          )}
          {(['real', 'actual', 'prevision'] as const).map((tipo) => {
            const idx = meses.map((m, i) => (m.tipo === tipo ? i : -1)).filter((i) => i >= 0)
            if (idx.length === 0) return null
            const centro = IZQ + ((idx[0] + idx[idx.length - 1] + 1) / 2) * anchoMes
            return (
              <text
                key={tipo}
                x={centro}
                y={ARRIBA - 6}
                textAnchor="middle"
                className={`text-[11px] font-semibold uppercase ${tipo === 'actual' ? 'fill-neutral-900 dark:fill-gray-100' : 'fill-neutral-500 dark:fill-gray-400'}`}
              >
                {GRUPO[tipo]}
              </text>
            )
          })}
          {iActual > 0 && (
            <line
              x1={IZQ + iActual * anchoMes}
              x2={IZQ + iActual * anchoMes}
              y1={ARRIBA - 18}
              y2={ARRIBA + altoUtil}
              strokeDasharray="3 3"
              className="stroke-neutral-300 dark:stroke-zinc-600"
            />
          )}
          {meses.map((m, i) => {
            const x = IZQ + i * anchoMes + separacion / 2
            const ancho = anchoMes - separacion
            const proyectado = m.tipo !== 'real'
            let base = ARRIBA + altoUtil
            const segmentos = SERIES.map((s) => {
              const valor = m[s.clave]
              if (valor <= 0) return null
              const alto = (altoUtil * valor) / maximo
              const altoVisible = Math.max(0, alto - (base < ARRIBA + altoUtil ? 2 : 0))
              base -= alto
              return (
                <g key={s.clave}>
                  <rect x={x} y={base} width={ancho} height={altoVisible} rx={1.5} className={s.clase} opacity={proyectado ? 0.55 : 1} />
                  {proyectado && <rect x={x} y={base} width={ancho} height={altoVisible} fill="url(#rrhh-rayado)" />}
                </g>
              )
            })
            return (
              <g
                key={m.mes}
                onMouseEnter={() => setActivo(i)}
                onMouseLeave={() => setActivo(null)}
                onFocus={() => setActivo(i)}
                onBlur={() => setActivo(null)}
                tabIndex={0}
                className="outline-none"
              >
                {segmentos}
                <text x={x + ancho / 2} y={y(totales[i]) - 6} textAnchor="middle" className="fill-neutral-900 text-[11px] tabular-nums dark:fill-gray-100">
                  {numero(totales[i])}
                </text>
                <text
                  x={IZQ + i * anchoMes + anchoMes / 2}
                  y={ARRIBA + altoUtil + 16}
                  textAnchor="middle"
                  className={`text-[11px] ${m.tipo === 'actual' ? 'fill-neutral-900 font-bold dark:fill-gray-100' : 'fill-neutral-500 dark:fill-gray-400'}`}
                >
                  {mesCorto(m.mes)}
                </text>
                {m.feriados > 0 && (
                  <text x={IZQ + i * anchoMes + anchoMes / 2} y={ARRIBA + altoUtil + 31} textAnchor="middle" className="fill-neutral-500 text-[10px] dark:fill-gray-400">
                    {m.feriados} {m.feriados === 1 ? 'feriado' : 'feriados'}
                  </text>
                )}
                <rect x={IZQ + i * anchoMes} y={ARRIBA} width={anchoMes} height={altoUtil} fill="transparent" />
              </g>
            )
          })}
          <line x1={IZQ} x2={ANCHO - DER} y1={ARRIBA + altoUtil} y2={ARRIBA + altoUtil} className="stroke-neutral-300 dark:stroke-zinc-600" />
        </svg>
        {activo !== null && (
          <div className="pointer-events-none absolute right-2 top-2 min-w-[190px] rounded-md border border-neutral-200 bg-white p-2.5 text-[12px] shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <p className="mb-1 font-semibold text-neutral-900 dark:text-gray-100">
              {mesLargo(meses[activo].mes)} · {meses[activo].tipo === 'real' ? 'real' : 'proyectado'}
            </p>
            {SERIES.map((s) => (
              <p key={s.clave} className="flex justify-between gap-4 text-neutral-600 dark:text-gray-300">
                <span>{s.nombre}</span>
                <span className="tabular-nums">{numero(meses[activo][s.clave])} h</span>
              </p>
            ))}
            <p className="flex justify-between gap-4 text-neutral-600 dark:text-gray-300">
              <span>Costo con cargas</span>
              <span className="tabular-nums">{pesosCorto(meses[activo].costo)}</span>
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 max-w-full overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-gray-400">
              <th className="py-1.5 pr-2 text-left font-semibold">Concepto</th>
              {meses.map((m, i) => (
                <th
                  key={m.mes}
                  className={`px-2 py-1.5 text-right font-semibold ${m.tipo === 'actual' ? 'bg-brand-primary-light' : ''} ${i === iPrimeraPrevision ? 'border-l border-neutral-200 dark:border-zinc-700' : ''}`}
                >
                  {mesCorto(m.mes)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {[
              { lbl: 'Horas extra 50% + 100%', f: (m: MesAgregado) => numero(m.he50 + m.he100) },
              { lbl: 'Horas en feriado', f: (m: MesAgregado) => numero(m.fer) },
              { lbl: 'Total horas', f: (m: MesAgregado) => numero(m.he50 + m.he100 + m.fer), fuerte: true },
              { lbl: 'Costo para la empresa', f: (m: MesAgregado) => pesosCorto(m.costo) },
              { lbl: 'Días de vacaciones', f: (m: MesAgregado) => numero(m.vacaciones) },
              { lbl: 'Días de licencia', f: (m: MesAgregado) => numero(m.licencias) },
              { lbl: 'Feriados', f: (m: MesAgregado) => (m.feriados ? String(m.feriados) : '–') },
            ].map((fila) => (
              <tr key={fila.lbl} className="border-t border-neutral-100 dark:border-zinc-800">
                <td className="py-1.5 pr-2 text-left text-neutral-700 dark:text-gray-300">{fila.lbl}</td>
                {meses.map((m, i) => (
                  <td
                    key={m.mes}
                    className={`px-2 py-1.5 text-right ${fila.fuerte ? 'font-semibold' : ''} ${m.tipo === 'actual' ? 'bg-brand-primary-light' : ''} ${i === iPrimeraPrevision ? 'border-l border-neutral-200 dark:border-zinc-700' : ''}`}
                  >
                    {fila.f(m)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-neutral-100 dark:border-zinc-800">
              <td className="py-1.5 pr-2 text-left text-neutral-700 dark:text-gray-300">Variación</td>
              {meses.map((m, i) => {
                const v = variacion(i)
                const clase =
                  v === null || Math.abs(v) < 2
                    ? 'text-neutral-500 dark:text-gray-400'
                    : v > 0
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                return (
                  <td key={m.mes} className={`px-2 py-1.5 text-right ${clase} ${m.tipo === 'actual' ? 'bg-brand-primary-light' : ''}`}>
                    {v === null ? '–' : `${v > 0 ? '+' : ''}${numero(v)}%`}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
