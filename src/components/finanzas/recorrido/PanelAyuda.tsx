import { Compass, ListChecks, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { PermisosFinanzasEfectivos } from '../../../services/userService'
import { tienePermiso, type Guia } from './pasosRecorrido'
import { agruparGuias, etiquetaPasos } from './recorridoLogica'

export function PanelAyuda({
  pathname,
  guias,
  permisos,
  onPaseo,
  onGuia,
  onCerrar,
}: {
  pathname: string
  guias: Guia[]
  permisos: PermisosFinanzasEfectivos
  onPaseo: () => void
  onGuia: (guia: Guia) => void
  onCerrar: () => void
}) {
  const dialogo = useRef<HTMLDivElement>(null)
  const grupos = agruparGuias(guias, pathname)

  useEffect(() => {
    dialogo.current?.focus()
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-neutral-950/45" onClick={onCerrar} />
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ayuda-titulo"
        tabIndex={-1}
        className="relative flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-neutral-200 bg-white shadow-xl outline-none sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-b bg-[var(--color-primary-light)] px-4 py-3"
          style={{ borderColor: 'var(--color-primary-muted)' }}
        >
          <h2 id="ayuda-titulo" className="text-base font-semibold" style={{ color: 'var(--color-primary)' }}>
            Ayuda de Finanzas
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-neutral-600 transition hover:bg-white/60 dark:text-gray-300 dark:hover:bg-zinc-800/60"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          <button
            type="button"
            onClick={onPaseo}
            className="flex w-full items-start gap-3 rounded-xl border border-neutral-200 bg-white p-3.5 text-left transition hover:border-[var(--color-primary-muted)] hover:bg-neutral-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-light)]">
              <Compass className="h-5 w-5" style={{ color: 'var(--color-primary)' }} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-semibold text-neutral-900 dark:text-gray-100">Paseo por el módulo</span>
              <span className="mt-0.5 block text-sm leading-snug text-neutral-600 dark:text-gray-300">
                3 minutos · qué hay en cada pantalla y para qué sirve
              </span>
            </span>
          </button>

          <div className="mt-3 rounded-xl border border-neutral-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-start gap-3 p-3.5">
              <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-light)]">
                <ListChecks className="h-5 w-5" style={{ color: 'var(--color-primary)' }} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-semibold text-neutral-900 dark:text-gray-100">Cómo se hace…</span>
                <span className="mt-0.5 block text-sm leading-snug text-neutral-600 dark:text-gray-300">
                  guías paso a paso; te va marcando dónde tocar
                </span>
              </span>
            </div>

            {grupos.length === 0 ? (
              <p className="px-3.5 pb-3.5 text-sm text-neutral-600 dark:text-gray-300">Todavía no hay guías para vos.</p>
            ) : null}

            {grupos.map((grupo) => (
              <section key={grupo.pantalla.id} className="border-t border-neutral-100 dark:border-zinc-800">
                <h3
                  className={`px-3.5 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide ${
                    grupo.actual ? '' : 'text-neutral-500 dark:text-zinc-400'
                  }`}
                  style={grupo.actual ? { color: 'var(--color-primary)' } : undefined}
                >
                  {grupo.pantalla.nombre}
                  {grupo.actual ? <span className="ml-1.5 font-medium normal-case tracking-normal">(estás acá)</span> : null}
                </h3>
                <ul className="pb-2">
                  {grupo.guias.map((guia) => {
                    const pidePermiso = Boolean(guia.permiso) && !tienePermiso(permisos, guia.permiso)
                    return (
                      <li key={guia.id}>
                        <button
                          type="button"
                          onClick={() => onGuia(guia)}
                          className={`flex min-h-11 w-full items-center gap-2 px-3.5 py-2 text-left transition hover:bg-neutral-50 dark:hover:bg-zinc-800 ${
                            grupo.actual ? 'bg-[var(--color-primary-light)]/40' : ''
                          }`}
                        >
                          <span className="min-w-0 flex-1 text-[15px] leading-snug text-neutral-800 dark:text-gray-100">
                            {guia.titulo}
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-0.5">
                            <span className="text-xs text-neutral-500 tabular-nums dark:text-zinc-400">
                              {etiquetaPasos(guia.pasos.length)}
                            </span>
                            {pidePermiso ? (
                              <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-px text-[11px] font-medium leading-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                                pide permiso
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
