import type { Request, Response } from 'express'
import { getDrive } from '../../lib/google/driveClient.js'
import { logError } from '../../lib/log.js'
import { isSuperAdminUser } from '../auth/middleware.js'
import { userTouchesExcludedArea } from './chunkAccess.js'
import { getRagConfig } from './config.js'
import { getRagIndexState, loadRagCorpus } from './loadRagCorpus.js'
import {
  buildRegulatoryBlockResponse,
  isExcludedGoverningArea,
  questionReferencesExcludedArea,
} from './regulatoryArea.js'
import { resolveSearchSubject } from './resolveSearchSubject.js'
import { RAG_REGULATORY_ERROR_CODE } from './constants.js'
import { isPilotAccessAllowed } from './pilotAccess.js'
import { runRagAssistant, type RagConversationTurn } from './runRagAssistant.js'
import { resolveAccessibleAreaLabels } from './ragReadableLabels.js'
import { writeAssistantInteractionBestEffort } from './writeAssistantInteraction.js'

const MIN_QUESTION_LEN = 4
const MAX_QUESTION_LEN = 2000
const MAX_HISTORY_TURNS = 10
const MAX_TURN_CHARS = 4000

function parseConversationHistory(body: Record<string, unknown> | null): RagConversationTurn[] {
  const raw = body?.history
  if (!Array.isArray(raw)) return []

  const turns: RagConversationTurn[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const role = (item as { role?: unknown }).role
    const content = (item as { content?: unknown }).content
    if (role !== 'user' && role !== 'assistant') continue
    if (typeof content !== 'string') continue
    const trimmed = content.trim()
    if (!trimmed) continue
    turns.push({
      role,
      content: trimmed.slice(0, MAX_TURN_CHARS),
    })
  }

  return turns.slice(-MAX_HISTORY_TURNS)
}

export async function askDriveRag(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const startedAt = Date.now()
  const body = req.body as Record<string, unknown> | null
  const question = typeof body?.question === 'string' ? body.question.trim() : ''
  const history = parseConversationHistory(body)

  if (question.length < MIN_QUESTION_LEN) {
    res.status(400).json({ error: 'La pregunta es demasiado corta' })
    return
  }
  if (question.length > MAX_QUESTION_LEN) {
    res.status(400).json({ error: 'La pregunta supera el límite permitido' })
    return
  }

  let toolsUsed: string[] = []
  let answer = ''

  try {
    const config = await getRagConfig()
    if (!isPilotAccessAllowed(config, user)) {
      res.status(503).json({
        error: 'El piloto RAG todavía no está habilitado para tu cuenta.',
        code: 'RAG_PILOT_DISABLED',
      })
      return
    }

    const governingAreaId = config.pilot.governingAreaId
    const excludedAreaForUser = userTouchesExcludedArea(user, config)
    if (excludedAreaForUser) {
      const blocked = buildRegulatoryBlockResponse(excludedAreaForUser, config)
      res.status(blocked.status).json(blocked.body)
      return
    }

    const excludedInQuestion = questionReferencesExcludedArea(question, config)
    if (excludedInQuestion) {
      const blocked = buildRegulatoryBlockResponse(excludedInQuestion, config)
      res.status(blocked.status).json(blocked.body)
      return
    }

    if (isExcludedGoverningArea(governingAreaId, config)) {
      const blocked = buildRegulatoryBlockResponse(governingAreaId, config)
      res.status(blocked.status).json(blocked.body)
      return
    }

    const indexState = await getRagIndexState(governingAreaId)
    const chunkCount =
      typeof indexState?.chunkCount === 'number' ? indexState.chunkCount : 0
    if (!indexState || chunkCount <= 0) {
      res.status(503).json({
        error: 'El índice del asistente todavía no está listo. Pedí a Sistemas que lo actualice.',
        code: 'RAG_INDEX_NOT_READY',
      })
      return
    }

    const searchSubject = resolveSearchSubject(user)
    const drive = await getDrive(searchSubject)
    const corpus = await loadRagCorpus(governingAreaId)
    const accessibleAreaLabels = await resolveAccessibleAreaLabels({
      pilotGoverningAreaId: config.pilot.governingAreaId,
      pilotLabel: config.pilot.label,
      excludedGoverningAreaIds: config.excludedGoverningAreaIds,
    })
    const isSuperAdmin = isSuperAdminUser(user)

    const result = await runRagAssistant({
      question,
      history,
      config,
      searchSubject,
      drive,
      corpus,
      isSuperAdmin,
      accessibleAreaLabels,
      userId: user.uid,
      userEmail: user.email,
    })

    answer = result.answer
    toolsUsed = result.toolsUsed

    const latencyMs = Date.now() - startedAt

    const interactionId = await writeAssistantInteractionBestEffort({
      userId: user.uid,
      userEmail: user.email,
      question,
      answer,
      toolsUsed,
      latencyMs,
      usage: result.usage,
    })

    res.json({
      answer,
      citations: result.citations,
      toolsUsed,
      pendingActions: result.pendingActions,
      preparationFailures: result.preparationFailures ?? [],
      deferredActionRefs: result.deferredActionRefs ?? [],
      preparationBatchId: result.preparationBatchId ?? null,
      pilotLabel: config.pilot.label,
      governingAreaId,
      latencyMs,
      interactionId,
      regulatoryNotice:
        config.excludedGoverningAreaIds.length > 0
          ? 'Documentos RESTRICTED y del área Cumplimiento están excluidos del piloto.'
          : null,
      impersonatedAs: searchSubject,
    })
  } catch (err) {
    logError('RAG ask falló', err)
    const message = err instanceof Error ? err.message : 'Error al procesar la consulta'
    const latencyMs = Date.now() - startedAt
    answer =
      message.includes('timeout') || message.includes('ETIMEDOUT') || message.includes('DEADLINE')
        ? 'La consulta tardó demasiado. Intentá de nuevo con menos archivos o en partes.'
        : 'Algo salió mal al procesar la consulta. Intentá de nuevo en unos segundos.'

    const interactionId = await writeAssistantInteractionBestEffort({
      userId: user.uid,
      userEmail: user.email,
      question,
      answer,
      toolsUsed,
      latencyMs,
      technicalError: true,
      httpStatus: message.includes(RAG_REGULATORY_ERROR_CODE) ? 403 : 500,
      errorCode: message.includes(RAG_REGULATORY_ERROR_CODE)
        ? RAG_REGULATORY_ERROR_CODE
        : 'RAG_INTERNAL_ERROR',
    })

    if (message.includes(RAG_REGULATORY_ERROR_CODE)) {
      res.status(403).json({ error: message, code: RAG_REGULATORY_ERROR_CODE, interactionId })
      return
    }
    if (message.includes('timeout') || message.includes('ETIMEDOUT') || message.includes('DEADLINE')) {
      res.status(503).json({
        error: answer,
        code: 'RAG_REQUEST_TIMEOUT',
        interactionId,
      })
      return
    }
    res.status(500).json({
      error: answer,
      code: 'RAG_INTERNAL_ERROR',
      interactionId,
    })
  }
}
