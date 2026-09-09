import {
  DEFAULT_CALENDAR_TIMEZONE,
  formatFloatingTimeRange,
  formatIsoDateRangeReadableSpanish,
} from '../assistant-actions/calendarDateTime.js'
import type { SummarizeBatchResult } from './runSummarizeBatch.js'
import { MAX_SUMMARIZE_BATCH } from './runSummarizeBatch.js'

export function formatSummariesAsAnswer(batch: SummarizeBatchResult): string {
  if (batch.summaries.length === 0) {
    const errMsg = batch.errors.map((err) => `${err.fileName}: ${err.message}`).join(' ')
    return errMsg || 'No encontré archivos para resumir con los criterios indicados.'
  }

  const sections = batch.summaries.map(
    (item) => `**${item.fileName}** (${item.fileKind})\n\n${item.summary}`,
  )

  const intro =
    batch.skipped.length > 0
      ? `Puedo resumir hasta **${MAX_SUMMARIZE_BATCH} documentos por mensaje**. Empiezo con estos ${batch.summaries.length}:\n\n`
      : 'Acá van los resúmenes:\n\n'

  const parts = [`${intro}${sections.join('\n\n')}`]

  if (batch.skipped.length > 0) {
    parts.push(
      `_Quedan **${batch.skipped.length}** archivo(s) sin resumir (${batch.skipped
        .map((file) => file.name)
        .join(', ')}). Pedime "continuá con el resto" en el próximo mensaje._`,
    )
  }

  if (batch.errors.length > 0) {
    parts.push(
      `_No pude resumir: ${batch.errors.map((err) => err.fileName).join(', ')}._`,
    )
  }

  return parts.join('\n\n')
}

export function formatFileListAsAnswer(result: Record<string, unknown>): string {
  const areaLabel = typeof result.areaLabel === 'string' ? result.areaLabel : 'tu área'
  const totalFiles = typeof result.totalFiles === 'number' ? result.totalFiles : 0
  const byType =
    result.byType && typeof result.byType === 'object'
      ? (result.byType as Record<string, number>)
      : {}
  const files = Array.isArray(result.files)
    ? (result.files as Array<{
        fileName: string
        fileKind: string
        modifiedTime?: string | null
      }>)
    : []

  const typeLines = Object.entries(byType)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
    .map(([kind, count]) => `- ${kind}: ${count}`)
    .join('\n')

  const grouped: Record<string, string[]> = {}
  for (const file of files) {
    if (!grouped[file.fileKind]) grouped[file.fileKind] = []
    grouped[file.fileKind].push(file.fileName)
  }

  const detailLines = Object.entries(grouped)
    .sort((a, b) => a[0].localeCompare(b[0], 'es'))
    .map(([kind, names]) => `**${kind}**\n${names.map((name) => `- ${name}`).join('\n')}`)
    .join('\n\n')

  const truncated = result.truncated === true
  let answer = `En **${areaLabel}** tenés **${totalFiles}** archivo(s) visibles:\n\n${typeLines}`
  if (detailLines) {
    answer += `\n\nDetalle:\n\n${detailLines}`
  }
  if (truncated) {
    answer += '\n\n_(Listado truncado; pedí filtrar por tipo si necesitás más detalle.)_'
  }
  return answer
}

export function formatInboxAsAnswer(result: Record<string, unknown>): string {
  if (typeof result.error === 'string') {
    return typeof result.message === 'string'
      ? result.message
      : 'No pude leer tu bandeja de entrada en este momento.'
  }

  const messages = Array.isArray(result.messages)
    ? (result.messages as Array<{
        subject?: string
        from?: string
        date?: string
        snippet?: string
      }>)
    : []
  const count = typeof result.messageCount === 'number' ? result.messageCount : messages.length

  if (count === 0) {
    return 'No tenés correos nuevos en la bandeja de entrada de hoy.'
  }

  const lines = messages.slice(0, 15).map((message, index) => {
    const subject = message.subject?.trim() || '(Sin asunto)'
    const from = message.from?.trim() || '(Remitente desconocido)'
    const snippet = message.snippet?.trim()
    const snippetPart = snippet ? `\n   _${snippet.slice(0, 140)}${snippet.length > 140 ? '…' : ''}_` : ''
    return `${index + 1}. **${subject}**\n   De: ${from}${snippetPart}`
  })

  let answer = `Tenés **${count}** correo(s) en la bandeja de hoy:\n\n${lines.join('\n\n')}`
  if (count > 15) {
    answer += `\n\n_(Mostrando los primeros 15. Pedime buscar por remitente o asunto si necesitás más detalle.)_`
  }
  return answer
}

export function formatCalendarAsAnswer(result: Record<string, unknown>): string {
  if (typeof result.error === 'string') {
    return typeof result.message === 'string'
      ? result.message
      : 'No pude leer tu calendario en este momento.'
  }

  const dateFrom = typeof result.dateFrom === 'string' ? result.dateFrom : ''
  const dateTo = typeof result.dateTo === 'string' ? result.dateTo : dateFrom
  const events = Array.isArray(result.events)
    ? (result.events as Array<{
        title?: string
        start?: string
        end?: string | null
        location?: string | null
        allDay?: boolean
      }>)
    : []
  const count = typeof result.eventCount === 'number' ? result.eventCount : events.length

  const timeZone =
    typeof result.timeZone === 'string' ? result.timeZone : DEFAULT_CALENDAR_TIMEZONE
  const rangeLabel =
    dateFrom && dateTo
      ? formatIsoDateRangeReadableSpanish(dateFrom, dateTo, timeZone)
      : 'del período consultado'

  if (count === 0) {
    return `No tenés eventos en tu agenda ${rangeLabel}.`
  }

  const lines = events.slice(0, 20).map((event, index) => {
    const title = event.title?.trim() || '(Sin título)'
    const start = event.start?.trim() || '—'
    const end = event.end?.trim()
    const timePart = event.allDay
      ? 'Todo el día'
      : start !== '—'
        ? formatFloatingTimeRange(start, end, timeZone)
        : '—'
    const location = event.location?.trim()
    const locationPart = location ? `\n   📍 ${location}` : ''
    return `${index + 1}. **${title}** — ${timePart}${locationPart}`
  })

  let answer = `Tenés **${count}** evento(s) en tu agenda ${rangeLabel}:\n\n${lines.join('\n\n')}`
  if (count > 20) {
    answer += `\n\n_(Mostrando los primeros 20.)_`
  }
  if (typeof result.note === 'string' && result.note.trim()) {
    answer += `\n\n_${result.note.trim()}_`
  }
  return answer
}
