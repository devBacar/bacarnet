import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { isSuperAdminUser } from '../auth/middleware.js'
import { getRagConfig, clearRagConfigCache } from './config.js'
import { isPilotAccessAllowed } from './pilotAccess.js'
import { clearRagCorpusCache, getRagIndexState } from './loadRagCorpus.js'
import { indexPilotArea, verifyNoExcludedChunks } from './indexPilotArea.js'
import { RAG_DEFAULT_EXCLUDED_GOVERNING_AREA_ID } from './constants.js'
import {
  buildWelcomeMessage,
  resolveAccessibleAreaLabels,
} from './ragReadableLabels.js'

let reindexInFlight: Promise<unknown> | null = null

export async function getDriveRagStatus(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  try {
    const config = await getRagConfig()
    if (!isPilotAccessAllowed(config, user)) {
      res.status(403).json({ error: 'El piloto RAG no está habilitado para tu cuenta.' })
      return
    }

    const indexState = await getRagIndexState(config.pilot.governingAreaId)
    const accessibleAreaLabels = await resolveAccessibleAreaLabels({
      pilotGoverningAreaId: config.pilot.governingAreaId,
      pilotLabel: config.pilot.label,
      excludedGoverningAreaIds: config.excludedGoverningAreaIds,
    })
    const isSuperAdmin = isSuperAdminUser(user)

    res.json({
      enabled: config.enabled,
      canReindex: isSuperAdmin,
      canQueryAudit: isSuperAdmin,
      pilot: config.pilot,
      excludedGoverningAreaIds: config.excludedGoverningAreaIds,
      excludedAreaLabels: config.excludedAreaLabels,
      regulatoryMessage: config.regulatoryMessage,
      indexState,
      reindexInProgress: reindexInFlight !== null,
      assistant: {
        title: 'Asistente BacarNet',
        welcomeMessage: buildWelcomeMessage(accessibleAreaLabels),
        accessibleAreaLabels,
      },
    })
  } catch (err) {
    logError('RAG status falló', err)
    res.status(500).json({ error: 'No se pudo leer el estado del piloto RAG' })
  }
}

export async function reindexDriveRag(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  if (!isSuperAdminUser(user)) {
    res.status(403).json({ error: 'Se requiere rol super_admin' })
    return
  }

  if (reindexInFlight) {
    res.status(409).json({ error: 'Ya hay una reindexación en curso' })
    return
  }

  const startedAt = Date.now()
  reindexInFlight = (async () => {
    const result = await indexPilotArea({ dryRun: false, embed: true })
    const config = await getRagConfig()
    const verify = await verifyNoExcludedChunks(config.pilot.governingAreaId)
    clearRagCorpusCache(config.pilot.governingAreaId)
    clearRagConfigCache()
    return { result, verify, config }
  })()

  try {
    const { result, verify, config } = (await reindexInFlight) as {
      result: Awaited<ReturnType<typeof indexPilotArea>>
      verify: Awaited<ReturnType<typeof verifyNoExcludedChunks>>
      config: Awaited<ReturnType<typeof getRagConfig>>
    }

    const cumplimientoViolations = verify.violations.filter((v) =>
      v.includes(RAG_DEFAULT_EXCLUDED_GOVERNING_AREA_ID),
    )

    res.json({
      ok: verify.ok,
      latencyMs: Date.now() - startedAt,
      stats: result.stats,
      memoryEstimate: result.memoryEstimate,
      manifestPath: result.manifestPath,
      snapshotPath: result.snapshotPath,
      embedded: result.embedded,
      verification: {
        ok: verify.ok,
        violations: verify.violations,
        cumplimientoViolations,
      },
      pilot: config.pilot,
    })
  } catch (err) {
    logError('RAG reindex falló', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'No se pudo reindexar el piloto',
    })
  } finally {
    reindexInFlight = null
  }
}
