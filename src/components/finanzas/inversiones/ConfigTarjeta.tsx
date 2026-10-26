import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type TonoConfig = 'sky' | 'emerald' | 'amber' | 'violet' | 'rose' | 'neutro'

const TONO_TARJETA: Record<TonoConfig, string> = {
  sky: 'border-sky-200 bg-sky-50 dark:border-sky-900/60 dark:bg-sky-950/30',
  emerald: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30',
  amber: 'border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30',
  violet: 'border-violet-200 bg-violet-50 dark:border-violet-900/60 dark:bg-violet-950/30',
  rose: 'border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30',
  neutro: 'border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
}

const TONO_ICONO: Record<TonoConfig, string> = {
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300',
  neutro: 'bg-neutral-100 text-neutral-700 dark:bg-zinc-800 dark:text-zinc-300',
}

const TONO_TEXTO: Record<TonoConfig, string> = {
  sky: 'text-sky-800 dark:text-sky-300',
  emerald: 'text-emerald-700 dark:text-emerald-300',
  amber: 'text-amber-800 dark:text-amber-300',
  violet: 'text-violet-700 dark:text-violet-300',
  rose: 'text-rose-700 dark:text-rose-300',
  neutro: 'text-heading',
}

type ConfigTarjetaProps = {
  tono: TonoConfig
  icono: LucideIcon
  titulo: string
  descripcion: string
  children: ReactNode
}

/** Tarjeta de sección para la pestaña Configuración de Inversores. */
export function ConfigTarjeta({ tono, icono: Icono, titulo, descripcion, children }: ConfigTarjetaProps) {
  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${TONO_TARJETA[tono]}`}>
      <header className="mb-4 flex gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${TONO_ICONO[tono]}`}
          aria-hidden
        >
          <Icono className="h-5 w-5" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h3 className="text-heading text-sm font-semibold sm:text-base">{titulo}</h3>
          <p className="text-body-muted mt-0.5 text-xs leading-relaxed sm:text-sm">{descripcion}</p>
        </div>
      </header>
      {children}
    </section>
  )
}

type ConfigAvisoProps = {
  tono?: Extract<TonoConfig, 'amber' | 'sky' | 'emerald'>
  icono: LucideIcon
  children: ReactNode
}

/** Caja informativa o de advertencia dentro de la configuración. */
export function ConfigAviso({ tono = 'amber', icono: Icono, children }: ConfigAvisoProps) {
  return (
    <div className={`flex gap-2.5 rounded-xl border px-3 py-2.5 ${TONO_TARJETA[tono]}`}>
      <Icono className={`mt-0.5 h-4 w-4 shrink-0 ${TONO_TEXTO[tono]}`} aria-hidden />
      <div className={`text-sm leading-relaxed ${TONO_TEXTO[tono]}`}>{children}</div>
    </div>
  )
}
