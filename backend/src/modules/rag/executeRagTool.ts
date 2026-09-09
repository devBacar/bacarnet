import type { drive_v3 } from 'googleapis'
import {
  chunkPassesIndexedAcl,
  chunkPassesRegulatoryFilters,
  resolveChunkContent,
} from './chunkAccess.js'
import { rankByCosineSimilarity } from './cosineSimilarity.js'
import { embedTexts } from './embeddings.js'
import type { RagCitation } from './generateRagAnswer.js'
import type { LoadedRagCorpus } from './loadRagCorpus.js'
import {
  areaLabelReferencesExcludedArea,
  buildRegulatoryBlockResponse,
  regulatoryAreaLabel,
} from './regulatoryArea.js'
import { formatBytes } from './mimeKind.js'
import {
  enrichUploader,
  findAccessibleFileByName,
  loadAccessibleInventory,
  type AccessibleDriveFile,
  type AccessibleInventory,
} from './accessibleDriveInventory.js'
import { RAG_REGULATORY_ERROR_CODE } from './constants.js'
import type { RagConfig } from './types.js'
import { queryAuditLogsForAssistant } from './queryAuditLogsForAssistant.js'
import {
  stripTechnicalFields,
} from './ragReadableLabels.js'
import { getAreaDisplayName } from '../drive/resolveAreaMembers.js'
import { summarizeDocument } from './summarizeDocument.js'
import { listAccessibleFilesTool } from './listAccessibleFiles.js'
import { prepareEmailDraftTool } from '../assistant-actions/prepareEmailDraft.js'
import { prepareCalendarDraftTool } from '../assistant-actions/prepareCalendarDraft.js'
import {
  findCalendarFreeSlotsTool,
  listCalendarEventsTool,
} from '../assistant-actions/calendarReadTools.js'
import {
  listInboxTodayTool,
  searchEmailsTool,
  summarizeEmailTool,
} from '../assistant-actions/gmailReadTools.js'
import { todayInTimeZone } from '../assistant-actions/calendarDateTime.js'
import type { AssistantPendingActionDto } from '../assistant-actions/types.js'
import type { AssistantUsageMeter } from './assistantUsageMeter.js'

const TOP_K_CANDIDATES = 20
const TOP_K_CONTEXT = 5

export type RagToolContext = {
  config: RagConfig
  searchSubject: string
  userId: string
  userEmail: string
  drive: drive_v3.Drive
  corpus: LoadedRagCorpus
  citations: RagCitation[]
  isSuperAdmin: boolean
  accessibleAreaLabels: string[]
  pendingActions: AssistantPendingActionDto[]
  usageMeter?: AssistantUsageMeter
}

function regulatoryToolError(governingAreaId: string, config: RagConfig) {
  const blocked = buildRegulatoryBlockResponse(governingAreaId, config)
  return {
    error: RAG_REGULATORY_ERROR_CODE,
    message: blocked.body.error,
    areaLabel: blocked.body.areaLabel,
  }
}

function assertPilotAreaLabel(
  areaLabel: string | undefined,
  ctx: RagToolContext,
): { ok: true } | { ok: false; response: Record<string, unknown> } {
  const excludedId = areaLabelReferencesExcludedArea(areaLabel, ctx.config)
  if (excludedId) {
    return { ok: false, response: regulatoryToolError(excludedId, ctx.config) }
  }

  if (!areaLabel?.trim()) {
    return { ok: true }
  }

  const normalized = areaLabel.trim().toLowerCase()
  const allowed = ctx.accessibleAreaLabels.map((label) => label.trim().toLowerCase())
  if (!allowed.some((label) => normalized === label || normalized.includes(label))) {
    const scopeText =
      ctx.accessibleAreaLabels.length > 0
        ? ctx.accessibleAreaLabels.join(', ')
        : 'las áreas habilitadas para tu cuenta'
    return {
      ok: false,
      response: {
        error: 'AREA_OUT_OF_SCOPE',
        message: `No puedo consultar metadata de "${areaLabel}". Por ahora solo tengo acceso a: ${scopeText}.`,
        accessibleAreaLabels: ctx.accessibleAreaLabels,
      },
    }
  }

  return { ok: true }
}

async function resolveAreaLabelForFile(
  ctx: RagToolContext,
  governingAreaId: string | null,
): Promise<string> {
  if (!governingAreaId) {
    return ctx.accessibleAreaLabels[0] ?? ctx.config.pilot.label
  }
  const resolved = await getAreaDisplayName(governingAreaId)
  return resolved ?? ctx.config.pilot.label
}

function aggregateByType(files: AccessibleDriveFile[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const file of files) {
    counts[file.fileKind] = (counts[file.fileKind] ?? 0) + 1
  }
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')),
  )
}

function parseIsoDate(value: string, endOfDay = false): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  if (endOfDay) {
    return new Date(Date.UTC(year, month, day, 23, 59, 59, 999))
  }
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0))
}

async function getInventory(ctx: RagToolContext): Promise<AccessibleInventory> {
  return loadAccessibleInventory({
    drive: ctx.drive,
    config: ctx.config,
    searchSubject: ctx.searchSubject,
  })
}

async function runSemanticSearch(
  ctx: RagToolContext,
  query: string,
): Promise<Record<string, unknown>> {
  const [queryVector] = await embedTexts([query], ctx.usageMeter)
  const ranked = rankByCosineSimilarity(
    queryVector,
    ctx.corpus.vectors,
    ctx.corpus.dims,
    TOP_K_CANDIDATES,
  )

  const verifiedFileIds = new Set<string>()
  const hits: Array<{
    fileName: string
    webViewLink: string | null
    excerpt: string
  }> = []

  for (const hit of ranked) {
    if (hits.length >= TOP_K_CONTEXT) break
    const chunk = ctx.corpus.chunks[hit.index]
    if (!chunk) continue
    if (!chunkPassesRegulatoryFilters(chunk, ctx.config)) continue
    if (!chunkPassesIndexedAcl(chunk, ctx.searchSubject)) continue

    if (!verifiedFileIds.has(chunk.fileId)) {
      try {
        await ctx.drive.files.get({
          fileId: chunk.fileId,
          supportsAllDrives: true,
          fields: 'id,trashed',
        })
        verifiedFileIds.add(chunk.fileId)
      } catch {
        continue
      }
    }

    const excerpt = resolveChunkContent(chunk, ctx.corpus.contents)
    hits.push({
      fileName: chunk.fileName,
      webViewLink: chunk.webViewLink,
      excerpt,
    })

    ctx.citations.push({
      fileId: chunk.fileId,
      fileName: chunk.fileName,
      webViewLink: chunk.webViewLink,
      chunkIndex: chunk.chunkIndex,
      excerpt,
    })
  }

  return {
    resultCount: hits.length,
    excerpts: hits,
    note:
      hits.length === 0
        ? 'No se encontraron documentos con permiso para esta búsqueda.'
        : 'Fragmentos recuperados del índice semántico.',
  }
}

export async function executeRagTool(
  ctx: RagToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let response: Record<string, unknown>

  switch (name) {
    case 'search_document_content': {
      const query = typeof args.query === 'string' ? args.query.trim() : ''
      if (!query) {
        response = { error: 'INVALID_ARGS', message: 'Falta el parámetro query.' }
        break
      }
      if (
        /\b(resum(e|ir|o|en|ame|á|ar)|sintetiz(a|ar|á))\b/i.test(query) &&
        /\b(documento|pdf|archivo|completo|entero|manual|todos?\s+los)\b/i.test(query)
      ) {
        response = {
          error: 'WRONG_TOOL',
          message:
            'Para resumir documentos completos usá summarize_document. search_document_content solo busca fragmentos puntuales.',
          suggestTool: 'summarize_document',
        }
        break
      }
      response = await runSemanticSearch(ctx, query)
      break
    }

    case 'list_accessible_files': {
      const areaLabel = typeof args.areaLabel === 'string' ? args.areaLabel : undefined
      const scope = assertPilotAreaLabel(areaLabel, ctx)
      if (!scope.ok) {
        response = scope.response
        break
      }
      response = await listAccessibleFilesTool({
        drive: ctx.drive,
        config: ctx.config,
        searchSubject: ctx.searchSubject,
        args,
      })
      break
    }

    case 'count_files_by_type': {
      const areaLabel = typeof args.areaLabel === 'string' ? args.areaLabel : undefined
      const scope = assertPilotAreaLabel(areaLabel, ctx)
      if (!scope.ok) {
        response = scope.response
        break
      }

      const inventory = await getInventory(ctx)
      response = {
        areaLabel: inventory.areaLabel,
        totalFiles: inventory.files.length,
        byType: aggregateByType(inventory.files),
        note:
          'Conteo real sobre archivos visibles para tu cuenta. Excluye RESTRICTED y áreas regulatorias.',
      }
      break
    }

    case 'get_storage_usage': {
      const areaLabel = typeof args.areaLabel === 'string' ? args.areaLabel : undefined
      const scope = assertPilotAreaLabel(areaLabel, ctx)
      if (!scope.ok) {
        response = scope.response
        break
      }

      const inventory = await getInventory(ctx)
      const totalBytes = inventory.files.reduce((sum, file) => sum + (file.size || 0), 0)
      response = {
        areaLabel: inventory.areaLabel,
        totalBytes,
        totalFormatted: formatBytes(totalBytes),
        fileCount: inventory.files.length,
        note: 'Suma el tamaño reportado por Drive de archivos visibles para tu cuenta.',
      }
      break
    }

    case 'list_files_by_date_range': {
      const dateFrom = typeof args.dateFrom === 'string' ? args.dateFrom : ''
      const dateTo = typeof args.dateTo === 'string' ? args.dateTo : ''
      const fileKind = typeof args.fileKind === 'string' ? args.fileKind.trim() : ''
      const areaLabel = typeof args.areaLabel === 'string' ? args.areaLabel : undefined
      const scope = assertPilotAreaLabel(areaLabel, ctx)
      if (!scope.ok) {
        response = scope.response
        break
      }

      const from = dateFrom ? parseIsoDate(dateFrom) : parseIsoDate('1970-01-01')
      const to = dateTo ? parseIsoDate(dateTo, true) : parseIsoDate('2099-12-31', true)
      if ((dateFrom && !from) || (dateTo && !to)) {
        response = {
          error: 'INVALID_ARGS',
          message: 'Las fechas deben estar en formato YYYY-MM-DD.',
        }
        break
      }
      if (!from || !to || from.getTime() > to.getTime()) {
        response = { error: 'INVALID_ARGS', message: 'Rango de fechas inválido.' }
        break
      }

      const inventory = await getInventory(ctx)
      const kindQuery = fileKind.toLowerCase()
      const matches = inventory.files
        .filter((file) => {
          if (kindQuery && !file.fileKind.toLowerCase().includes(kindQuery)) return false
          if (!file.modifiedTime) return false
          const modified = new Date(file.modifiedTime).getTime()
          return modified >= from.getTime() && modified <= to.getTime()
        })
        .sort((a, b) => {
          const aTime = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0
          const bTime = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0
          return bTime - aTime
        })
        .slice(0, 50)
        .map((file) => ({
          fileName: file.name,
          fileKind: file.fileKind,
          modifiedTime: file.modifiedTime,
          webViewLink: file.webViewLink,
        }))

      response = {
        areaLabel: inventory.areaLabel,
        dateFrom,
        dateTo,
        matchCount: matches.length,
        files: matches,
        truncated: matches.length >= 50,
      }
      break
    }

    case 'get_file_uploader': {
      const fileName = typeof args.fileName === 'string' ? args.fileName.trim() : ''
      const fileId = typeof args.fileId === 'string' ? args.fileId.trim() : ''

      if (!fileName && !fileId) {
        response = { error: 'INVALID_ARGS', message: 'Indicá el nombre del archivo.' }
        break
      }

      const inventory = await getInventory(ctx)
      let matches: AccessibleDriveFile[] = []

      if (fileId) {
        const direct = inventory.files.find((file) => file.id === fileId)
        matches = direct ? [direct] : []
      } else {
        matches = findAccessibleFileByName(inventory, fileName)
      }

      if (matches.length === 0) {
        response = {
          found: false,
          message: 'No encontré ese archivo entre los documentos visibles para tu cuenta.',
        }
        break
      }

      if (matches.length > 1) {
        response = {
          found: false,
          ambiguous: true,
          candidates: matches.slice(0, 10).map((file) => ({
            fileName: file.name,
            modifiedTime: file.modifiedTime,
          })),
          message: 'Hay varios archivos con nombre similar. Pedí aclarar cuál.',
        }
        break
      }

      const file = await enrichUploader(ctx.drive, matches[0])
      response = {
        found: true,
        fileName: file.name,
        uploaderEmail: file.uploaderEmail,
        modifiedTime: file.modifiedTime,
        webViewLink: file.webViewLink,
        areaLabel: await resolveAreaLabelForFile(ctx, file.governingAreaId),
      }
      break
    }

    case 'get_inventory_summary': {
      const areaLabel = typeof args.areaLabel === 'string' ? args.areaLabel : undefined
      const scope = assertPilotAreaLabel(areaLabel, ctx)
      if (!scope.ok) {
        response = scope.response
        break
      }

      const inventory = await getInventory(ctx)
      const totalBytes = inventory.files.reduce((sum, file) => sum + (file.size || 0), 0)
      const mostRecent = [...inventory.files]
        .filter((file) => file.modifiedTime)
        .sort(
          (a, b) =>
            new Date(b.modifiedTime ?? 0).getTime() - new Date(a.modifiedTime ?? 0).getTime(),
        )[0]

      response = {
        areaLabel: inventory.areaLabel,
        foldersVisited: inventory.foldersVisited,
        totalFiles: inventory.files.length,
        totalBytes,
        totalFormatted: formatBytes(totalBytes),
        byType: aggregateByType(inventory.files),
        mostRecentFile: mostRecent
          ? {
              fileName: mostRecent.name,
              fileKind: mostRecent.fileKind,
              modifiedTime: mostRecent.modifiedTime,
              webViewLink: mostRecent.webViewLink,
            }
          : null,
        note:
          'Resumen de inventario (metadata). No incluye síntesis del contenido textual de los documentos.',
      }
      break
    }

    case 'summarize_document': {
      response = await summarizeDocument(ctx, args)
      break
    }

    case 'query_audit_logs': {
      if (!ctx.isSuperAdmin) {
        response = {
          error: 'AUDIT_ACCESS_DENIED',
          message:
            'La consulta de auditoría interna solo está disponible para administradores del sistema.',
        }
        break
      }

      response = await queryAuditLogsForAssistant({
        actorEmail: typeof args.actorEmail === 'string' ? args.actorEmail : undefined,
        action: typeof args.action === 'string' ? args.action : undefined,
        targetName: typeof args.targetName === 'string' ? args.targetName : undefined,
        dateFrom: typeof args.dateFrom === 'string' ? args.dateFrom : undefined,
        dateTo: typeof args.dateTo === 'string' ? args.dateTo : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      })
      break
    }

    case 'prepare_email_draft': {
      response = await prepareEmailDraftTool({
        userId: ctx.userId,
        userEmail: ctx.userEmail,
        impersonateAs: ctx.searchSubject,
        args,
      })
      if (
        response.requiresConfirmation === true &&
        typeof response.pendingActionId === 'string' &&
        response.preview &&
        typeof response.preview === 'object'
      ) {
        ctx.pendingActions.push({
          id: response.pendingActionId,
          type: 'email',
          status: 'pending',
          preview: response.preview as AssistantPendingActionDto['preview'],
          expiresAt:
            typeof response.expiresAt === 'string'
              ? response.expiresAt
              : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        })
      }
      break
    }

    case 'prepare_calendar_event': {
      response = await prepareCalendarDraftTool({
        userId: ctx.userId,
        userEmail: ctx.userEmail,
        impersonateAs: ctx.searchSubject,
        args,
      })
      if (
        response.requiresConfirmation === true &&
        typeof response.pendingActionId === 'string' &&
        response.preview &&
        typeof response.preview === 'object'
      ) {
        ctx.pendingActions.push({
          id: response.pendingActionId,
          type: 'calendar_event',
          status: 'pending',
          preview: response.preview as AssistantPendingActionDto['preview'],
          expiresAt:
            typeof response.expiresAt === 'string'
              ? response.expiresAt
              : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        })
      }
      break
    }

    case 'list_calendar_events': {
      response = await listCalendarEventsTool({
        impersonateAs: ctx.searchSubject,
        args,
      })
      break
    }

    case 'find_calendar_free_slots': {
      response = await findCalendarFreeSlotsTool({
        impersonateAs: ctx.searchSubject,
        args,
      })
      break
    }

    case 'list_inbox_today': {
      response = await listInboxTodayTool({
        impersonateAs: ctx.searchSubject,
        args,
      })
      break
    }

    case 'search_emails': {
      response = await searchEmailsTool({
        impersonateAs: ctx.searchSubject,
        args,
      })
      break
    }

    case 'summarize_email': {
      response = await summarizeEmailTool({
        impersonateAs: ctx.searchSubject,
        args,
        usageMeter: ctx.usageMeter,
      })
      break
    }

    default:
      response = { error: 'UNKNOWN_TOOL', message: `Herramienta desconocida: ${name}` }
  }

  return stripTechnicalFields(response) as Record<string, unknown>
}

export function buildAssistantSystemInstruction(input: {
  config: RagConfig
  accessibleAreaLabels: string[]
  isSuperAdmin: boolean
  userFrustrated?: boolean
  correctionsBlock?: string
}): string {
  const { config, accessibleAreaLabels, isSuperAdmin, userFrustrated, correctionsBlock } = input
  const referenceDate = todayInTimeZone()
  const excludedLabels = config.excludedGoverningAreaIds
    .map((id) => regulatoryAreaLabel(id, config))
    .join(', ')
  const scopeText =
    accessibleAreaLabels.length > 0
      ? accessibleAreaLabels.join(', ')
      : 'las áreas habilitadas para la cuenta'

  return (
    'Sos el asistente interno de Bacarsa (BacarNet). Respondé siempre en español, de forma concisa y precisa.\n' +
    `Fecha de referencia (Argentina): ${referenceDate}. Usala para interpretar hoy, mañana y esta semana.\n` +
    `Áreas consultables para esta cuenta: ${scopeText}.\n` +
    'Dominios habilitados:\n' +
    '1) Documentos e inventario de BacarNet (Drive/index RAG) según permisos reales del usuario.\n' +
    '2) Calendario del propio usuario (listar agenda, buscar huecos libres, preparar eventos).\n' +
    '3) Correo del propio usuario: lectura de bandeja (list_inbox_today, search_emails, summarize_email) y borradores salientes con confirmación.\n' +
    'Tenés herramientas para:\n' +
    '- Buscar contenido puntual en documentos indexados (search_document_content).\n' +
    '- Resumir un documento completo indexado (summarize_document).\n' +
    '- Listar TODOS los archivos visibles con nombre y tipo (list_accessible_files).\n' +
    '- Consultar inventario y metadata: conteos por tipo, espacio, fechas, uploader, resumen.\n' +
    '- Leer Gmail: list_inbox_today, search_emails, summarize_email.\n' +
    '- Consultar calendario: list_calendar_events, find_calendar_free_slots.\n' +
    '- Preparar borradores de correo (prepare_email_draft) o eventos (prepare_calendar_event).\n' +
    (isSuperAdmin
      ? '- Consultar auditoría interna (query_audit_logs): aprobaciones, permisos, cambios.\n'
      : '') +
    'IMPORTANTE — acciones reales:\n' +
    '- NUNCA afirmes que enviaste un correo o creaste un evento sin haber llamado prepare_* y sin confirmación explícita del usuario en la interfaz.\n' +
    '- Para correos: usá prepare_email_draft. Podés reutilizar resúmenes o respuestas previas del chat como cuerpo del mail si el usuario lo pide.\n' +
    '- Para eventos: usá prepare_calendar_event con fechas ISO completas. Si el usuario menciona invitados, incluilos en attendees (cualquier email válido). Si pide Meet/videollamada, pasá addGoogleMeet: true.\n' +
    '- Correos: destinatarios solo @bacarsa.com.ar. Calendario: invitados de cualquier dominio.\n' +
    '- Calendario/correo: SIEMPRE es del usuario autenticado. Nunca consultes ni actúes sobre el calendario/correo de otra persona.\n' +
    '- Para leer la bandeja: list_inbox_today (correos de hoy), search_emails (por remitente/asunto), summarize_email (resumen de un correo puntual).\n' +
    'Usá el historial de la conversación para entender referencias como "ese archivo", "el anterior", "mandale el resumen de recién" o "¿tengo algo mañana?".\n' +
    (userFrustrated
      ? 'El usuario ya expresó frustración por preguntas de aclaración repetidas: NO vuelvas a pedir qué archivos resumir. Procedé con PDF y Word (excluyendo comprimidos, imágenes y ejecutables) usando lo que ya listaste o el contexto interno.\n'
      : '') +
    'Para "¿qué archivos tengo?" / "mi carpeta": usá list_accessible_files (NO get_inventory_summary ni solo conteos).\n' +
    'Para resumir varios archivos: si hay contexto interno con resúmenes ya generados, usalo directamente.\n' +
    'Si no hay contexto interno, usá summarize_document por cada archivo identificado con list_accessible_files.\n' +
    'NUNCA digas que no podés resumir PDFs completos si summarize_document está disponible o si ya hay resúmenes en contexto.\n' +
    'Para resumir UN documento puntual usá summarize_document, no search_document_content.\n' +
    'Al preparar eventos, si hay calendarConflicts o conflictWarning en la respuesta, mencioná el solapamiento claramente al usuario.\n' +
    'Para agenda: interpretá "hoy", "mañana" y "esta semana" con la fecha de referencia y llamá list_calendar_events con dateFrom/dateTo acordes.\n' +
    'Para huecos libres: usá find_calendar_free_slots.\n' +
    'En seguimientos sobre un archivo puntual, usá get_file_uploader o list_files_by_date_range (con fileKind si aplica).\n' +
    'Para auditoría reciente podés llamar query_audit_logs sin fechas (usa los últimos 90 días).\n' +
    'Elegí la herramienta adecuada según la pregunta.\n' +
    'Combiná herramientas cuando haga falta antes de decir que no podés: ' +
    'ej. list_accessible_files + summarize_document por cada archivo; ' +
    'list_calendar_events + prepare_calendar_event; list_inbox_today + summarize_email; ' +
    'resúmenes en contexto + prepare_email_draft.\n' +
    'Explicá limitaciones técnicas reales solo cuando no haya forma de resolverlo con lo disponible.\n' +
    'Nunca muestres IDs técnicos (uid, fileId, governingAreaId, permissionId, etc.). Usá nombres de personas, emails, nombres de archivos y nombres de área.\n' +
    `Nunca inventes números ni metadata. Si una herramienta devuelve error ${RAG_REGULATORY_ERROR_CODE}, repetí el mensaje de bloqueo regulatorio sin dar cifras.\n` +
    `Documentos RESTRICTED y del área ${excludedLabels} están totalmente excluidos: no existen para vos.\n` +
    'Si el usuario pregunta por un área fuera de su alcance o por auditoría sin permiso, explicá el límite claramente.\n' +
    'Cuando cites contenido documental, referenciá las fuentes como [1], [2], etc.' +
    (correctionsBlock?.trim() ? `\n\n${correctionsBlock.trim()}` : '')
  )
}
