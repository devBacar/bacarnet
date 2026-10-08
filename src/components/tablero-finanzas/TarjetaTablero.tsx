import type { ReactNode } from 'react'

/** Tarjeta con el mismo estilo que el tablero de RRHH. */
export function TarjetaTablero({
  titulo,
  subtitulo,
  children,
}: {
  titulo: ReactNode
  subtitulo?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-neutral-300 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <header className="border-b border-[var(--color-primary-muted)] bg-brand-primary-light px-4 py-2.5">
        <h2 className="text-brand-primary text-[15px] font-medium">{titulo}</h2>
        {subtitulo ? <p className="text-brand-primary mt-0.5 text-[13px] leading-snug">{subtitulo}</p> : null}
      </header>
      <div className="min-w-0 p-4">{children}</div>
    </section>
  )
}
