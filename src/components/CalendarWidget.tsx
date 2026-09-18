import { Calendar, ExternalLink, Loader2, Unplug } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useGoogleWidgetsConnection } from '../hooks/useGoogleWidgetsConnection'
import {
  fetchWidgetCalendarEventDetail,
  fetchWidgetCalendarEvents,
  type WidgetCalendarEvent,
  type WidgetCalendarEventDetail,
} from '../services/googleWidgetsApi'
import {
  WidgetDetailLoading,
  WidgetDetailModal,
  WidgetExternalLinkButton,
} from './home/WidgetDetailModal'

function CalendarWidgetSkeleton() {
  return (
    <section className="card-minimal overflow-hidden dark:bg-zinc-900">
      <div className="animate-pulse p-4 lg:p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-neutral-100 dark:bg-zinc-800" />
          <div className="h-4 w-32 rounded bg-neutral-100 dark:bg-zinc-800" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-10 rounded-lg bg-neutral-100 dark:bg-zinc-800" />
          ))}
        </div>
      </div>
    </section>
  )
}

function formatEventRange(detail: WidgetCalendarEventDetail): string {
  const opts: Intl.DateTimeFormatOptions = {
    dateStyle: 'full',
    timeStyle: detail.allDay ? undefined : 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  }
  if (!detail.start) return 'Horario no disponible'
  const start = new Date(detail.start)
  if (detail.allDay) {
    return start.toLocaleDateString('es-AR', { dateStyle: 'full', timeZone: 'America/Argentina/Buenos_Aires' })
  }
  const startLabel = start.toLocaleString('es-AR', opts)
  if (!detail.end) return startLabel
  const end = new Date(detail.end)
  const endLabel = end.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  return `${startLabel} – ${endLabel}`
}

export function CalendarWidget() {
  const {
    connected,
    connecting,
    disconnecting,
    connect,
    disconnect,
    isGoogleReconnectError,
  } = useGoogleWidgetsConnection()
  const [events, setEvents] = useState<WidgetCalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [needsReconnect, setNeedsReconnect] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<WidgetCalendarEventDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      const items = await fetchWidgetCalendarEvents()
      setEvents(items)
      setNeedsReconnect(false)
    } catch (err) {
      if (isGoogleReconnectError(err)) {
        setNeedsReconnect(true)
        setEvents([])
      } else {
        console.error('Error al cargar eventos de Calendar:', err)
      }
    } finally {
      setLoading(false)
    }
  }, [isGoogleReconnectError])

  useEffect(() => {
    if (connected !== true) return
    void loadEvents()
  }, [connected, loadEvents])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      setDetailError(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)
    setDetail(null)
    void fetchWidgetCalendarEventDetail(selectedId)
      .then((event) => {
        if (!cancelled) setDetail(event)
      })
      .catch((err) => {
        if (!cancelled) {
          setDetailError(err instanceof Error ? err.message : 'No se pudo cargar el evento')
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const closeModal = () => setSelectedId(null)

  const showConnect = connected === false || needsReconnect
  const statusLoading = connected === null

  const todayLabel = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })

  if (connected === true && !showConnect && loading) {
    return <CalendarWidgetSkeleton />
  }

  return (
    <>
      <section className="card-minimal overflow-hidden dark:bg-zinc-900">
        <div className="p-4 lg:p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-primary">
              <Calendar className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-neutral-900 dark:text-gray-100">
                Google Calendar
              </p>
              <p className="truncate text-xs capitalize text-neutral-500 dark:text-gray-400">
                {todayLabel}
              </p>
            </div>
          </div>

          {statusLoading ? (
            <p className="mb-4 text-sm text-neutral-500 dark:text-zinc-400">
              Comprobando conexión...
            </p>
          ) : showConnect ? (
            <div className="mb-4">
              <p className="mb-3 text-sm text-neutral-500 dark:text-zinc-400">
                {needsReconnect
                  ? 'Tu conexión con Google venció o fue revocada. Volvé a conectar para ver tu agenda.'
                  : 'Conectá tu cuenta de Google para ver tus eventos de hoy.'}
              </p>
              <button
                type="button"
                onClick={() => void connect()}
                disabled={connecting}
                className="inline-flex w-full items-center justify-center rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 transition-colors hover:border-brand-primary/30 hover:bg-neutral-50 hover:text-brand-primary disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-100 dark:hover:border-brand-primary/40 dark:hover:bg-zinc-700 dark:hover:text-brand-primary"
              >
                {connecting ? 'Conectando...' : 'Conectar Google'}
              </button>
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-zinc-400">
              No hay eventos programados para hoy
            </p>
          ) : (
            <ul className="space-y-2.5">
              {events.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(event.id)}
                    className="flex w-full items-start gap-3 rounded-lg border border-neutral-100 bg-neutral-50/80 px-3 py-2 text-left transition-colors hover:border-brand-primary/25 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 dark:border-zinc-800 dark:bg-zinc-800/40 dark:hover:bg-zinc-800/70"
                    data-testid="calendar-widget-item"
                  >
                    <span className="shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-brand-primary">
                      {event.startTime}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-neutral-800 dark:text-gray-200">
                      {event.summary}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex gap-2">
            <a
              href="https://calendar.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 transition-colors hover:border-brand-primary/30 hover:bg-neutral-50 hover:text-brand-primary dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-100 dark:hover:border-brand-primary/40 dark:hover:bg-zinc-700 dark:hover:text-brand-primary"
            >
              Abrir Calendar
              <ExternalLink className="h-4 w-4 shrink-0" />
            </a>
            {connected === true && !showConnect ? (
              <button
                type="button"
                onClick={() => void disconnect()}
                disabled={disconnecting}
                aria-label={disconnecting ? 'Desconectando Google' : 'Desconectar Google'}
                title={disconnecting ? 'Desconectando...' : 'Desconectar Google'}
                className="inline-flex h-[42px] w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {disconnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Unplug className="h-4 w-4" aria-hidden />
                )}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <WidgetDetailModal
        open={selectedId !== null}
        title="Evento"
        titleId="calendar-widget-modal-title"
        testId="calendar-widget-modal"
        onClose={closeModal}
        footer={
          detail?.calendarWebUrl ? (
            <WidgetExternalLinkButton href={detail.calendarWebUrl} label="Abrir en Calendar" />
          ) : (
            <WidgetExternalLinkButton href="https://calendar.google.com" label="Abrir Calendar" />
          )
        }
      >
        {detailLoading ? (
          <WidgetDetailLoading />
        ) : detailError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{detailError}</p>
        ) : detail ? (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Título</p>
              <p className="mt-1 text-sm font-medium text-heading" data-testid="calendar-modal-title">
                {detail.summary}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Cuándo</p>
              <p className="mt-1 text-sm text-body-muted">{formatEventRange(detail)}</p>
            </div>
            {detail.location ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Ubicación</p>
                <p className="mt-1 text-sm text-heading">{detail.location}</p>
              </div>
            ) : null}
            {detail.description ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Descripción</p>
                <pre
                  className="mt-2 whitespace-pre-wrap font-sans text-sm text-heading"
                  data-testid="calendar-modal-description"
                >
                  {detail.description}
                </pre>
              </div>
            ) : null}
            {detail.attendees.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Invitados</p>
                <ul className="mt-2 space-y-2">
                  {detail.attendees.map((attendee) => (
                    <li
                      key={`${attendee.email}-${attendee.responseStatus}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                    >
                      <span className="text-heading">
                        {attendee.displayName ?? attendee.email}
                        {attendee.displayName ? (
                          <span className="text-body-muted"> ({attendee.email})</span>
                        ) : null}
                      </span>
                      <span className="text-xs font-medium text-body-muted">{attendee.responseStatus}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <WidgetDetailLoading />
        )}
      </WidgetDetailModal>
    </>
  )
}
