import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Compass } from 'lucide-react'

export function OfertaRecorrido({ onEmpezar, onAhoraNo }: { onEmpezar: () => void; onAhoraNo: () => void }) {
  return createPortal(
    <div className="fixed right-3 bottom-3 left-3 z-[45] max-w-full sm:left-auto sm:w-80">
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start gap-2.5">
          <Compass className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--color-primary)' }} aria-hidden />
          <p className="text-[15px] leading-snug text-neutral-800 dark:text-gray-100">
            ¿Querés un recorrido de 3 minutos por Finanzas?
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onEmpezar}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-primary px-3 text-sm font-medium text-white transition hover:opacity-90"
          >
            Empezar
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

export function PreguntaRecorrido({
  onCompleto,
  onPantalla,
  onCerrar,
}: {
  onCompleto: () => void
  onPantalla: () => void
  onCerrar: () => void
}) {
  const dialogo = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialogo.current?.focus()
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-3 sm:items-center sm:p-4">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-neutral-950/45" onClick={onCerrar} />
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recorrido-pregunta-titulo"
        tabIndex={-1}
        className="relative w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl outline-none dark:border-zinc-700 dark:bg-zinc-900"
      >
        <h2 id="recorrido-pregunta-titulo" className="text-base font-semibold" style={{ color: 'var(--color-primary)' }}>
          Ver recorrido
        </h2>
        <div className="mt-3 grid gap-2">
          <button
            type="button"
            onClick={onCompleto}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-primary px-3 text-sm font-medium text-white transition hover:opacity-90"
          >
            Recorrido completo del módulo
          </button>
          <button
            type="button"
            onClick={onPantalla}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-300 px-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 dark:border-zinc-600 dark:text-gray-100 dark:hover:bg-zinc-800"
          >
            Solo esta pantalla
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-medium text-neutral-600 underline-offset-2 hover:underline dark:text-gray-300"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
