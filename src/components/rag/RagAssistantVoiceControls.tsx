import { Loader2, Mic, MicOff, ThumbsDown, ThumbsUp, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createSpeechRecognitionHandlers,
  isSpeechRecognitionSupported,
  plainTextForSpeech,
  speakSpanishText,
  stopSpeaking,
} from '../../lib/webSpeech'
import { submitAssistantInteractionFeedback, type AssistantUserFeedback } from '../../services/ragApi'

type RagAssistantMessageFeedbackProps = {
  interactionId: string
  feedback: AssistantUserFeedback | null | undefined
  onFeedback: (feedback: AssistantUserFeedback) => void
}

export function RagAssistantMessageFeedback({
  interactionId,
  feedback,
  onFeedback,
}: RagAssistantMessageFeedbackProps) {
  const [submitting, setSubmitting] = useState<AssistantUserFeedback | null>(null)

  async function handleFeedback(next: AssistantUserFeedback) {
    if (feedback || submitting) return
    setSubmitting(next)
    try {
      await submitAssistantInteractionFeedback(interactionId, next)
      onFeedback(next)
    } catch {
      // Silencioso: el feedback es best-effort para el piloto.
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="mt-2 flex items-center gap-1 border-t border-neutral-200/80 pt-2 dark:border-zinc-700">
      <button
        type="button"
        onClick={() => void handleFeedback('up')}
        disabled={Boolean(feedback) || submitting !== null}
        aria-label="Respuesta útil"
        title="Respuesta útil"
        className={`rounded-md p-1 transition-colors ${
          feedback === 'up'
            ? 'text-emerald-600'
            : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-zinc-800 dark:hover:text-gray-200'
        }`}
      >
        {submitting === 'up' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ThumbsUp className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={() => void handleFeedback('down')}
        disabled={Boolean(feedback) || submitting !== null}
        aria-label="Respuesta no útil"
        title="Respuesta no útil"
        className={`rounded-md p-1 transition-colors ${
          feedback === 'down'
            ? 'text-red-600'
            : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-zinc-800 dark:hover:text-gray-200'
        }`}
      >
        {submitting === 'down' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ThumbsDown className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  )
}

type RagAssistantSpeakButtonProps = {
  content: string
}

export function RagAssistantSpeakButton({ content }: RagAssistantSpeakButtonProps) {
  const [speaking, setSpeaking] = useState(false)

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return null
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (speaking) {
          stopSpeaking()
          setSpeaking(false)
          return
        }
        speakSpanishText(plainTextForSpeech(content), {
          onEnd: () => setSpeaking(false),
        })
        setSpeaking(true)
      }}
      aria-label={speaking ? 'Detener lectura' : 'Escuchar respuesta'}
      title={speaking ? 'Detener lectura' : 'Escuchar respuesta'}
      className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-zinc-800 dark:hover:text-gray-200"
    >
      {speaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
    </button>
  )
}

type RagAssistantMicButtonProps = {
  question: string
  onQuestionChange: (value: string) => void
  disabled?: boolean
}

export function RagAssistantMicButton({
  question,
  onQuestionChange,
  disabled = false,
}: RagAssistantMicButtonProps) {
  const [supported] = useState(() => isSpeechRecognitionSupported())
  const [listening, setListening] = useState(false)
  const controllerRef = useRef<ReturnType<typeof createSpeechRecognitionHandlers> | null>(null)
  const prefixRef = useRef('')

  useEffect(() => {
    if (!isSpeechRecognitionSupported()) return undefined

    controllerRef.current = createSpeechRecognitionHandlers({
      onTranscript: (text) => {
        if (!text) return
        const prefix = prefixRef.current.trim()
        onQuestionChange(prefix ? `${prefix} ${text}`.trim() : text)
      },
      onListeningChange: setListening,
    })

    return () => {
      controllerRef.current?.stop()
    }
  }, [onQuestionChange])

  const handleToggle = useCallback(() => {
    if (!controllerRef.current) return
    if (listening) {
      controllerRef.current.stop()
      return
    }
    prefixRef.current = question
    controllerRef.current.start()
  }, [listening, question])

  if (!supported) return null

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={disabled}
      aria-label={listening ? 'Detener dictado' : 'Dictar pregunta'}
      title={listening ? 'Detener dictado' : 'Dictar pregunta'}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-50 ${
        listening
          ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
          : 'border border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800'
      }`}
    >
      {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </button>
  )
}
