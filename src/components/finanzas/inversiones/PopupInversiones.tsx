import { type ReactNode, useEffect } from 'react'

/** Nueva inversión y detalle (aprobar, pagar, PDF) se abren como popup sobre el listado. */
export function Popup({
  children,
  onCerrar,
  cerrarSoloConBoton = false,
}: {
  children: ReactNode
  onCerrar: () => void
  /** Formularios: ni Escape ni el clic afuera cierran, para no perder lo cargado. */
  cerrarSoloConBoton?: boolean
}) {
  useEffect(() => {
    if (cerrarSoloConBoton) return
    const alTeclear = (e: KeyboardEvent) => {
      // Si hay otro modal abierto encima (pagar, rechazar…), Escape lo cierra a él y no al detalle.
      if (e.key === 'Escape' && document.querySelectorAll('.fixed.inset-0').length <= 1) onCerrar()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCerrar, cerrarSoloConBoton])

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (!cerrarSoloConBoton && e.target === e.currentTarget) onCerrar()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex h-[min(100dvh,960px)] w-full min-w-0 max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white p-4 shadow-xl sm:h-[min(92dvh,920px)] sm:rounded-2xl sm:p-6 dark:bg-zinc-900"
      >
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="text-body-muted absolute right-3 top-3 z-20 rounded-lg px-2 py-1 text-lg hover:bg-neutral-100 dark:hover:bg-zinc-800"
        >
          ×
        </button>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  )
}
