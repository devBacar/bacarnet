type BrowserSpeechRecognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: Event) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition

type WindowWithSpeech = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false
  const speechWindow = window as WindowWithSpeech
  return Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition)
}

function getSpeechRecognitionCtor(): BrowserSpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const speechWindow = window as WindowWithSpeech
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
}

export function pickSpanishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  const list = speechSynthesis.getVoices()
  return (
    list.find((voice) => voice.lang.toLowerCase().startsWith('es-ar')) ??
    list.find((voice) => voice.lang.toLowerCase().startsWith('es-')) ??
    list[0] ??
    null
  )
}

export function plainTextForSpeech(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[***REMOVED****_`>~]/g, '')
    .replace(/\n+/g, '. ')
    .trim()
}

export function speakSpanishText(
  text: string,
  callbacks?: {
    onEnd?: () => void
  },
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  const trimmed = text.trim()
  if (!trimmed) return

  speechSynthesis.getVoices()
  speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(trimmed)
  const voice = pickSpanishVoice()
  if (voice) utterance.voice = voice
  utterance.lang = voice?.lang ?? 'es-AR'
  utterance.rate = 1
  utterance.onend = () => callbacks?.onEnd?.()
  utterance.onerror = () => callbacks?.onEnd?.()
  speechSynthesis.speak(utterance)
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    speechSynthesis.cancel()
  }
}

export type SpeechRecognitionController = {
  start: () => void
  stop: () => void
}

export function createSpeechRecognitionHandlers(input: {
  onTranscript: (text: string, isFinal: boolean) => void
  onListeningChange: (listening: boolean) => void
}): SpeechRecognitionController | null {
  const Ctor = getSpeechRecognitionCtor()
  if (!Ctor) return null

  const recognition = new Ctor()
  recognition.lang = 'es-AR'
  recognition.interimResults = true
  recognition.continuous = false

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    let text = ''
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      text += event.results[index][0]?.transcript ?? ''
    }
    const isFinal = event.results[event.results.length - 1]?.isFinal ?? false
    input.onTranscript(text.trim(), isFinal)
  }

  recognition.onerror = () => {
    input.onListeningChange(false)
  }

  recognition.onend = () => {
    input.onListeningChange(false)
  }

  return {
    start: () => {
      input.onListeningChange(true)
      recognition.start()
    },
    stop: () => {
      recognition.stop()
      input.onListeningChange(false)
    },
  }
}
