import { ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { HelpdeskMinutaDiagnostico } from '../../types/helpdeskMinutaDiagnostico'

export function minutaDiagnosticoSummary(minuta: HelpdeskMinutaDiagnostico): string {
  const objetivo = minuta.objetivoSesion?.trim() ?? ''
  if (objetivo.length > 12 && !/^objetivo$/i.test(objetivo)) {
    return objetivo.length > 100 ? `${objetivo.slice(0, 99)}…` : objetivo
  }
  const procesos = minuta.procesosEvaluados?.length ?? 0
  const iniciativas = minuta.iniciativasPropuestas?.length ?? 0
  return `${procesos} proceso(s) evaluado(s) · ${iniciativas} iniciativa(s) propuesta(s)`
}

export function legacyMinutaSummary(texto: string): string {
  const t = texto.trim()
  if (!t) return 'Minuta disponible'
  return t.length > 100 ? `${t.slice(0, 99)}…` : t
}

export function MisProyectosMinutaDisclosure({
  title,
  summary,
  children,
}: {
  title: string
  summary: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className="mt-2 w-full basis-full rounded-md border border-neutral-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
      data-testid="helpdesk-mis-proyectos-minuta"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-h-11 cursor-pointer items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary dark:hover:bg-zinc-800/80"
        data-testid="helpdesk-mis-proyectos-minuta-toggle"
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">{title}</p>
          {!open ? (
            <p className="mt-1 line-clamp-2 text-sm text-body-muted">{summary}</p>
          ) : (
            <p className="mt-1 text-xs text-brand-primary">Ocultar minuta</p>
          )}
        </div>
        <ChevronDown
          className={`mt-0.5 h-5 w-5 shrink-0 text-body-muted transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      <div
        className={`grid border-t border-neutral-100 transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none dark:border-zinc-800 ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          {open ? (
            <div className="px-3 py-3" data-testid="helpdesk-mis-proyectos-minuta-body">
              {children}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
