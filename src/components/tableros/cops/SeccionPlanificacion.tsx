import type { CopsSnapshot } from '../../../services/copsApi'
import { entero, mesNombre, pct } from './formato'
import { claseNivel, nivelPctPublicado } from './umbrales'
import { KpiCops, SeccionCops } from './ui'

export function SeccionPlanificacion({ data }: { data: CopsSnapshot }) {
  const pl = data.planificacion
  const nivel = nivelPctPublicado(pl.pctPublicado)
  const ancho = Math.max(0, Math.min(100, pl.pctPublicado))

  return (
    <SeccionCops
      titulo="Planificación / SLA"
      subtitulo={`Próximo mes: ${mesNombre(pl.proximoMes)}.`}
    >
      <div className="mb-4 grid gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
          <p className="text-heading text-[15px] font-medium">
            {entero(pl.objetivosPublicados)} de {entero(pl.objetivosTotal)} objetivos publicados
          </p>
          <p className={`text-[18px] font-bold tabular-nums ${claseNivel(nivel)}`}>{pct(pl.pctPublicado)}</p>
        </div>
        <div
          className="surface-muted h-2.5 w-full overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={ancho}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Porcentaje de objetivos publicados"
        >
          <div
            className="h-full rounded-full bg-[var(--color-primary)] transition-[width]"
            style={{ width: `${ancho}%` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiCops etiqueta="Contratos SLA vigentes" valor={entero(data.sla.contratos)} />
        <KpiCops etiqueta="Horas vendidas del mes" valor={entero(data.sla.horasMes)} nota="Horas comprometidas en SLA" />
      </div>
    </SeccionCops>
  )
}
