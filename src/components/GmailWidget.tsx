import { ExternalLink, Mail } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useGoogleWidgetsConnection } from '../hooks/useGoogleWidgetsConnection'
import {
  fetchWidgetGmailMessageDetail,
  fetchWidgetGmailMessages,
  type WidgetGmailMessage,
  type WidgetGmailMessageDetail,
} from '../services/googleWidgetsApi'
import {
  WidgetDetailLoading,
  WidgetDetailModal,
  WidgetExternalLinkButton,
} from './home/WidgetDetailModal'

function formatMessageDate(iso: string | null): string {
  if (!iso) return 'Fecha no disponible'
  return new Date(iso).toLocaleString('es-AR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

export function GmailWidget() {
  const {
    connected,
    connecting,
    disconnecting,
    connect,
    disconnect,
    isGoogleReconnectError,
  } = useGoogleWidgetsConnection()
  const [emails, setEmails] = useState<WidgetGmailMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [needsReconnect, setNeedsReconnect] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<WidgetGmailMessageDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const loadEmails = useCallback(async () => {
    setLoading(true)
    try {
      const messages = await fetchWidgetGmailMessages()
      setEmails(messages)
      setNeedsReconnect(false)
    } catch (err) {
      if (isGoogleReconnectError(err)) {
        setNeedsReconnect(true)
        setEmails([])
      } else {
        console.error('Error al cargar correos de Gmail:', err)
      }
    } finally {
      setLoading(false)
    }
  }, [isGoogleReconnectError])

  useEffect(() => {
    if (connected !== true) return
    void loadEmails()
  }, [connected, loadEmails])

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
    void fetchWidgetGmailMessageDetail(selectedId)
      .then((message) => {
        if (!cancelled) setDetail(message)
      })
      .catch((err) => {
        if (!cancelled) {
          setDetailError(err instanceof Error ? err.message : 'No se pudo cargar el correo')
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
  const selectedPreview = emails.find((item) => item.id === selectedId)

  return (
    <>
      <section className="card-minimal overflow-hidden dark:bg-zinc-900">
        <div className="p-4 lg:p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-primary">
              <Mail className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold text-neutral-900 dark:text-gray-100">Gmail</p>
          </div>

          {statusLoading ? (
            <p className="mb-4 text-sm text-neutral-500 dark:text-zinc-400">
              Comprobando conexión...
            </p>
          ) : showConnect ? (
            <div className="mb-4">
              <p className="mb-3 text-sm text-neutral-500 dark:text-zinc-400">
                {needsReconnect
                  ? 'Tu conexión con Google venció o fue revocada. Volvé a conectar para ver tus correos.'
                  : 'Conectá tu cuenta de Google para ver tus correos sin leer.'}
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
          ) : loading ? (
            <p className="mb-4 text-sm text-neutral-500 dark:text-zinc-400">
              Cargando bandeja...
            </p>
          ) : emails.length === 0 ? (
            <p className="mb-4 text-sm text-neutral-500 dark:text-zinc-400">
              No tenés correos sin leer en Principal o Importantes.
            </p>
          ) : (
            <ul className="mb-4 space-y-3">
              {emails.map((email) => (
                <li
                  key={email.id}
                  className="min-w-0 border-b border-neutral-100 pb-3 last:border-b-0 last:pb-0 dark:border-zinc-800"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(email.id)}
                    className="w-full rounded-lg text-left transition-colors hover:bg-neutral-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 dark:hover:bg-zinc-800/50 px-1 py-0.5 -mx-1"
                    data-testid="gmail-widget-item"
                  >
                    <p className="truncate font-semibold text-neutral-900 dark:text-gray-100">
                      {email.from}
                    </p>
                    <p
                      className="line-clamp-2 text-sm leading-snug text-zinc-400 dark:text-zinc-500"
                      title={email.subject}
                      data-testid="gmail-message-subject"
                    >
                      {email.subject}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {connected === true && !showConnect ? (
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={disconnecting}
              className="mb-4 inline-flex w-full items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {disconnecting ? 'Desconectando...' : 'Desconectar Google'}
            </button>
          ) : null}

          <a
            href="https://mail.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 transition-colors hover:border-brand-primary/30 hover:bg-neutral-50 hover:text-brand-primary dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-100 dark:hover:border-brand-primary/40 dark:hover:bg-zinc-700 dark:hover:text-brand-primary"
          >
            Abrir Gmail
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </section>

      <WidgetDetailModal
        open={selectedId !== null}
        title="Correo"
        titleId="gmail-widget-modal-title"
        testId="gmail-widget-modal"
        onClose={closeModal}
        footer={
          detail?.gmailWebUrl ? (
            <WidgetExternalLinkButton href={detail.gmailWebUrl} label="Abrir en Gmail" />
          ) : null
        }
      >
        {detailLoading ? (
          <WidgetDetailLoading />
        ) : detailError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{detailError}</p>
        ) : detail ? (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">De</p>
              <p className="mt-1 text-sm text-heading" data-testid="gmail-modal-from">
                {detail.from}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Asunto</p>
              <p className="mt-1 text-sm font-medium text-heading" data-testid="gmail-modal-subject">
                {detail.subject}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Fecha</p>
              <p className="mt-1 text-sm text-body-muted">{formatMessageDate(detail.date)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Mensaje</p>
              {detail.bodyHtml ? (
                <div
                  className="prose prose-sm mt-2 max-w-none text-heading dark:prose-invert"
                  data-testid="gmail-modal-body"
                  dangerouslySetInnerHTML={{ __html: detail.bodyHtml }}
                />
              ) : (
                <pre
                  className="mt-2 whitespace-pre-wrap font-sans text-sm text-heading"
                  data-testid="gmail-modal-body"
                >
                  {detail.bodyText}
                </pre>
              )}
            </div>
          </div>
        ) : selectedPreview ? (
          <WidgetDetailLoading />
        ) : null}
      </WidgetDetailModal>
    </>
  )
}
