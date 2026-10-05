import { Compass } from 'lucide-react'
import { useAbrirRecorrido } from './recorridoPuente'

/** Ver recorrido: en la barra (escritorio) o dentro del menú (celular). */
export function BotonRecorrido({
  variante,
  alAbrir,
}: {
  variante: 'barra' | 'menu'
  alAbrir?: () => void
}) {
  const abrir = useAbrirRecorrido()
  const clase =
    variante === 'barra'
      ? 'hidden h-11 shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-900 md:inline-flex dark:border-zinc-700 dark:text-gray-200 dark:hover:bg-zinc-800 dark:hover:text-gray-100'
      : 'flex min-h-11 w-full items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2.5 text-base font-medium text-neutral-800 transition-colors hover:bg-neutral-100 dark:border-zinc-700 dark:text-gray-100 dark:hover:bg-zinc-800'

  return (
    <button
      type="button"
      className={clase}
      aria-haspopup="dialog"
      onClick={() => {
        alAbrir?.()
        abrir?.()
      }}
    >
      <Compass className={variante === 'barra' ? 'h-4 w-4 shrink-0' : 'h-5 w-5 shrink-0'} aria-hidden />
      Ver recorrido
    </button>
  )
}
