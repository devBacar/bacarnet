import {
  Loader2,
  Minus,
  SendHorizontal,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRagAssistant } from '../../context/RagAssistantContext'
import {
  askRagPilot,
  cancelAssistantAction,
  confirmAssistantAction,
  fetchRagStatus,
  isRegulatoryRagError,
  type RagCitationDto,
  type RagAssistantUiConfig,
  type RagPendingActionDto,
} from '../../services/ragApi'
import { RagAssistantActionCard } from './RagAssistantActionCard'
import { RagAssistantMarkdown } from './RagAssistantMarkdown'
import {
  RagAssistantMessageFeedback,
  RagAssistantMicButton,
  RagAssistantSpeakButton,
} from './RagAssistantVoiceControls'

const DEFAULT_ASSISTANT_UI: RagAssistantUiConfig = {
  title: 'Asistente BacarNet',
  welcomeMessage:
    'Podés preguntar por el contenido de tus documentos, por inventario de tus áreas, o pedirme que prepare un correo o un evento de calendario.',
  accessibleAreaLabels: [],
}

function newMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function CitationsList({ citations }: { citations: RagCitationDto[] }) {
  if (citations.length === 0) return null
  return (
    <ul className="mt-2 space-y-1 border-t border-neutral-200/80 pt-2 text-xs text-brand-muted dark:border-zinc-700">
      {citations.map((citation, index) => (
        <li key={`${citation.fileId}-${citation.chunkIndex}`}>
          [{index + 1}]{' '}
          {citation.webViewLink ? (
            <a
              href={citation.webViewLink}
              target="_blank"
              rel="noreferrer"
              className="text-brand-primary hover:underline"
            >
              {citation.fileName}
            </a>
          ) : (
            citation.fileName
          )}
        </li>
      ))}
    </ul>
  )
}

export function RagAssistantWidget() {
  const {
    visible,
    open,
    openPanel,
    closePanel,
    minimizePanel,
    messages,
    appendMessage,
    updateMessage,
  } = useRagAssistant()

  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [confirmingActionId, setConfirmingActionId] = useState<string | null>(null)
  const [assistantUi, setAssistantUi] = useState<RagAssistantUiConfig>(DEFAULT_ASSISTANT_UI)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!visible) return
    void fetchRagStatus()
      .then((status) => {
        if (status.assistant) setAssistantUi(status.assistant)
      })
      .catch(() => {
        // Mantener defaults si falla el status.
      })
  }, [visible])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, asking, confirmingActionId])

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 180)
    }
  }, [open])

  if (!visible) return null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = question.trim()
    if (trimmed.length < 4 || asking) return

    setQuestion('')
    setAsking(true)
    appendMessage({ id: newMessageId(), role: 'user', content: trimmed })

    const history = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }))

    try {
      const result = await askRagPilot(trimmed, history)
      appendMessage({
        id: newMessageId(),
        role: 'assistant',
        content: result.answer,
        citations: result.citations,
        latencyMs: result.latencyMs,
        interactionId: result.interactionId ?? null,
        pendingActions: result.pendingActions ?? [],
        preparationFailures: result.preparationFailures ?? [],
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Consulta fallida'
      const interactionId =
        err instanceof Error
          ? (err as Error & { interactionId?: string | null }).interactionId ?? null
          : null
      appendMessage({
        id: newMessageId(),
        role: 'assistant',
        content: message,
        error: isRegulatoryRagError(message),
        interactionId,
      })
    } finally {
      setAsking(false)
    }
  }

  async function handleConfirmAction(
    messageId: string,
    pendingAction: RagPendingActionDto,
    previousContent: string,
    allPendingActions: RagPendingActionDto[],
  ) {
    setConfirmingActionId(pendingAction.id)
    try {
      const result = await confirmAssistantAction(pendingAction.id)
      updateMessage(messageId, {
        content: `${previousContent}\n\n${result.message}`.trim(),
        pendingActions: allPendingActions.map((action) =>
          action.id === pendingAction.id ? { ...action, status: 'confirmed' as const } : action,
        ),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo ejecutar la acción'
      updateMessage(messageId, {
        content: `${previousContent}\n\nError: ${message}`.trim(),
      })
    } finally {
      setConfirmingActionId(null)
    }
  }

  async function handleCancelAction(
    messageId: string,
    pendingAction: RagPendingActionDto,
    previousContent: string,
    allPendingActions: RagPendingActionDto[],
  ) {
    setConfirmingActionId(pendingAction.id)
    try {
      await cancelAssistantAction(pendingAction.id)
      updateMessage(messageId, {
        content: previousContent,
        pendingActions: allPendingActions.map((action) =>
          action.id === pendingAction.id ? { ...action, status: 'cancelled' as const } : action,
        ),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cancelar la acción'
      updateMessage(messageId, {
        content: `${previousContent}\n\nError: ${message}`.trim(),
      })
    } finally {
      setConfirmingActionId(null)
    }
  }

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={openPanel}
          className="rag-assistant-fab fixed bottom-6 right-6 z-[45] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
          aria-label={`Abrir ${assistantUi.title}`}
        >
          <Sparkles className="h-6 w-6" aria-hidden />
          <span className="sr-only">{assistantUi.title}</span>
        </button>
      ) : null}

      <div
        className={`rag-assistant-panel fixed z-[45] flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 ${
          open ? 'rag-assistant-panel-open' : 'pointer-events-none opacity-0'
        }`}
        role="dialog"
        aria-label={assistantUi.title}
        aria-hidden={!open}
      >
        <header className="flex items-center justify-between gap-2 bg-brand-primary px-4 py-3 text-white">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles className="h-5 w-5 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{assistantUi.title}</p>
              <p className="truncate text-xs text-white/80">Documentos, correo y calendario</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={minimizePanel}
              className="rounded-lg p-1.5 hover:bg-white/10"
              aria-label="Minimizar"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={closePanel}
              className="rounded-lg p-1.5 hover:bg-white/10"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="rag-assistant-messages flex-1 space-y-3 overflow-y-auto overflow-x-hidden bg-neutral-50 p-4 dark:bg-zinc-950">
          {messages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-sm text-brand-muted dark:border-zinc-700 dark:bg-zinc-900">
              <p className="font-medium text-heading">Hola, ¿en qué puedo ayudarte?</p>
              <p className="mt-1">{assistantUi.welcomeMessage}</p>
            </div>
          ) : null}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`rag-assistant-message max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  message.role === 'user'
                    ? 'bg-brand-primary text-white'
                    : message.error
                      ? 'border border-red-200 bg-red-50 text-red-900'
                      : 'border border-neutral-200 bg-white text-brand-body dark:border-zinc-700 dark:bg-zinc-900'
                }`}
              >
                {message.role === 'assistant' ? (
                  <>
                    <div className="mb-1 flex justify-end">
                      <RagAssistantSpeakButton content={message.content} />
                    </div>
                    <RagAssistantMarkdown content={message.content} />
                  </>
                ) : (
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>
                )}
                {message.preparationFailures && message.preparationFailures.length > 0 ? (
                  <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50 p-2 text-xs text-orange-950 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-100">
                    <p className="font-semibold">Algunas acciones no se pudieron preparar</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4">
                      {message.preparationFailures.map((failure) => (
                        <li key={failure.ref}>{failure.message}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {message.pendingActions?.map((pendingAction, index) => (
                  <RagAssistantActionCard
                    key={pendingAction.id}
                    pendingAction={pendingAction}
                    confirming={confirmingActionId === pendingAction.id}
                    label={
                      (message.pendingActions?.length ?? 0) > 1
                        ? `${pendingAction.type === 'email' ? 'Correo' : 'Evento'} ${index + 1} de ${message.pendingActions?.length ?? 0}`
                        : undefined
                    }
                    onConfirm={() =>
                      void handleConfirmAction(
                        message.id,
                        pendingAction,
                        message.content,
                        message.pendingActions ?? [],
                      )
                    }
                    onCancel={() =>
                      void handleCancelAction(
                        message.id,
                        pendingAction,
                        message.content,
                        message.pendingActions ?? [],
                      )
                    }
                  />
                ))}
                {message.citations ? <CitationsList citations={message.citations} /> : null}
                {message.role === 'assistant' && message.interactionId ? (
                  <RagAssistantMessageFeedback
                    interactionId={message.interactionId}
                    feedback={message.userFeedback}
                    onFeedback={(feedback) =>
                      updateMessage(message.id, { userFeedback: feedback })
                    }
                  />
                ) : null}
                {message.latencyMs ? (
                  <p className="mt-1 text-[10px] opacity-60">{Math.round(message.latencyMs / 1000)}s</p>
                ) : null}
              </div>
            </div>
          ))}

          {asking ? (
            <div className="flex items-center gap-2 text-sm text-brand-muted">
              <Loader2 className="h-4 w-4 animate-spin text-brand-primary" />
              Pensando…
            </div>
          ) : null}
        </div>

        <form
          onSubmit={handleSubmit}
          className="border-t border-neutral-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="flex items-end gap-2">
            <RagAssistantMicButton
              question={question}
              onQuestionChange={setQuestion}
              disabled={asking}
            />
            <textarea
              ref={inputRef}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={2}
              placeholder="Escribí tu pregunta…"
              className="input-surface max-h-28 min-h-[44px] flex-1 resize-none rounded-xl px-3 py-2 text-sm input-brand-focus"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void handleSubmit(event)
                }
              }}
            />
            <button
              type="submit"
              disabled={asking || question.trim().length < 4}
              className="btn-primary inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl disabled:opacity-50"
              aria-label="Enviar"
            >
              {asking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SendHorizontal className="h-4 w-4" />
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
