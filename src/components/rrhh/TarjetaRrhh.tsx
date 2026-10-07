import type { ReactNode } from 'react'

/** Tarjeta con el mismo estilo que las de Finanzas: encabezado azul claro, contenido y nota al pie opcional. */
export function TarjetaRrhh({
  titulo,
  subtitulo,
  derecha,
  pie,
  children,
}: {
  titulo: ReactNode
  subtitulo?: ReactNode
  derecha?: ReactNode
  pie?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-neutral-300 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[var(--color-primary-muted)] bg-brand-primary-light px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-brand-primary text-[15px] font-medium">{titulo}</h2>
          {subtitulo ? <p className="text-brand-primary text-[13px]">{subtitulo}</p> : null}
        </div>
        {derecha ? <div className="flex min-w-0 flex-wrap items-center gap-2">{derecha}</div> : null}
      </header>
      <div className="min-w-0 p-4">{children}</div>
      {pie ? (
        <p className="text-body-muted mx-4 mb-3 border-t border-neutral-100 pt-2 text-[12.5px] dark:border-zinc-800">{pie}</p>
      ) : null}
    </section>
  )
}
