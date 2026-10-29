import type { ReactNode } from 'react'
import { claseNivel, type NivelAlerta } from './umbrales'

export function SeccionCops({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string
  subtitulo?: string
  children: ReactNode
}) {
  return (
    <section className="surface-card min-w-0 overflow-hidden">
      <header className="border-b border-[var(--color-primary-muted)] bg-brand-primary-light px-4 py-2.5">
        <h2 className="text-brand-primary text-[15px] font-medium">{titulo}</h2>
        {subtitulo ? <p className="text-brand-primary mt-0.5 text-[13px] leading-snug">{subtitulo}</p> : null}
      </header>
      <div className="min-w-0 p-4">{children}</div>
    </section>
  )
}

export function KpiCops({
  etiqueta,
  valor,
  nota,
  nivel,
}: {
  etiqueta: string
  valor: ReactNode
  nota?: ReactNode
  nivel?: NivelAlerta
}) {
  const colorValor = nivel ? claseNivel(nivel) : 'text-heading'
  return (
    <article className="card-minimal min-w-0 p-4">
      <h3 className="text-brand-primary text-[13px] font-medium">{etiqueta}</h3>
      <p className={`mt-1 break-words text-[26px] font-bold leading-tight tabular-nums ${colorValor}`}>{valor}</p>
      {nota ? <p className="text-body-muted mt-1 text-[13px] leading-snug">{nota}</p> : null}
    </article>
  )
}

export function SkeletonCops() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Cargando tablero COPS">
      {[1, 2, 3].map((i) => (
        <div key={i} className="surface-muted h-28 animate-pulse rounded-xl" />
      ))}
    </div>
  )
}
