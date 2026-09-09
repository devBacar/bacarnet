import { auth } from './firebase'

export type RagCitationDto = {
  fileId: string
  fileName: string
  webViewLink: string | null
  chunkIndex: number
  excerpt: string
}

export type RagIndexStateDto = {
  status?: string
  chunkCount?: number
  fileCount?: number
  lastIndexedAt?: string | null
  stats?: {
    filesSeen?: number
    filesIndexed?: number
    chunksWritten?: number
  }
}

export type RagAskResponse = {
  answer: string
  citations: RagCitationDto[]
  toolsUsed?: string[]
  pendingActions?: RagPendingActionDto[]
  preparationFailures?: Array<{ ref: string; message: string; errorCode?: string }>
  deferredActionRefs?: string[]
  preparationBatchId?: string | null
  pilotLabel: string
  governingAreaId: string
  latencyMs: number
  interactionId?: string | null
  regulatoryNotice: string | null
  impersonatedAs: string
}

export type AssistantActionType = 'email' | 'calendar_event' | 'calendar_cancel'

export type EmailActionPreview = {
  from: string
  to: string[]
  cc: string[]
  subject: string
  body: string
}

export type CalendarActionPreview = {
  organizer: string
  title: string
  description: string
  location: string | null
  startDateTime: string
  endDateTime: string
  timeZone: string
  attendees: string[]
  addGoogleMeet?: boolean
  calendarConflicts?: CalendarConflictPreview[]
  externalAttendees?: string[]
}

export type CalendarConflictPreview = {
  title: string
  start: string
  end: string
}

export type CalendarCancelActionPreview = {
  organizer: string
  eventId: string
  title: string
  startDateTime: string
  endDateTime: string
  timeZone: string
  attendees: string[]
}

export type RagPendingActionDto = {
  id: string
  type: AssistantActionType
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired'
  preview: EmailActionPreview | CalendarActionPreview | CalendarCancelActionPreview
  expiresAt: string
}

export type RagAssistantActionConfirmResponse = {
  ok: true
  actionId: string
  type: AssistantActionType
  message: string
  result: Record<string, unknown>
}

export type RagChatHistoryTurn = {
  role: 'user' | 'assistant'
  content: string
}

export type RagAssistantUiConfig = {
  title: string
  welcomeMessage: string
  accessibleAreaLabels: string[]
}

export type RagStatusResponse = {
  enabled: boolean
  canReindex?: boolean
  canQueryAudit?: boolean
  pilot: { governingAreaId: string; driveFolderId: string; label: string }
  excludedGoverningAreaIds: string[]
  excludedAreaLabels: Record<string, string>
  regulatoryMessage: string
  indexState: RagIndexStateDto | null
  reindexInProgress: boolean
  assistant?: RagAssistantUiConfig
}

export type RagReindexResponse = {
  ok: boolean
  latencyMs: number
  stats: RagIndexStateDto['stats'] & Record<string, unknown>
  verification: {
    ok: boolean
    violations: string[]
    cumplimientoViolations: string[]
  }
}

export type AssistantInteractionCategory = 'resolved' | 'could_not_answer' | 'broken'

export type AssistantInteractionListCategory = AssistantInteractionCategory | 'pending_dev_review'

export type AssistantDevReviewStatus = 'pending' | 'done'

export type AssistantUserFeedback = 'up' | 'down'

export type AssistantInteractionDto = {
  id: string
  userId: string
  userEmail: string
  question: string
  answer: string
  toolsUsed: string[]
  category: AssistantInteractionCategory
  latencyMs: number
  createdAt: string | null
  userFeedback?: AssistantUserFeedback | null
  userReported?: boolean
  userFeedbackAt?: string | null
  devReviewStatus?: AssistantDevReviewStatus | null
  devReviewNote?: string | null
  devReviewMarkedAt?: string | null
  devReviewMarkedBy?: string | null
  devReviewResolvedAt?: string | null
  devReviewResolvedBy?: string | null
}

export type AssistantInteractionsResponse = {
  interactions: AssistantInteractionDto[]
  category: AssistantInteractionListCategory
  count: number
}

export type AssistantUsageStatsResponse = {
  disclaimer: string
  pricing: {
    geminiModel: string
    geminiInputUsdPer1M: number
    geminiOutputUsdPer1M: number
    embeddingModel: string
    embeddingUsdPer1MChars: number
  }
  totals: {
    questions: number
    measuredInteractions: number
    estimatedInteractions: number
    currentMonthQuestions: number
    currentMonthEstimatedCostUsd: number
  }
  volume: {
    byUser: Array<{ userEmail: string; questions: number; estimatedCostUsd: number }>
    last14Days: Array<{ date: string; questions: number }>
    byWeek: Array<{ weekStart: string; questions: number }>
  }
  tools: {
    byCategory: Array<{ category: string; label: string; count: number }>
    byName: Array<{ toolName: string; count: number }>
  }
  monthlyHistory: Array<{ month: string; questions: number; estimatedCostUsd: number }>
  scannedInteractions: number
  generatedAt: string
}

async function idToken(): Promise<string> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('No autenticado')
  return token
}

async function authHeaders(): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${await idToken()}`,
    'Content-Type': 'application/json',
  }
}

async function parseApiResponse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & {
    error?: string
    code?: string
    areaLabel?: string
    interactionId?: string | null
  }
  if (!res.ok) {
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      const err = new Error(
        body.error ??
          'Algo salió mal en el servidor. Intentá de nuevo en unos segundos.',
      ) as Error & { interactionId?: string | null }
      err.interactionId = body.interactionId ?? null
      throw err
    }
    const detail = body.areaLabel ? ` (${body.areaLabel})` : ''
    const err = new Error(`${body.error ?? `Error ${res.status}`}${detail}`) as Error & {
      interactionId?: string | null
    }
    err.interactionId = body.interactionId ?? null
    throw err
  }
  return body
}

export async function fetchRagStatus(): Promise<RagStatusResponse> {
  const res = await fetch('/api/drive/rag/status', { headers: await authHeaders() })
  return parseApiResponse<RagStatusResponse>(res)
}

export async function askRagPilot(
  question: string,
  history: RagChatHistoryTurn[] = [],
): Promise<RagAskResponse> {
  const res = await fetch('/api/drive/ask', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ question, history }),
  })
  return parseApiResponse<RagAskResponse>(res)
}

export async function confirmAssistantAction(
  actionId: string,
): Promise<RagAssistantActionConfirmResponse> {
  const res = await fetch(`/api/drive/assistant/actions/${encodeURIComponent(actionId)}/confirm`, {
    method: 'POST',
    headers: await authHeaders(),
    body: '{}',
  })
  return parseApiResponse<RagAssistantActionConfirmResponse>(res)
}

export async function cancelAssistantAction(actionId: string): Promise<{ ok: true; actionId: string; status: 'cancelled' }> {
  const res = await fetch(`/api/drive/assistant/actions/${encodeURIComponent(actionId)}/cancel`, {
    method: 'POST',
    headers: await authHeaders(),
    body: '{}',
  })
  return parseApiResponse<{ ok: true; actionId: string; status: 'cancelled' }>(res)
}

export async function reindexRagPilot(): Promise<RagReindexResponse> {
  const res = await fetch('/api/drive/rag/reindex', {
    method: 'POST',
    headers: await authHeaders(),
    body: '{}',
  })
  return parseApiResponse<RagReindexResponse>(res)
}

export async function fetchAssistantUsageStats(): Promise<AssistantUsageStatsResponse> {
  const res = await fetch('/api/drive/rag/usage-stats', {
    headers: await authHeaders(),
  })
  return parseApiResponse<AssistantUsageStatsResponse>(res)
}

export async function updateAssistantInteractionDevReview(
  interactionId: string,
  input: { action: 'mark_pending' | 'mark_done' | 'clear'; note?: string },
): Promise<{ ok: true; interactionId: string; devReviewStatus: AssistantDevReviewStatus | null }> {
  const res = await fetch(
    `/api/drive/rag/interactions/${encodeURIComponent(interactionId)}/dev-review`,
    {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(input),
    },
  )
  return parseApiResponse(res)
}

export async function fetchAssistantInteractions(
  category: AssistantInteractionListCategory,
  limit = 40,
): Promise<AssistantInteractionsResponse> {
  const params = new URLSearchParams({ category, limit: String(limit) })
  const res = await fetch(`/api/drive/rag/interactions?${params.toString()}`, {
    headers: await authHeaders(),
  })
  return parseApiResponse<AssistantInteractionsResponse>(res)
}

export async function submitAssistantInteractionFeedback(
  interactionId: string,
  feedback: AssistantUserFeedback,
): Promise<{ ok: true; interactionId: string; feedback: AssistantUserFeedback; userReported: boolean }> {
  const res = await fetch(
    `/api/drive/rag/interactions/${encodeURIComponent(interactionId)}/feedback`,
    {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ feedback }),
    },
  )
  return parseApiResponse(res)
}

export function isRegulatoryRagError(message: string): boolean {
  return message.includes('Cumplimiento') || message.includes('regulatorios')
}
