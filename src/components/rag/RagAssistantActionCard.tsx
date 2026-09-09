import type {
  AssistantActionType,
  CalendarActionPreview,
  CalendarCancelActionPreview,
  CalendarConflictPreview,
  EmailActionPreview,
} from '../../services/ragApi'

type RagAssistantActionCardProps = {
  pendingAction: {
    id: string
    type: AssistantActionType
    preview: EmailActionPreview | CalendarActionPreview | CalendarCancelActionPreview
    expiresAt: string
    status?: 'pending' | 'confirmed' | 'cancelled' | 'expired'
  }
  label?: string
  confirming: boolean
  onConfirm: () => void
  onCancel: () => void
}

function formatDateTime(value: string): string {
  const trimmed = value.trim()
  const floatingMatch = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)$/.exec(trimmed)
  if (floatingMatch) {
    const [datePart, timePart] = trimmed.split('T')
    const [year, month, day] = datePart.split('-').map(Number)
    const [hour, minute] = timePart.split(':').map(Number)
    const local = new Date(year, month - 1, day, hour, minute, 0)
    return local.toLocaleString('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function EmailPreview({ preview }: { preview: EmailActionPreview }) {
  return (
    <dl className="space-y-2 text-xs">
      <div>
        <dt className="font-semibold text-heading">De</dt>
        <dd className="text-brand-body">{preview.from}</dd>
      </div>
      <div>
        <dt className="font-semibold text-heading">Para</dt>
        <dd className="text-brand-body">{preview.to.join(', ')}</dd>
      </div>
      {preview.cc.length > 0 ? (
        <div>
          <dt className="font-semibold text-heading">CC</dt>
          <dd className="text-brand-body">{preview.cc.join(', ')}</dd>
        </div>
      ) : null}
      <div>
        <dt className="font-semibold text-heading">Asunto</dt>
        <dd className="text-brand-body">{preview.subject}</dd>
      </div>
      <div>
        <dt className="font-semibold text-heading">Mensaje</dt>
        <dd className="whitespace-pre-wrap rounded-lg bg-neutral-50 p-2 text-brand-body dark:bg-zinc-950">
          {preview.body}
        </dd>
      </div>
    </dl>
  )
}

function CalendarCancelPreview({ preview }: { preview: CalendarCancelActionPreview }) {
  return (
    <dl className="space-y-2 text-xs">
      <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-red-950 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-100">
        <p className="font-semibold">Vas a cancelar este evento del calendario</p>
        <p className="mt-1">
          Los invitados recibirán la notificación de cancelación al confirmar.
        </p>
      </div>
      <div>
        <dt className="font-semibold text-heading">Organizador</dt>
        <dd className="text-brand-body">{preview.organizer}</dd>
      </div>
      <div>
        <dt className="font-semibold text-heading">Título</dt>
        <dd className="text-brand-body">{preview.title}</dd>
      </div>
      <div>
        <dt className="font-semibold text-heading">Inicio</dt>
        <dd className="text-brand-body">{formatDateTime(preview.startDateTime)}</dd>
      </div>
      <div>
        <dt className="font-semibold text-heading">Fin</dt>
        <dd className="text-brand-body">{formatDateTime(preview.endDateTime)}</dd>
      </div>
      {preview.attendees.length > 0 ? (
        <div>
          <dt className="font-semibold text-heading">Invitados</dt>
          <dd className="text-brand-body">{preview.attendees.join(', ')}</dd>
        </div>
      ) : null}
    </dl>
  )
}

function CalendarPreview({ preview }: { preview: CalendarActionPreview }) {
  const conflicts = preview.calendarConflicts ?? []
  const planConflicts = conflicts.filter((conflict) =>
    conflict.title.includes('(otro evento de este pedido)'),
  )
  const calendarConflicts = conflicts.filter(
    (conflict) => !conflict.title.includes('(otro evento de este pedido)'),
  )
  return (
    <dl className="space-y-2 text-xs">
      {planConflicts.length > 0 ? (
        <div className="rounded-lg border border-orange-300 bg-orange-50 p-2 text-orange-950 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100">
          <p className="font-semibold">Conflicto con otro evento de este pedido</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {planConflicts.map((conflict: CalendarConflictPreview) => (
              <li key={`plan-${conflict.title}-${conflict.start}`}>
                Se superpone con «{conflict.title.replace(' (otro evento de este pedido)', '')}» (
                {conflict.start} – {conflict.end})
              </li>
            ))}
          </ul>
          <p className="mt-2">¿Confirmás igual o preferís otro horario?</p>
        </div>
      ) : null}
      {calendarConflicts.length > 0 ? (
        <div className="rounded-lg border border-orange-300 bg-orange-50 p-2 text-orange-950 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100">
          <p className="font-semibold">Conflicto de horario</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {calendarConflicts.map((conflict: CalendarConflictPreview) => (
              <li key={`cal-${conflict.title}-${conflict.start}`}>
                Ya tenés «{conflict.title}» ({conflict.start} – {conflict.end})
              </li>
            ))}
          </ul>
          <p className="mt-2">¿Confirmás igual o preferís otro horario?</p>
        </div>
      ) : null}
      {preview.externalAttendees && preview.externalAttendees.length > 0 ? (
        <div className="rounded-lg border border-amber-400 bg-amber-50 p-2 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-semibold">
            ⚠️ Incluye invitados externos: {preview.externalAttendees.join(', ')}
          </p>
        </div>
      ) : null}
      <div>
        <dt className="font-semibold text-heading">Organizador</dt>
        <dd className="text-brand-body">{preview.organizer}</dd>
      </div>
      <div>
        <dt className="font-semibold text-heading">Título</dt>
        <dd className="text-brand-body">{preview.title}</dd>
      </div>
      <div>
        <dt className="font-semibold text-heading">Inicio</dt>
        <dd className="text-brand-body">{formatDateTime(preview.startDateTime)}</dd>
      </div>
      <div>
        <dt className="font-semibold text-heading">Fin</dt>
        <dd className="text-brand-body">{formatDateTime(preview.endDateTime)}</dd>
      </div>
      {preview.location ? (
        <div>
          <dt className="font-semibold text-heading">Ubicación</dt>
          <dd className="text-brand-body">{preview.location}</dd>
        </div>
      ) : null}
      {preview.attendees.length > 0 ? (
        <div>
          <dt className="font-semibold text-heading">Invitados</dt>
          <dd className="text-brand-body">{preview.attendees.join(', ')}</dd>
        </div>
      ) : null}
      {preview.addGoogleMeet ? (
        <div>
          <dt className="font-semibold text-heading">Google Meet</dt>
          <dd className="text-brand-body">Se creará un enlace de videollamada al confirmar.</dd>
        </div>
      ) : null}
      {preview.description ? (
        <div>
          <dt className="font-semibold text-heading">Descripción</dt>
          <dd className="whitespace-pre-wrap rounded-lg bg-neutral-50 p-2 text-brand-body dark:bg-zinc-950">
            {preview.description}
          </dd>
        </div>
      ) : null}
    </dl>
  )
}

export function RagAssistantActionCard({
  pendingAction,
  label,
  confirming,
  onConfirm,
  onCancel,
}: RagAssistantActionCardProps) {
  const isPending = !pendingAction.status || pendingAction.status === 'pending'
  const expired = isPending && new Date(pendingAction.expiresAt).getTime() <= Date.now()
  const title =
    label ??
    (pendingAction.type === 'email'
      ? 'Borrador de correo'
      : pendingAction.type === 'calendar_cancel'
        ? 'Cancelación de evento'
        : 'Borrador de evento de calendario')

  return (
    <div
      className={`mt-3 rounded-xl border p-3 ${
        pendingAction.type === 'calendar_cancel'
          ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30'
          : 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30'
      }`}
    >
      <p
        className={`text-xs font-semibold uppercase tracking-wide ${
          pendingAction.type === 'calendar_cancel'
            ? 'text-red-900 dark:text-red-200'
            : 'text-amber-900 dark:text-amber-200'
        }`}
      >
        {title}
      </p>
      <p
        className={`mt-1 text-[11px] ${
          pendingAction.type === 'calendar_cancel'
            ? 'text-red-950/80 dark:text-red-100/80'
            : 'text-amber-950/80 dark:text-amber-100/80'
        }`}
      >
        {pendingAction.type === 'calendar_cancel'
          ? 'Revisá que sea el evento correcto antes de confirmar. Al confirmar se elimina del calendario y se notifica a los invitados.'
          : 'Revisá el borrador exacto antes de confirmar. Nada se envía ni se crea hasta que pulses el botón correspondiente.'}
      </p>

      <div className="mt-3">
        {pendingAction.type === 'email' ? (
          <EmailPreview preview={pendingAction.preview as EmailActionPreview} />
        ) : pendingAction.type === 'calendar_cancel' ? (
          <CalendarCancelPreview preview={pendingAction.preview as CalendarCancelActionPreview} />
        ) : (
          <CalendarPreview preview={pendingAction.preview as CalendarActionPreview} />
        )}
      </div>

      {pendingAction.status === 'confirmed' ? (
        <p className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          Acción confirmada y ejecutada.
        </p>
      ) : null}

      {pendingAction.status === 'cancelled' ? (
        <p className="mt-3 text-xs font-medium text-neutral-600 dark:text-neutral-300">
          Borrador cancelado.
        </p>
      ) : null}

      {isPending && !expired ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="btn-primary rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60"
          >
            {confirming
              ? 'Ejecutando…'
              : pendingAction.type === 'email'
                ? 'Enviar correo'
                : pendingAction.type === 'calendar_cancel'
                  ? 'Confirmar cancelación'
                  : 'Crear evento'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-white disabled:opacity-60 dark:border-zinc-600 dark:text-gray-200 dark:hover:bg-zinc-900"
          >
            Cancelar
          </button>
        </div>
      ) : null}

      {expired ? (
        <p className="mt-3 text-xs text-red-700 dark:text-red-300">
          Este borrador expiró. Pedile al asistente que lo prepare de nuevo.
        </p>
      ) : null}
    </div>
  )
}
