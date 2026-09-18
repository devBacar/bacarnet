import type { HelpdeskMinutaSimple } from './helpdeskMinutaSimple'

function Block({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-heading">{value}</p>
    </div>
  )
}

export function HelpdeskMinutaSimpleView({ value }: { value: HelpdeskMinutaSimple }) {
  return (
    <div className="space-y-3" data-testid="helpdesk-minuta-simple-view">
      <Block label="Participantes" value={value.participantes} />
      <Block label="Análisis de la reunión" value={value.analisisConversacion} />
      <Block label="Procesos actuales" value={value.procesosActuales} />
      <Block label="Problemas detectados" value={value.problemasDetectados} />
      <Block label="Propuesta" value={value.propuesta} />
      <Block label="Próximos pasos" value={value.proximosPasos} />
    </div>
  )
}
