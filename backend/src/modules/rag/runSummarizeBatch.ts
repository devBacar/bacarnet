import type { AccessibleDriveFile } from './accessibleDriveInventory.js'
import { loadAccessibleInventory } from './accessibleDriveInventory.js'
import { isSummarizeableKind, type SummarizeIntent } from './assistantIntent.js'
import type { RagToolContext } from './executeRagTool.js'
import { summarizeDocument } from './summarizeDocument.js'

export const MAX_SUMMARIZE_BATCH = 3

export type SummarizeBatchResult = {
  summaries: Array<{ fileName: string; fileKind: string; summary: string }>
  skipped: AccessibleDriveFile[]
  errors: Array<{ fileName: string; message: string }>
}

function selectFilesForSummarize(
  files: AccessibleDriveFile[],
  intent: SummarizeIntent,
  maxBatch = MAX_SUMMARIZE_BATCH,
): { selected: AccessibleDriveFile[]; skipped: AccessibleDriveFile[] } {
  const candidates = files
    .filter((file) => isSummarizeableKind(file.fileKind))
    .filter((file) => intent.fileKinds.includes(file.fileKind as SummarizeIntent['fileKinds'][number]))
    .sort((a, b) => {
      const aTime = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0
      const bTime = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0
      return bTime - aTime
    })

  const limit = intent.limit ?? (intent.includeAllSummarizeable ? maxBatch : maxBatch)
  const capped = Math.min(Math.max(limit, 1), maxBatch)
  return {
    selected: candidates.slice(0, capped),
    skipped: candidates.slice(capped),
  }
}

export async function runSummarizeBatch(
  ctx: RagToolContext,
  intent: SummarizeIntent,
  maxBatch = MAX_SUMMARIZE_BATCH,
): Promise<SummarizeBatchResult> {
  const inventory = await loadAccessibleInventory({
    drive: ctx.drive,
    config: ctx.config,
    searchSubject: ctx.searchSubject,
  })

  const effectiveCap = Math.min(Math.max(maxBatch, 1), MAX_SUMMARIZE_BATCH)
  const { selected, skipped } = selectFilesForSummarize(inventory.files, intent, effectiveCap)
  const summaries: SummarizeBatchResult['summaries'] = []
  const errors: SummarizeBatchResult['errors'] = []

  const settled = await Promise.all(
    selected.map(async (file) => {
      try {
        const result = await summarizeDocument(ctx, {
          fileName: file.name,
          focus: 'Resumen general del documento completo',
        })

        if (typeof result.summary === 'string' && result.summary.trim()) {
          return {
            ok: true as const,
            file,
            summary: result.summary.trim(),
          }
        }

        return {
          ok: false as const,
          fileName: file.name,
          message:
            typeof result.message === 'string'
              ? result.message
              : 'No se pudo generar el resumen.',
        }
      } catch (err) {
        return {
          ok: false as const,
          fileName: file.name,
          message: err instanceof Error ? err.message : 'Error al resumir.',
        }
      }
    }),
  )

  for (const item of settled) {
    if (item.ok) {
      summaries.push({
        fileName: item.file.name,
        fileKind: item.file.fileKind,
        summary: item.summary,
      })
      ctx.citations.push({
        fileId: item.file.id,
        fileName: item.file.name,
        webViewLink: item.file.webViewLink,
        chunkIndex: 0,
        excerpt: item.summary.slice(0, 400),
      })
    } else {
      errors.push({
        fileName: item.fileName,
        message: item.message,
      })
    }
  }

  return { summaries, skipped, errors }
}

export function formatSummarizeBatchForModel(result: SummarizeBatchResult): string {
  const parts: string[] = []
  for (const item of result.summaries) {
    parts.push(`***REMOVED******REMOVED*** ${item.fileName} (${item.fileKind})\n${item.summary}`)
  }
  if (result.errors.length > 0) {
    parts.push(
      'Errores parciales:\n' +
        result.errors.map((err) => `- ${err.fileName}: ${err.message}`).join('\n'),
    )
  }
  if (result.skipped.length > 0) {
    parts.push(
      `Archivos omitidos en este turno (límite ${MAX_SUMMARIZE_BATCH}): ${result.skipped
        .map((file) => file.name)
        .join(', ')}`,
    )
  }
  return parts.join('\n\n')
}
