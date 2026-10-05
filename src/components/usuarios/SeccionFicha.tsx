import type { LucideIcon } from 'lucide-react'
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

export function SeccionFicha({
  icono: Icono,
  titulo,
  children,
  abierta,
  onToggle,
  extra,
}: {
  icono: LucideIcon
  titulo: string
  children?: ReactNode
  abierta?: boolean
  onToggle?: () => void
  extra?: ReactNode
}) {
  const contenidoEncabezado = (
    <>
      <Icono className="h-4 w-4 shrink-0 text-brand-primary" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-brand-primary">
        {titulo}
      </span>
      {extra}
      {onToggle && (
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-brand-primary transition-transform ${abierta ? 'rotate-180' : ''}`}
          aria-hidden
        />
      )}
    </>
  )

  const claseBanda =
    'flex w-full items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 dark:bg-zinc-800/80'

  return (
    <section className="min-w-0">
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={abierta}
          className={`${claseBanda} cursor-pointer`}
        >
          {contenidoEncabezado}
        </button>
      ) : (
        <div className={claseBanda}>{contenidoEncabezado}</div>
      )}
      {(!onToggle || abierta) && children ? <div className="mt-3 min-w-0 space-y-3">{children}</div> : null}
    </section>
  )
}
