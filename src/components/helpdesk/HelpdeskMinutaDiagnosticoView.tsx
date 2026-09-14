import type { ReactNode } from 'react'
import type { HelpdeskMinutaDiagnostico, HelpdeskMinutaVeredicto } from '../../types/helpdeskMinutaDiagnostico'
import { formatHelpdeskDateTime } from './helpdeskUi'

function veredictoBadgeClass(veredicto: HelpdeskMinutaVeredicto): string {
  switch (veredicto) {
    case 'Viable':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200'
    case 'Viable con condiciones':
      return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200'
    case 'No viable':
      return 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200'
    default:
      return 'border-neutral-200 bg-neutral-50 text-neutral-700'
  }
}

function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-neutral-100 bg-neutral-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
      <h4 className="text-sm font-semibold text-heading">{title}</h4>
      <div className="mt-3 space-y-3 text-sm">{children}</div>
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-heading">{value}</p>
    </div>
  )
}

export function HelpdeskMinutaDiagnosticoView({
  minuta,
  areaNombre,
  legacyMinutaTexto,
  legacyMinutaMeta,
}: {
  minuta: HelpdeskMinutaDiagnostico
  areaNombre: string
  legacyMinutaTexto?: string | null
  legacyMinutaMeta?: string | null
}) {
  return (
    <div className="space-y-4" data-testid="helpdesk-minuta-diagnostico-view">
      <Section title="1. Datos de identificación">
        <Field label="Área evaluada" value={areaNombre} />
        <Field label="Fecha" value={minuta.fecha} />
        <Field label="Facilitador" value={minuta.facilitador} />
        <Field label="Participantes" value={minuta.participantes} />
      </Section>

      <Section title="2. Contexto y objetivos">
        <Field label="Objetivo de la sesión" value={minuta.objetivoSesion} />
        <Field label="Alcance" value={minuta.alcance} />
      </Section>

      <Section title="3. Mapeo de procesos actuales">
        {minuta.procesosEvaluados.map((proceso, index) => (
          <div
            key={`${proceso.procesoEvaluado}-${index}`}
            className="rounded-md border border-neutral-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <p className="font-medium text-heading">{proceso.procesoEvaluado}</p>
            <Field label="Descripción breve" value={proceso.descripcionBreve} />
            <Field label="Problemas identificados" value={proceso.problemasIdentificados} />
            <Field label="Métricas actuales" value={proceso.metricasActuales} />
          </div>
        ))}
      </Section>

      <Section title="4. Oportunidades y proyectos potenciales">
        {minuta.iniciativasPropuestas.map((ini, index) => (
          <div
            key={`${ini.nombre}-${index}`}
            className="rounded-md border border-neutral-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-heading">{ini.nombre}</p>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${veredictoBadgeClass(ini.veredicto)}`}
              >
                {ini.veredicto}
              </span>
            </div>
            <Field label="Beneficio esperado" value={ini.beneficioEsperado} />
            <Field label="Recursos requeridos" value={ini.recursosRequeridos} />
            <p className="mt-2 text-xs text-body-muted">
              Impacto {ini.impactoEstimado} · Factibilidad {ini.factibilidad} · Costo/esfuerzo{' '}
              {ini.costoEsfuerzo} · Urgencia {ini.urgencia}
            </p>
          </div>
        ))}
      </Section>

      <Section title="6. Acuerdos y próximos pasos">
        <Field label="Proyectos aprobados" value={minuta.proyectosAprobados} />
        <Field label="Responsables" value={minuta.responsables} />
        <Field label="Acciones inmediatas" value={minuta.accionesInmediatas} />
        <Field label="Fecha de seguimiento" value={minuta.fechaSeguimiento ?? ''} />
      </Section>

      {minuta.autorNombre || minuta.updatedAt ? (
        <p className="text-xs text-body-muted">
          {minuta.autorNombre ? `${minuta.autorNombre}` : ''}
          {minuta.updatedAt ? ` · ${formatHelpdeskDateTime(minuta.updatedAt)}` : ''}
        </p>
      ) : null}

      {legacyMinutaTexto?.trim() ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900/40 dark:bg-amber-950/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
            Minuta anterior (formato libre)
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-heading">{legacyMinutaTexto}</p>
          {legacyMinutaMeta ? (
            <p className="mt-2 text-xs text-body-muted">{legacyMinutaMeta}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
