import type { HelpdeskMinutaSimple } from './helpdeskMinutaSimple'

const inputClass =
  'input-brand-focus mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-heading dark:border-zinc-700 dark:bg-zinc-950'
const textareaClass = `${inputClass} min-h-[5rem] resize-y`

function SectionDivider({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-t border-neutral-200 pt-4 dark:border-zinc-700">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-primary">{title}</p>
      {subtitle ? <p className="mt-0.5 text-xs text-body-muted">{subtitle}</p> : null}
    </div>
  )
}

export function HelpdeskMinutaSimpleForm({
  value,
  onChange,
  disabled,
}: {
  value: HelpdeskMinutaSimple
  onChange: (next: HelpdeskMinutaSimple) => void
  disabled?: boolean
}) {
  const patch = (partial: Partial<HelpdeskMinutaSimple>) => onChange({ ...value, ...partial })

  return (
    <div className="space-y-4" data-testid="helpdesk-minuta-simple-form">
      <p className="text-sm text-body-muted">
        Primero documentá el diagnóstico de la reunión; después la propuesta de mejora.
      </p>

      <label className="block text-sm font-medium text-heading">
        ¿Quién participó?
        <textarea
          disabled={disabled}
          value={value.participantes}
          onChange={(e) => patch({ participantes: e.target.value })}
          placeholder="Nombres o roles (opcional)"
          rows={2}
          className={textareaClass}
        />
      </label>

      <SectionDivider title="Diagnóstico" subtitle="Qué se analizó y cómo está hoy el área" />

      <label className="block text-sm font-medium text-heading">
        Análisis de lo conversado
        <textarea
          disabled={disabled}
          value={value.analisisConversacion}
          onChange={(e) => patch({ analisisConversacion: e.target.value })}
          placeholder="Temas tratados, hallazgos y conclusiones del intercambio"
          rows={4}
          className={textareaClass}
          data-testid="helpdesk-minuta-simple-analisis"
        />
      </label>

      <label className="block text-sm font-medium text-heading">
        Procesos actuales
        <textarea
          disabled={disabled}
          value={value.procesosActuales}
          onChange={(e) => patch({ procesosActuales: e.target.value })}
          placeholder="Cómo se trabaja hoy: flujos, herramientas, responsables clave"
          rows={3}
          className={textareaClass}
          data-testid="helpdesk-minuta-simple-procesos"
        />
      </label>

      <label className="block text-sm font-medium text-heading">
        Problemas o puntos a mejorar
        <textarea
          disabled={disabled}
          value={value.problemasDetectados}
          onChange={(e) => patch({ problemasDetectados: e.target.value })}
          placeholder="Dolores, riesgos, ineficiencias o gaps detectados en esos procesos"
          rows={3}
          className={textareaClass}
          data-testid="helpdesk-minuta-simple-problemas"
        />
      </label>

      <SectionDivider
        title="Propuesta"
        subtitle="Qué proyecto o mejora se propone a partir del diagnóstico"
      />

      <label className="block text-sm font-medium text-heading">
        Proyecto o mejora propuesta
        <input
          disabled={disabled}
          value={value.propuesta}
          onChange={(e) => patch({ propuesta: e.target.value })}
          placeholder="Iniciativa concreta que responde a los problemas identificados"
          className={inputClass}
          data-testid="helpdesk-minuta-simple-propuesta"
        />
      </label>

      <label className="block text-sm font-medium text-heading">
        Próximos pasos
        <textarea
          disabled={disabled}
          value={value.proximosPasos}
          onChange={(e) => patch({ proximosPasos: e.target.value })}
          placeholder="Acuerdos, responsables y fechas si las hay"
          rows={3}
          className={textareaClass}
          data-testid="helpdesk-minuta-simple-pasos"
        />
      </label>
    </div>
  )
}
