import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import type { RagCitationDto, RagPendingActionDto } from '../services/ragApi'

export type RagChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: RagCitationDto[]
  latencyMs?: number
  error?: boolean
  interactionId?: string | null
  userFeedback?: 'up' | 'down' | null
  pendingActions?: RagPendingActionDto[]
  preparationFailures?: Array<{ ref: string; message: string; errorCode?: string }>
}

type RagAssistantSession = {
  messages: RagChatMessage[]
  open: boolean
}

const STORAGE_KEY = 'bacarnet-rag-assistant-v1'

function loadSession(): RagAssistantSession {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return { messages: [], open: false }
    const parsed = JSON.parse(raw) as RagAssistantSession
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      open: parsed.open === true,
    }
  } catch {
    return { messages: [], open: false }
  }
}

function saveSession(session: RagAssistantSession): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function openRagAssistantSession(): void {
  const session = loadSession()
  saveSession({ ...session, open: true })
}

type RagAssistantContextValue = {
  visible: boolean
  setVisible: (visible: boolean) => void
  open: boolean
  openPanel: () => void
  closePanel: () => void
  minimizePanel: () => void
  messages: RagChatMessage[]
  appendMessage: (message: RagChatMessage) => void
  replaceLastAssistant: (message: RagChatMessage) => void
  updateMessage: (messageId: string, patch: Partial<RagChatMessage>) => void
  clearMessages: () => void
}

const RagAssistantContext = createContext<RagAssistantContextValue | null>(null)

export function RagAssistantProvider({
  children,
  pilotAccess,
}: {
  children: ReactNode
  pilotAccess: boolean
}) {
  const [session, setSession] = useState<RagAssistantSession>(() => loadSession())
  const location = useLocation()

  useEffect(() => {
    saveSession(session)
  }, [session])

  useEffect(() => {
    setSession(loadSession())
  }, [location.pathname])

  const visible = pilotAccess

  const setVisible = useCallback((_visible: boolean) => {
    // Reservado por si en el futuro el acceso piloto cambia en caliente.
  }, [])

  const openPanel = useCallback(() => {
    setSession((prev) => ({ ...prev, open: true }))
  }, [])

  const closePanel = useCallback(() => {
    setSession({ messages: [], open: false })
  }, [])

  const minimizePanel = useCallback(() => {
    setSession((prev) => ({ ...prev, open: false }))
  }, [])

  const appendMessage = useCallback((message: RagChatMessage) => {
    setSession((prev) => ({
      ...prev,
      messages: [...prev.messages, message],
    }))
  }, [])

  const replaceLastAssistant = useCallback((message: RagChatMessage) => {
    setSession((prev) => {
      const next = [...prev.messages]
      const lastAssistant = [...next].reverse().findIndex((m) => m.role === 'assistant')
      if (lastAssistant >= 0) {
        const index = next.length - 1 - lastAssistant
        next[index] = message
      } else {
        next.push(message)
      }
      return { ...prev, messages: next }
    })
  }, [])

  const updateMessage = useCallback((messageId: string, patch: Partial<RagChatMessage>) => {
    setSession((prev) => ({
      ...prev,
      messages: prev.messages.map((message) =>
        message.id === messageId ? { ...message, ...patch } : message,
      ),
    }))
  }, [])

  const clearMessages = useCallback(() => {
    setSession((prev) => ({ ...prev, messages: [] }))
  }, [])

  const value = useMemo(
    () => ({
      visible,
      setVisible,
      open: session.open,
      openPanel,
      closePanel,
      minimizePanel,
      messages: session.messages,
      appendMessage,
      replaceLastAssistant,
      updateMessage,
      clearMessages,
    }),
    [
      visible,
      setVisible,
      session.open,
      session.messages,
      openPanel,
      closePanel,
      minimizePanel,
      appendMessage,
      replaceLastAssistant,
      updateMessage,
      clearMessages,
    ],
  )

  return <RagAssistantContext.Provider value={value}>{children}</RagAssistantContext.Provider>
}

export function useRagAssistant(): RagAssistantContextValue {
  const ctx = useContext(RagAssistantContext)
  if (!ctx) {
    throw new Error('useRagAssistant debe usarse dentro de RagAssistantProvider')
  }
  return ctx
}

export function useOptionalRagAssistant(): RagAssistantContextValue | null {
  return useContext(RagAssistantContext)
}
