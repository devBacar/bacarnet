import type { ReactNode } from 'react'
import { pesosCorto } from './formatoRrhh'

/**
 * Bloques del resumen simple que va arriba de cada pestaña: letra grande, pocos números y frases cortas,
 * pensado para quien no está acostumbrado a leer tableros.
 */

export type TonoBanda = 'real' | 'estimado' | 'plan' | 'pactadas' | 'anual'

const FONDO_BANDA: Record<TonoBanda, string> = {
  real: 'bg-[#1f3b63]',
  estimado: 'bg-[#8a4b08]',
  plan: 'bg-[#14532d]',
  pactadas: 'bg-[#334155]',
  anual: 'bg-[#5b21b6]',
}

export function BandaRrhh({ titulo, subtitulo, tono }: { titulo: string; subtitulo: ReactNode; tono: TonoBanda }) {
  return (
    <div className={`rounded-xl px-5 py-4 text-white ${FONDO_BANDA[tono]}`}>
      <h2 className="text-[26px] font-bold leading-tight">{titulo}</h2>
      <p className="mt-1 text-[16px] opacity-95">{subtitulo}</p>
    </div>
  )
}

export interface NumeroGrande {
  etiqueta: string
  valor: string
  nota?: ReactNode
  tono?: 'verde' | 'rojo'
}

export function NumerosGrandes({ items }: { items: NumeroGrande[] }) {
  return (
    <dl className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {items.map((it) => (
        <div key={it.etiqueta} className="min-w-0 rounded-xl border-2 border-neutral-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <dt className="text-[15px] text-neutral-600 dark:text-gray-400">{it.etiqueta}</dt>
          <dd
            className={`mt-1 text-[30px] font-bold leading-tight tabular-nums ${
              it.tono === 'verde'
                ? 'text-emerald-700 dark:text-emerald-400'
                : it.tono === 'rojo'
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-neutral-900 dark:text-gray-100'
            }`}
          >
            {it.valor}
          </dd>
          {it.nota ? <dd className="mt-1 text-[14px] text-neutral-600 dark:text-gray-400">{it.nota}</dd> : null}
        </div>
      ))}
    </dl>
  )
}

export function NotaRrhh({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-slate-100 px-4 py-3 text-[15.5px] leading-snug text-slate-800 dark:bg-zinc-800 dark:text-gray-200">{children}</p>
}

function Frases({ frases, punto }: { frases: ReactNode[]; punto: string }) {
  return (
    <ul className="grid gap-2.5">
      {frases.map((f, i) => (
        <li key={i} className="flex gap-3 text-[17px] leading-relaxed text-neutral-800 dark:text-gray-200">
          <span aria-hidden className={`mt-[10px] h-2.5 w-2.5 shrink-0 rounded-full ${punto}`} />
          <span className="min-w-0">{f}</span>
        </li>
      ))}
    </ul>
  )
}

export function PocasPalabras({ frases, titulo = 'En pocas palabras' }: { frases: ReactNode[]; titulo?: string }) {
  if (frases.length === 0) return null
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
      <h3 className="mb-3 text-[20px] font-semibold text-[#1f3b63] dark:text-blue-300">{titulo}</h3>
      <Frases frases={frases} punto="bg-[#1f3b63] dark:bg-blue-300" />
    </section>
  )
}

export function AtenderRrhh({ frases, titulo = 'Lo que hay que atender' }: { frases: ReactNode[]; titulo?: string }) {
  if (frases.length === 0) return null
  return (
    <section className="rounded-xl border-l-8 border-red-700 bg-red-50 p-5 dark:bg-red-950/30">
      <h3 className="mb-3 text-[20px] font-semibold text-red-700 dark:text-red-400">{titulo}</h3>
      <Frases frases={frases} punto="bg-red-700" />
    </section>
  )
}

export interface BarraGasto {
  nombre: string
  valor: number
  gris?: boolean
}

export function BarrasGasto({ items, titulo = '¿Dónde se gastó?' }: { items: BarraGasto[]; titulo?: string }) {
  const max = Math.max(1, ...items.map((i) => i.valor))
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
      <h3 className="mb-3 text-[20px] font-semibold text-[#1f3b63] dark:text-blue-300">{titulo}</h3>
      <ul className="grid gap-2.5">
        {items.map((it) => (
          <li key={it.nombre} className="grid grid-cols-[minmax(120px,240px)_1fr_auto] items-center gap-3 text-[16px]">
            <span className="truncate text-neutral-800 dark:text-gray-200">{it.nombre}</span>
            <span className="h-6 rounded-md bg-neutral-100 dark:bg-zinc-800">
              <span
                className={`block h-6 rounded-md ${it.gris ? 'bg-slate-400' : 'bg-[#2f6db5]'}`}
                style={{ width: `${Math.max(0.5, (it.valor / max) * 100)}%` }}
              />
            </span>
            <strong className="text-right tabular-nums text-neutral-900 dark:text-gray-100">{pesosCorto(it.valor)}</strong>
          </li>
        ))}
      </ul>
    </section>
  )
}

export interface Tarea {
  clave: string
  texto: ReactNode
  plata?: string
  plataArriba?: string
  plataAbajo?: string
  tonoPlata?: 'verde' | 'rojo' | 'azul'
}

export function TareasRrhh({ tareas, titulo }: { tareas: Tarea[]; titulo: string }) {
  if (tareas.length === 0) return null
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
      <h3 className="mb-3 text-[20px] font-semibold text-[#1f3b63] dark:text-blue-300">{titulo}</h3>
      <ol className="grid gap-3">
        {tareas.map((t, i) => (
          <li
            key={t.clave}
            className="grid grid-cols-[40px_1fr] items-center gap-4 rounded-xl border-2 border-neutral-200 p-4 sm:grid-cols-[40px_1fr_170px] dark:border-zinc-700"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1f3b63] text-[19px] font-bold text-white">{i + 1}</span>
            <div className="min-w-0 text-[16.5px] leading-snug text-neutral-800 dark:text-gray-200">{t.texto}</div>
            {t.plata ? (
              <div className="col-start-2 text-left sm:col-start-3 sm:text-right">
                {t.plataArriba ? <span className="block text-[13.5px] text-neutral-500 dark:text-gray-400">{t.plataArriba}</span> : null}
                <strong
                  className={`block text-[22px] tabular-nums ${
                    t.tonoPlata === 'rojo'
                      ? 'text-red-700 dark:text-red-400'
                      : t.tonoPlata === 'azul'
                        ? 'text-[#1f3b63] dark:text-blue-300'
                        : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {t.plata}
                </strong>
                {t.plataAbajo ? <span className="block text-[13.5px] text-neutral-500 dark:text-gray-400">{t.plataAbajo}</span> : null}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Título de sección para el detalle que queda debajo del resumen. */
export function TituloDetalle({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="h-px flex-1 bg-neutral-300 dark:bg-zinc-700" />
      <span className="text-[13px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-gray-400">{children}</span>
      <span className="h-px flex-1 bg-neutral-300 dark:bg-zinc-700" />
    </div>
  )
}
