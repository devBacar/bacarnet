import type { ReactNode } from 'react'
import { OTRAS_AREAS_CC, type AreaPeriodoRrhh, type CausasHorasRrhh, type CifrasPeriodoRrhh } from '../../services/rrhhApi'
import { nombreMes, numero, pesosCorto } from './formatoRrhh'

/** Aviso arriba de cada período: qué se está mirando y de dónde salen los números. */
export function AvisoPeriodo({ tono, children }: { tono: 'real' | 'estimado' | 'anual'; children: ReactNode }) {
  const estilo =
    tono === 'real'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100'
      : tono === 'estimado'
        ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
        : 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-100'
  return <p className={`rounded-lg border px-3.5 py-2.5 text-[13.5px] leading-snug ${estilo}`}>{children}</p>
}

/** "Lo más importante": frases armadas en el backend, en lenguaje simple. */
export function ClavesRrhh({ claves }: { claves: string[] }) {
  if (claves.length === 0) return <p className="text-body-muted text-[13px]">Sin datos para esta selección.</p>
  return (
    <ul className="grid gap-2">
      {claves.map((c, i) => (
        <li key={i} className="flex gap-2.5 text-[14.5px] leading-relaxed text-neutral-800 dark:text-gray-200">
          <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" />
          <span>{c}</span>
        </li>
      ))}
    </ul>
  )
}

export interface CifraItem {
  etiqueta: string
  valor: string
  nota?: ReactNode
}

/** Fila de números grandes con su explicación debajo. */
export function CifrasRrhh({ items }: { items: CifraItem[] }) {
  return (
    <dl className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <div key={it.etiqueta} className="min-w-0 rounded-lg border border-neutral-200 p-3 dark:border-zinc-700">
          <dt className="text-[12.5px] text-neutral-600 dark:text-gray-400">{it.etiqueta}</dt>
          <dd className="mt-0.5 text-[22px] font-semibold tabular-nums text-neutral-900 dark:text-gray-100">{it.valor}</dd>
          {it.nota ? <dd className="mt-0.5 text-[12.5px] text-neutral-600 dark:text-gray-400">{it.nota}</dd> : null}
        </div>
      ))}
    </dl>
  )
}

/** "+12% vs septiembre": rojo si sube el costo, verde si baja. */
export function Variacion({ cifras }: { cifras: Pick<CifrasPeriodoRrhh, 'costo' | 'anterior'> }) {
  const ant = cifras.anterior
  if (!ant || ant.costo <= 0) return <span className="text-neutral-400">—</span>
  const pct = Math.round(((cifras.costo - ant.costo) / ant.costo) * 100)
  if (Math.abs(pct) < 3) return <span className="text-neutral-600 dark:text-gray-400">igual que {nombreMes(ant.mes).slice(0, 3)}</span>
  const sube = pct > 0
  return (
    <span className={sube ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}>
      {sube ? '▲' : '▼'} {Math.abs(pct)}% vs {nombreMes(ant.mes).slice(0, 3)}
    </span>
  )
}

const CAUSAS: { clave: keyof CausasHorasRrhh; color: string; titulo: string; explicacion: string }[] = [
  {
    clave: 'ausencias',
    color: '#2a78d6',
    titulo: 'Cubrir vacaciones y licencias',
    explicacion: 'Horas que se pagan porque alguien faltó y otro hizo su turno.',
  },
  {
    clave: 'habituales',
    color: '#eb6834',
    titulo: 'Se repiten todos los meses',
    explicacion: 'Por cómo están armados los turnos o porque falta personal fijo. No dependen de las ausencias.',
  },
  {
    clave: 'feriados',
    color: '#1baf7a',
    titulo: 'Trabajo en feriados',
    explicacion: 'Se pagan al doble.',
  },
]

/** Barra horizontal con el origen de las horas extra y la explicación de cada parte. */
export function CausasRrhh({ causas }: { causas: CausasHorasRrhh }) {
  const total = causas.ausencias + causas.habituales + causas.feriados
  if (total <= 0) return <p className="text-body-muted text-[13px]">No hubo horas extra.</p>
  return (
    <div className="grid gap-3">
      <div className="flex h-5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-zinc-800" role="img" aria-label="Origen de las horas extra">
        {CAUSAS.map((c) =>
          causas[c.clave] > 0 ? (
            <div key={c.clave} style={{ width: `${(causas[c.clave] / total) * 100}%`, backgroundColor: c.color }} />
          ) : null,
        )}
      </div>
      <ul className="grid gap-2 sm:grid-cols-3">
        {CAUSAS.map((c) => (
          <li key={c.clave} className="flex gap-2 text-[13px]">
            <span aria-hidden className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: c.color }} />
            <span className="min-w-0">
              <strong className="font-semibold text-neutral-900 dark:text-gray-100">
                {c.titulo}: {Math.round((causas[c.clave] / total) * 100)}%
              </strong>{' '}
              <span className="tabular-nums text-neutral-700 dark:text-gray-300">({numero(causas[c.clave])} h)</span>
              <span className="block text-neutral-600 dark:text-gray-400">{c.explicacion}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function motivoPrincipal(c: CausasHorasRrhh): string {
  const total = c.ausencias + c.habituales + c.feriados
  if (total <= 0) return '—'
  const [mayor] = CAUSAS.map((x) => ({ x, v: c[x.clave] })).sort((a, b) => b.v - a.v)
  return `${mayor.x.titulo} (${Math.round((mayor.v / total) * 100)}%)`
}

/** Tabla por área de un período, cerrado o estimado. */
export function TablaAreasRrhh({
  areas,
  estimado,
  seleccion,
}: {
  areas: AreaPeriodoRrhh[]
  estimado: boolean
  seleccion: number | 'todas'
}) {
  const filas = areas.filter((a) => a.horasTotal > 0 || (a.vacacionesCargadas ?? 0) > 0)
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-[13px]">
        <thead>
          <tr className="text-left text-[11.5px] text-neutral-600 dark:text-gray-400">
            <th className="py-1.5 pr-2 font-semibold">Área</th>
            <th className="px-2 py-1.5 text-right font-semibold">Horas extra</th>
            <th className="px-2 py-1.5 text-right font-semibold">Costo</th>
            <th className="px-2 py-1.5 text-right font-semibold">Contra el mes anterior</th>
            {estimado ? (
              <>
                <th className="px-2 py-1.5 text-right font-semibold">Vacaciones cargadas (días)</th>
                <th className="px-2 py-1.5 text-right font-semibold">Se pueden sumar sin horas extra</th>
              </>
            ) : (
              <>
                <th className="px-2 py-1.5 text-right font-semibold">Personas que cobraron</th>
                <th className="px-2 py-1.5 text-right font-semibold">Más de 30 h (máximo legal)</th>
              </>
            )}
            <th className="px-2 py-1.5 font-semibold">Motivo principal</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {filas.map((a) => (
            <tr
              key={a.cc}
              className={`border-t border-neutral-100 dark:border-zinc-800 ${seleccion === a.cc ? 'bg-brand-primary-light' : ''}`}
            >
              <td className="py-2 pr-2 text-neutral-900 dark:text-gray-100">
                {a.nombre}
                {a.cc === OTRAS_AREAS_CC ? (
                  <span className="block text-[11.5px] text-neutral-500 dark:text-gray-400">áreas con pocas horas extra</span>
                ) : null}
              </td>
              <td className="px-2 py-2 text-right">{numero(a.horasTotal)}</td>
              <td className="px-2 py-2 text-right">{pesosCorto(a.costo)}</td>
              <td className="px-2 py-2 text-right text-[12.5px]">
                <Variacion cifras={a} />
              </td>
              {estimado ? (
                <>
                  <td className="px-2 py-2 text-right">{a.vacacionesCargadas !== undefined ? numero(a.vacacionesCargadas) : '—'}</td>
                  <td className="px-2 py-2 text-right">{a.vacacionesPosibles !== undefined ? numero(a.vacacionesPosibles) : '—'}</td>
                </>
              ) : (
                <>
                  <td className="px-2 py-2 text-right">
                    {a.personasConHorasExtra ?? '—'}
                    <span className="text-neutral-500 dark:text-gray-400"> de {numero(a.dotacion)}</span>
                  </td>
                  <td className={`px-2 py-2 text-right ${(a.personasMas30 ?? 0) > 0 ? 'font-semibold text-red-700 dark:text-red-400' : ''}`}>
                    {a.personasMas30 ?? '—'}
                  </td>
                </>
              )}
              <td className="px-2 py-2 text-[12.5px] text-neutral-700 dark:text-gray-300">{motivoPrincipal(a.causas)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Vacaciones y licencias de un mes cerrado, por tipo. */
export function AusenciasRrhh({ cifras }: { cifras: CifrasPeriodoRrhh }) {
  const max = Math.max(1, cifras.diasVacaciones, ...cifras.licenciasPorTipo.map((l) => l.dias))
  const filas = [{ tipo: 'Vacaciones', dias: cifras.diasVacaciones }, ...cifras.licenciasPorTipo]
  return (
    <ul className="grid gap-1.5">
      {filas
        .filter((f) => f.dias > 0)
        .map((f) => (
          <li key={f.tipo} className="grid grid-cols-[minmax(110px,180px)_1fr_auto] items-center gap-3 text-[13px]">
            <span className="truncate text-neutral-800 dark:text-gray-200">{f.tipo}</span>
            <span className="h-2.5 rounded-full bg-neutral-100 dark:bg-zinc-800">
              <span
                className="block h-2.5 rounded-full"
                style={{ width: `${(f.dias / max) * 100}%`, backgroundColor: f.tipo === 'Vacaciones' ? '#2a78d6' : '#8b8f98' }}
              />
            </span>
            <span className="tabular-nums text-neutral-700 dark:text-gray-300">{numero(f.dias)} días</span>
          </li>
        ))}
    </ul>
  )
}
