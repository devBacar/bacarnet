import { Plus, Trash2 } from 'lucide-react'
import type {
  HelpdeskMinutaDiagnostico,
  HelpdeskMinutaFactibilidad,
  HelpdeskMinutaImpacto,
  HelpdeskMinutaUrgenciaIniciativa,
  HelpdeskMinutaVeredicto,
} from '../../types/helpdeskMinutaDiagnostico'
import {
  emptyIniciativa,
  emptyProcesoEvaluado,
  inputDateToDisplay,
  reunionFechaToInputDate,
} from '../../types/helpdeskMinutaDiagnostico'

const inputClass =
  'input-brand-focus mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-heading dark:border-zinc-700 dark:bg-zinc-950'
const textareaClass = `${inputClass} resize-y min-h-[4.5rem]`

function SectionHeader({ title }: { title: string }) {
  return (
    <h4 className="border-b border-neutral-100 pb-2 text-sm font-semibold text-heading dark:border-zinc-800">
      {title}
    </h4>
  )
}

export function HelpdeskMinutaDiagnosticoForm({
  value,
  onChange,
  areaNombre,
  reunionFecha,
  disabled,
}: {
  value: HelpdeskMinutaDiagnostico
  onChange: (next: HelpdeskMinutaDiagnostico) => void
  areaNombre: string
  reunionFecha: string
  disabled?: boolean
}) {
  const defaultDateInput = reunionFechaToInputDate(reunionFecha)

  const patch = (partial: Partial<HelpdeskMinutaDiagnostico>) => {
    onChange({ ...value, ...partial })
  }

  return (
    <div className="space-y-6" data-testid="helpdesk-minuta-diagnostico-form">
      <SectionHeader title="1. Datos de identificación" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Área evaluada</p>
          <p className="mt-1 text-sm font-medium text-heading">{areaNombre}</p>
        </div>
        <label className="block text-sm">
          Fecha
          <input
            type="date"
            disabled={disabled}
            value={
              /^\d{4}-\d{2}-\d{2}$/.test(value.fecha)
                ? value.fecha
                : defaultDateInput || value.fecha
            }
            onChange={(e) => patch({ fecha: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          Facilitador
          <input
            disabled={disabled}
            value={value.facilitador}
            onChange={(e) => patch({ facilitador: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          Participantes
          <textarea
            disabled={disabled}
            value={value.participantes}
            onChange={(e) => patch({ participantes: e.target.value })}
            placeholder="Uno por línea o separados por comas"
            className={textareaClass}
          />
        </label>
      </div>

      <SectionHeader title="2. Contexto y objetivos" />
      <label className="block text-sm">
        Objetivo de la sesión
        <textarea
          disabled={disabled}
          value={value.objetivoSesion}
          onChange={(e) => patch({ objetivoSesion: e.target.value })}
          className={textareaClass}
        />
      </label>
      <label className="block text-sm">
        Alcance
        <textarea
          disabled={disabled}
          value={value.alcance}
          onChange={(e) => patch({ alcance: e.target.value })}
          className={textareaClass}
        />
      </label>

      <SectionHeader title="3. Mapeo de procesos actuales" />
      <div className="space-y-4">
        {value.procesosEvaluados.map((proceso, index) => (
          <div
            key={`proceso-${index}`}
            className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-950/40"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">
                Proceso {index + 1}
              </p>
              {value.procesosEvaluados.length > 1 ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    patch({
                      procesosEvaluados: value.procesosEvaluados.filter((_, i) => i !== index),
                    })
                  }
                  className="inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-300"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Quitar
                </button>
              ) : null}
            </div>
            <label className="block text-sm">
              Proceso evaluado
              <input
                disabled={disabled}
                value={proceso.procesoEvaluado}
                onChange={(e) => {
                  const next = [...value.procesosEvaluados]
                  next[index] = { ...proceso, procesoEvaluado: e.target.value }
                  patch({ procesosEvaluados: next })
                }}
                className={inputClass}
              />
            </label>
            {(['descripcionBreve', 'problemasIdentificados', 'metricasActuales'] as const).map(
              (field) => (
                <label key={field} className="mt-3 block text-sm">
                  {field === 'descripcionBreve'
                    ? 'Descripción breve'
                    : field === 'problemasIdentificados'
                      ? 'Problemas identificados'
                      : 'Métricas actuales'}
                  <textarea
                    disabled={disabled}
                    value={proceso[field]}
                    onChange={(e) => {
                      const next = [...value.procesosEvaluados]
                      next[index] = { ...proceso, [field]: e.target.value }
                      patch({ procesosEvaluados: next })
                    }}
                    className={textareaClass}
                  />
                </label>
              ),
            )}
          </div>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            patch({ procesosEvaluados: [...value.procesosEvaluados, emptyProcesoEvaluado()] })
          }
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-brand-primary hover:bg-brand-tint/30 dark:border-zinc-700 dark:bg-zinc-950"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Agregar proceso evaluado
        </button>
      </div>

      <SectionHeader title="4. Oportunidades y proyectos potenciales" />
      <div className="space-y-4">
        {value.iniciativasPropuestas.map((ini, index) => (
          <div
            key={`ini-${index}`}
            className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-950/40"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">
                Iniciativa {index + 1}
              </p>
              {value.iniciativasPropuestas.length > 1 ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    patch({
                      iniciativasPropuestas: value.iniciativasPropuestas.filter((_, i) => i !== index),
                    })
                  }
                  className="inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-300"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Quitar
                </button>
              ) : null}
            </div>
            <label className="block text-sm">
              Nombre
              <input
                disabled={disabled}
                value={ini.nombre}
                onChange={(e) => {
                  const next = [...value.iniciativasPropuestas]
                  next[index] = { ...ini, nombre: e.target.value }
                  patch({ iniciativasPropuestas: next })
                }}
                className={inputClass}
              />
            </label>
            <label className="mt-3 block text-sm">
              Beneficio esperado
              <textarea
                disabled={disabled}
                value={ini.beneficioEsperado}
                onChange={(e) => {
                  const next = [...value.iniciativasPropuestas]
                  next[index] = { ...ini, beneficioEsperado: e.target.value }
                  patch({ iniciativasPropuestas: next })
                }}
                className={textareaClass}
              />
            </label>
            <label className="mt-3 block text-sm">
              Recursos requeridos
              <textarea
                disabled={disabled}
                value={ini.recursosRequeridos}
                onChange={(e) => {
                  const next = [...value.iniciativasPropuestas]
                  next[index] = { ...ini, recursosRequeridos: e.target.value }
                  patch({ iniciativasPropuestas: next })
                }}
                className={textareaClass}
              />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Impacto estimado"
                disabled={disabled}
                value={ini.impactoEstimado}
                options={['Alto', 'Medio', 'Bajo']}
                onChange={(v) => {
                  const next = [...value.iniciativasPropuestas]
                  next[index] = { ...ini, impactoEstimado: v as HelpdeskMinutaImpacto }
                  patch({ iniciativasPropuestas: next })
                }}
              />
              <SelectField
                label="Factibilidad"
                disabled={disabled}
                value={ini.factibilidad}
                options={['Alta', 'Media', 'Baja']}
                onChange={(v) => {
                  const next = [...value.iniciativasPropuestas]
                  next[index] = { ...ini, factibilidad: v as HelpdeskMinutaFactibilidad }
                  patch({ iniciativasPropuestas: next })
                }}
              />
              <SelectField
                label="Costo / esfuerzo"
                disabled={disabled}
                value={ini.costoEsfuerzo}
                options={['Alto', 'Medio', 'Bajo']}
                onChange={(v) => {
                  const next = [...value.iniciativasPropuestas]
                  next[index] = { ...ini, costoEsfuerzo: v as HelpdeskMinutaImpacto }
                  patch({ iniciativasPropuestas: next })
                }}
              />
              <SelectField
                label="Urgencia"
                disabled={disabled}
                value={ini.urgencia}
                options={['Crítico', 'Deseable', 'Posponible']}
                onChange={(v) => {
                  const next = [...value.iniciativasPropuestas]
                  next[index] = { ...ini, urgencia: v as HelpdeskMinutaUrgenciaIniciativa }
                  patch({ iniciativasPropuestas: next })
                }}
              />
              <SelectField
                label="Veredicto"
                disabled={disabled}
                value={ini.veredicto}
                options={['Viable', 'Viable con condiciones', 'No viable']}
                onChange={(v) => {
                  const next = [...value.iniciativasPropuestas]
                  next[index] = { ...ini, veredicto: v as HelpdeskMinutaVeredicto }
                  patch({ iniciativasPropuestas: next })
                }}
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            patch({ iniciativasPropuestas: [...value.iniciativasPropuestas, emptyIniciativa()] })
          }
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-brand-primary hover:bg-brand-tint/30 dark:border-zinc-700 dark:bg-zinc-950"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Agregar iniciativa
        </button>
      </div>

      <SectionHeader title="6. Acuerdos y próximos pasos" />
      <label className="block text-sm">
        Proyectos aprobados
        <textarea
          disabled={disabled}
          value={value.proyectosAprobados}
          onChange={(e) => patch({ proyectosAprobados: e.target.value })}
          className={textareaClass}
        />
      </label>
      <label className="block text-sm">
        Responsables
        <textarea
          disabled={disabled}
          value={value.responsables}
          onChange={(e) => patch({ responsables: e.target.value })}
          className={textareaClass}
        />
      </label>
      <label className="block text-sm">
        Acciones inmediatas
        <textarea
          disabled={disabled}
          value={value.accionesInmediatas}
          onChange={(e) => patch({ accionesInmediatas: e.target.value })}
          className={textareaClass}
        />
      </label>
      <label className="block text-sm">
        Fecha de seguimiento (opcional)
        <input
          type="date"
          disabled={disabled}
          value={value.fechaSeguimiento ?? ''}
          onChange={(e) =>
            patch({ fechaSeguimiento: e.target.value ? e.target.value : undefined })
          }
          className={inputClass}
        />
      </label>
    </div>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <label className="block text-sm">
      {label}
      <select
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  )
}

export function buildMinutaDiagnosticoPayload(
  draft: HelpdeskMinutaDiagnostico,
): HelpdeskMinutaDiagnostico {
  const fecha =
    /^\d{4}-\d{2}-\d{2}$/.test(draft.fecha) ? inputDateToDisplay(draft.fecha) : draft.fecha.trim()
  const fechaSeguimiento = draft.fechaSeguimiento?.trim()
    ? /^\d{4}-\d{2}-\d{2}$/.test(draft.fechaSeguimiento)
      ? inputDateToDisplay(draft.fechaSeguimiento)
      : draft.fechaSeguimiento.trim()
    : undefined

  return {
    ...draft,
    fecha,
    fechaSeguimiento,
  }
}

export function createEmptyMinutaDiagnostico(
  reunionFecha: string,
  facilitadorDefault = '',
): HelpdeskMinutaDiagnostico {
  const dateInput = reunionFechaToInputDate(reunionFecha)
  return {
    fecha: dateInput || reunionFecha,
    facilitador: facilitadorDefault,
    participantes: '',
    objetivoSesion: '',
    alcance: '',
    procesosEvaluados: [emptyProcesoEvaluado()],
    iniciativasPropuestas: [emptyIniciativa()],
    proyectosAprobados: '',
    responsables: '',
    accionesInmediatas: '',
  }
}
