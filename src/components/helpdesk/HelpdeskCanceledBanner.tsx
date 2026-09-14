export function HelpdeskCanceledBanner({
  motivo,
  canceladoPor,
}: {
  motivo?: string | null
  canceladoPor?: string | null
}) {
  return (
    <div
      className="relative z-20 -mx-1 mb-3 rounded-lg border-2 border-red-600 bg-red-600 px-4 py-2.5 text-center shadow-md"
      data-testid="helpdesk-proyecto-cancelado"
      role="status"
    >
      <p className="text-sm font-bold uppercase tracking-wide text-white">Proyecto cancelado</p>
      {motivo ? (
        <p className="mt-1 text-xs text-red-50">{motivo}</p>
      ) : null}
      {canceladoPor ? (
        <p className="mt-0.5 text-[10px] text-red-100">Decisión: {canceladoPor}</p>
      ) : null}
    </div>
  )
}
