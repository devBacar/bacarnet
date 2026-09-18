import { logError } from '../../lib/log.js'
import { PASSIVE_NOTIFICATION_TYPES } from '../notifications/types.js'
import { resolveSuperAdminUids } from '../notifications/resolveRecipients.js'
import { writeNotificationsBestEffort } from '../notifications/writeNotification.js'
import { auditRagDomainAccessInPilotIndex } from './auditRagDomainAccess.js'
import { computePreviousWeekAssistantUsage } from './assistantUsageAggregates.js'
import { clearRagConfigCache } from './config.js'
import { indexPilotArea } from './indexPilotArea.js'
import { clearRagCorpusCache } from './loadRagCorpus.js'

const SYSTEM_ACTOR = {
  uid: 'system-rag-weekly',
  email: 'sistema@bacarsa.com.ar',
  displayName: 'Asistente RAG',
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value)
}

function buildNotificationBody(input: {
  stats: { filesIndexed: number; chunksWritten: number; errors: Array<unknown> }
  domainAudit: Awaited<ReturnType<typeof auditRagDomainAccessInPilotIndex>>
  usage: Awaited<ReturnType<typeof computePreviousWeekAssistantUsage>>
  indexedAt: string
}): string {
  const lines: string[] = [
    `Índice actualizado: ${input.indexedAt}`,
    `Documentos indexados: ${input.stats.filesIndexed} · chunks: ${input.stats.chunksWritten}.`,
  ]

  if (input.stats.errors.length > 0) {
    lines.push(`Errores al indexar: ${input.stats.errors.length} archivo(s).`)
  }

  if (input.domainAudit.chunksWithDomainAccess > 0) {
    lines.push(
      `⚠ Guardrail domainAccess: ${input.domainAudit.chunksWithDomainAccess} chunk(s) con permiso de dominio (@${input.domainAudit.allowedEmailDomain}: ${input.domainAudit.chunksWithOrgDomain}). Revisar auditoría RAG.`,
    )
  } else {
    lines.push('Guardrail domainAccess: 0 chunks con permiso de dominio (OK).')
  }

  lines.push(
    `Consumo asistente (semana cerrada): ${input.usage.questions} consulta(s), estimado ${formatUsd(input.usage.estimatedCostUsd)} total (${formatUsd(input.usage.averageCostUsdPerQuestion)}/consulta).`,
  )

  return lines.join('\n')
}

export async function runScheduledRagWeekly(): Promise<void> {
  clearRagConfigCache()
  clearRagCorpusCache()

  const started = new Date()
  let indexResult: Awaited<ReturnType<typeof indexPilotArea>>
  try {
    indexResult = await indexPilotArea({ embed: true, dryRun: false })
  } catch (err) {
    logError('reindex RAG semanal falló', err)
    const uids = await resolveSuperAdminUids()
    await writeNotificationsBestEffort(
      uids.map((recipientUid) => ({
        recipientUid,
        type: PASSIVE_NOTIFICATION_TYPES.USER_GOVERNANCE_CHANGE,
        category: 'passive' as const,
        actor: SYSTEM_ACTOR,
        title: 'Reindex RAG semanal falló',
        body:
          err instanceof Error
            ? err.message.slice(0, 500)
            : 'Error desconocido durante la indexación programada.',
        deepLink: { path: '/admin/rag-pilot' },
        context: { source: 'rag_weekly_reindex', ok: false },
        dedupeKey: `rag-weekly-fail-${started.toISOString().slice(0, 10)}`,
      })),
    )
    throw err
  }

  const domainAudit = await auditRagDomainAccessInPilotIndex()
  const usage = await computePreviousWeekAssistantUsage(started)
  const indexedAt = new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'short',
    timeStyle: 'short',
  })

  const body = buildNotificationBody({
    stats: indexResult.stats,
    domainAudit,
    usage,
    indexedAt,
  })

  const uids = await resolveSuperAdminUids()
  await writeNotificationsBestEffort(
    uids.map((recipientUid) => ({
      recipientUid,
      type: PASSIVE_NOTIFICATION_TYPES.USER_GOVERNANCE_CHANGE,
      category: 'passive' as const,
      actor: SYSTEM_ACTOR,
      title: 'RAG: reindex semanal completado',
      body,
      deepLink: { path: '/sistemas/rag-piloto' },
      context: {
        source: 'rag_weekly_reindex',
        ok: true,
        domainChunks: domainAudit.chunksWithDomainAccess,
        usageQuestions: usage.questions,
      },
      dedupeKey: `rag-weekly-ok-${started.toISOString().slice(0, 10)}`,
    })),
  )
}
