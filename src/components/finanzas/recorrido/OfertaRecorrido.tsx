import { createPortal } from 'react-dom'
import { Compass } from 'lucide-react'

export function OfertaRecorrido({ onEmpezar, onAhoraNo }: { onEmpezar: () => void; onAhoraNo: () => void }) {
  return createPortal(
    <div className="fixed right-3 bottom-3 left-3 z-[45] max-w-full sm:left-auto sm:w-80">
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start gap-2.5">
          <Compass className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--color-primary)' }} aria-hidden />
          <p className="text-[15px] leading-snug text-neutral-800 dark:text-gray-100">
            ¿Querés un paseo de 3 minutos por Finanzas? Después, en «Ayuda» tenés guías paso a paso.
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onEmpezar}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-primary px-3 text-sm font-medium text-white transition hover:opacity-90"
          >
            Empezar paseo
          </button>
          <button
            type="button"
            onClick={onAhoraNo}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-300 px-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 dark:border-zinc-600 dark:text-gray-100 dark:hover:bg-zinc-800"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
