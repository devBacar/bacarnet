import { UserCircle2 } from 'lucide-react'
import type { HelpdeskColaboradorSistemasDto } from '../../services/helpdeskApi'

export function HelpdeskProyectoEquipoStrip({
  responsableNombre,
  colaboradores,
  onManage,
  disabled,
}: {
  responsableNombre: string
  colaboradores: HelpdeskColaboradorSistemasDto[]
  onManage: () => void
  disabled?: boolean
}) {
  const sinAsignar = responsableNombre === 'Sin asignar'

  return (
    <div
      className="mt-5 rounded-xl border border-neutral-100 bg-gradient-to-br from-neutral-50 via-white to-brand-tint/25 px-3 py-3 dark:border-zinc-800 dark:from-zinc-950 dark:via-zinc-900 dark:to-brand-primary/5"
      data-testid="helpdesk-proyecto-equipo-strip"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">
          Personas en el proyecto
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={onManage}
          data-testid="helpdesk-mesa-equipo-open"
          className="text-xs font-semibold text-brand-primary underline-offset-2 hover:underline disabled:opacity-60"
        >
          Gestionar equipo
        </button>
      </div>

      {sinAsignar && colaboradores.length === 0 ? (
        <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
          Todavía no hay responsable asignado.
        </p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {!sinAsignar ? (
            <li
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-brand-primary/35 bg-brand-tint/40 px-2.5 py-1 text-xs font-semibold text-brand-primary dark:border-brand-primary/45 dark:bg-brand-primary/15"
              data-testid="helpdesk-equipo-responsable-chip"
            >
              <UserCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{responsableNombre}</span>
              <span className="font-normal text-brand-primary/80">· Responsable</span>
            </li>
          ) : null}
          {colaboradores.map((c) => (
            <li
              key={c.teamMemberId}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-heading dark:border-zinc-700 dark:bg-zinc-950"
              data-testid="helpdesk-equipo-colaborador-chip"
            >
              <UserCircle2 className="h-3.5 w-3.5 shrink-0 text-body-muted" aria-hidden />
              <span className="truncate">{c.nombre}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
