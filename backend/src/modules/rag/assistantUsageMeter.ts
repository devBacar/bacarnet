import { RAG_GENERATION_MODEL } from './constants.js'
import { RAG_EMBEDDING_MODEL } from './embeddings.js'

/** Tarifas orientativas Vertex AI (USD). No son la factura real de Billing. */
export const ASSISTANT_USAGE_PRICING = {
  geminiModel: RAG_GENERATION_MODEL,
  geminiInputUsdPer1M: 0.15,
  geminiOutputUsdPer1M: 0.6,
  embeddingModel: RAG_EMBEDDING_MODEL,
  /** text-embedding-005 — aprox. USD por millón de caracteres facturables. */
  embeddingUsdPer1MChars: 0.025,
} as const

export type AssistantInteractionUsage = {
  source: 'measured' | 'estimated'
  geminiInputTokens: number
  geminiOutputTokens: number
  geminiCallCount: number
  embeddingBillableChars: number
  embeddingRequestCount: number
  estimatedCostUsd: number
}

export type AssistantUsageMeter = {
  recordGemini(input: { inputTokens: number; outputTokens: number; label?: string }): void
  recordEmbedding(input: { billableChars: number; requestCount?: number; label?: string }): void
  snapshot(): AssistantInteractionUsage
}

export function createAssistantUsageMeter(): AssistantUsageMeter {
  let geminiInputTokens = 0
  let geminiOutputTokens = 0
  let geminiCallCount = 0
  let embeddingBillableChars = 0
  let embeddingRequestCount = 0

  return {
    recordGemini({ inputTokens, outputTokens }) {
      geminiInputTokens += Math.max(0, inputTokens)
      geminiOutputTokens += Math.max(0, outputTokens)
      geminiCallCount += 1
    },
    recordEmbedding({ billableChars, requestCount = 1 }) {
      embeddingBillableChars += Math.max(0, billableChars)
      embeddingRequestCount += Math.max(0, requestCount)
    },
    snapshot() {
      return {
        source: 'measured',
        geminiInputTokens,
        geminiOutputTokens,
        geminiCallCount,
        embeddingBillableChars,
        embeddingRequestCount,
        estimatedCostUsd: estimateCostUsd({
          geminiInputTokens,
          geminiOutputTokens,
          embeddingBillableChars,
        }),
      }
    },
  }
}

export function estimateCostUsd(input: {
  geminiInputTokens: number
  geminiOutputTokens: number
  embeddingBillableChars: number
}): number {
  const geminiInput =
    (input.geminiInputTokens / 1_000_000) * ASSISTANT_USAGE_PRICING.geminiInputUsdPer1M
  const geminiOutput =
    (input.geminiOutputTokens / 1_000_000) * ASSISTANT_USAGE_PRICING.geminiOutputUsdPer1M
  const embedding =
    (input.embeddingBillableChars / 1_000_000) * ASSISTANT_USAGE_PRICING.embeddingUsdPer1MChars
  return geminiInput + geminiOutput + embedding
}

const TOOL_HEURISTIC_INPUT_TOKENS: Record<string, number> = {
  orchestrated_summarize_batch: 12_000,
  orchestrated_extract_action_plan: 4_000,
  orchestrated_prepare_action_batch: 500,
  summarize_document: 8_000,
  search_document_content: 1_500,
  summarize_email: 2_000,
  corrections_context: 500,
}

export function estimateInteractionUsageFromLegacy(input: {
  question: string
  answer: string
  toolsUsed: string[]
}): AssistantInteractionUsage {
  const baseInput = Math.ceil(input.question.length / 4)
  const baseOutput = Math.ceil(input.answer.length / 4)
  let extraInput = 0
  let embeddingChars = 0

  for (const tool of input.toolsUsed) {
    extraInput += TOOL_HEURISTIC_INPUT_TOKENS[tool] ?? 300
    if (tool === 'search_document_content' || tool === 'corrections_context') {
      embeddingChars += Math.max(200, Math.ceil(input.question.length * 1.2))
    }
  }

  const geminiInputTokens = baseInput + extraInput
  const geminiOutputTokens = baseOutput + (input.toolsUsed.length > 0 ? 400 : 0)
  const geminiCallCount = Math.max(1, input.toolsUsed.filter((tool) => !tool.startsWith('orchestrated_')).length)

  return {
    source: 'estimated',
    geminiInputTokens,
    geminiOutputTokens,
    geminiCallCount,
    embeddingBillableChars: embeddingChars,
    embeddingRequestCount: embeddingChars > 0 ? 1 : 0,
    estimatedCostUsd: estimateCostUsd({
      geminiInputTokens,
      geminiOutputTokens,
      embeddingBillableChars: embeddingChars,
    }),
  }
}

export function resolveInteractionUsage(record: {
  question?: string
  answer?: string
  toolsUsed?: string[]
  usage?: Partial<AssistantInteractionUsage>
}): AssistantInteractionUsage {
  const stored = record.usage
  if (
    stored &&
    typeof stored.geminiInputTokens === 'number' &&
    typeof stored.estimatedCostUsd === 'number'
  ) {
    return {
      source: stored.source === 'measured' ? 'measured' : 'estimated',
      geminiInputTokens: stored.geminiInputTokens,
      geminiOutputTokens: stored.geminiOutputTokens ?? 0,
      geminiCallCount: stored.geminiCallCount ?? 0,
      embeddingBillableChars: stored.embeddingBillableChars ?? 0,
      embeddingRequestCount: stored.embeddingRequestCount ?? 0,
      estimatedCostUsd: stored.estimatedCostUsd,
    }
  }

  return estimateInteractionUsageFromLegacy({
    question: typeof record.question === 'string' ? record.question : '',
    answer: typeof record.answer === 'string' ? record.answer : '',
    toolsUsed: Array.isArray(record.toolsUsed)
      ? record.toolsUsed.filter((item): item is string => typeof item === 'string')
      : [],
  })
}

export type AssistantToolCategory =
  | 'semantic_search'
  | 'summarize'
  | 'gmail_read'
  | 'email_prepare'
  | 'calendar'
  | 'inventory'
  | 'audit'
  | 'orchestration'
  | 'other'

const TOOL_CATEGORY_MAP: Record<string, AssistantToolCategory> = {
  search_document_content: 'semantic_search',
  summarize_document: 'summarize',
  orchestrated_summarize_batch: 'summarize',
  orchestrated_reuse_summaries: 'summarize',
  list_inbox_today: 'gmail_read',
  orchestrated_list_inbox_today: 'gmail_read',
  search_emails: 'gmail_read',
  summarize_email: 'gmail_read',
  prepare_email_draft: 'email_prepare',
  orchestrated_prepare_email: 'email_prepare',
  prepare_calendar_event: 'calendar',
  orchestrated_prepare_calendar: 'calendar',
  orchestrated_prepare_action_batch: 'calendar',
  list_calendar_events: 'calendar',
  find_calendar_free_slots: 'calendar',
  list_accessible_files: 'inventory',
  orchestrated_list_files: 'inventory',
  get_inventory_summary: 'inventory',
  query_audit_logs: 'audit',
  orchestrated_extract_action_plan: 'orchestration',
  corrections_context: 'orchestration',
}

export function categorizeToolUsage(toolName: string): AssistantToolCategory {
  return TOOL_CATEGORY_MAP[toolName] ?? 'other'
}

export const TOOL_CATEGORY_LABELS: Record<AssistantToolCategory, string> = {
  semantic_search: 'Búsqueda semántica',
  summarize: 'Resumen de documentos',
  gmail_read: 'Lectura de Gmail',
  email_prepare: 'Preparación de correo',
  calendar: 'Calendario / eventos',
  inventory: 'Inventario de archivos',
  audit: 'Auditoría',
  orchestration: 'Orquestación interna',
  other: 'Otras herramientas',
}
