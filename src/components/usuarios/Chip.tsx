import { X } from 'lucide-react'
import type { TonoChip } from './util'

const ESTILO: Record<TonoChip, string> = {
  area: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200',
  modulo: 'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200',
  especial: 'bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100',
  cuenta: 'bg-neutral-100 text-neutral-700 dark:bg-zinc-800 dark:text-gray-200',
  pendiente: 'bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100',
  rechazo: 'bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200',
}

export function Chip({
  children,
  tono,
  onQuitar,
  quitarLabel,
}: {
  children: string
  tono: TonoChip
  onQuitar?: () => void
  quitarLabel?: string
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTILO[tono]}`}
    >
      <span className="truncate">{children}</span>
      {onQuitar && (
        <button
          type="button"
          onClick={onQuitar}
          aria-label={quitarLabel ?? `Quitar ${children}`}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}
