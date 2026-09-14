import { getEnv } from '../../config/env.js'
import { logError, logInfo } from '../../lib/log.js'

export interface JefeAreaRow {
  id?: string | number
  email?: string
  nombre?: string
  area?: string
  link?: string
  enviado?: boolean
  respondido?: boolean
  fecha_envio?: string | number | Date | null
  [key: string]: unknown
}

export interface ScheduledReminderSummary {
  consultadas: number
  elegibles: number
  enviadas: number
  omitidasSinWebhook: number
  errores: number
}

export function reminderWebhookBody(row: JefeAreaRow): {
  email: string
  nombre: string
  area: string
  link: string
} | null {
  const email = typeof row.email === 'string' ? row.email.trim() : ''
  const nombre = typeof row.nombre === 'string' ? row.nombre.trim() : ''
  const area = typeof row.area === 'string' ? row.area.trim() : ''
  const link = typeof row.link === 'string' ? row.link.trim() : ''
  if (!email || !nombre || !area || !link) return null
  return { email, nombre, area, link }
}

export function isReminderEligible(row: JefeAreaRow, now = new Date()): boolean {
  if (row.enviado !== true || row.respondido !== false || !row.fecha_envio) return false
  const sentAt = new Date(row.fecha_envio).getTime()
  if (!Number.isFinite(sentAt)) return false
  return now.getTime() - sentAt > 3 * 24 * 60 * 60 * 1000
}

async function listJefesAreas(input: {
  apiBase: string
  tableId: string
  managementCredential: string
  fetchImpl?: typeof fetch
}): Promise<JefeAreaRow[]> {
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(
    `${input.apiBase}/data-tables/${encodeURIComponent(input.tableId)}/rows`,
    {
      headers: {
        'X-N8N-API-KEY': input.managementCredential,
        Accept: 'application/json',
      },
    },
  )
  if (!response.ok) {
    throw new Error(`n8n data table respondió ${response.status}`)
  }
  const payload = (await response.json()) as { data?: unknown }
  return Array.isArray(payload.data) ? (payload.data as JefeAreaRow[]) : []
}

export async function runScheduledReminder(input?: {
  now?: Date
  config?: {
    managementCredential: string
    apiBase: string
    tableId: string
    webhookUrl: string
    outboundApiKey?: string
  }
  listRows?: () => Promise<JefeAreaRow[]>
  postWebhook?: (row: JefeAreaRow) => Promise<void>
}): Promise<ScheduledReminderSummary> {
  const env = input?.config
    ? null
    : getEnv()
  const config = input?.config ?? {
    managementCredential: env!.n8nManagementCredential,
    apiBase: env!.n8nMgmtApiBase,
    tableId: env!.n8nJefesAreasTableId,
    webhookUrl: env!.helpdeskN8nWebhookRecordatorio,
    outboundApiKey: env!.helpdeskN8nOutboundApiKey,
  }
  const summary: ScheduledReminderSummary = {
    consultadas: 0,
    elegibles: 0,
    enviadas: 0,
    omitidasSinWebhook: 0,
    errores: 0,
  }

  if (!config.managementCredential && !input?.listRows) {
    logInfo('helpdesk recordatorios: N8N_MGMT_API_KEY no configurada; se omite')
    return summary
  }

  const rows = input?.listRows
    ? await input.listRows()
    : await listJefesAreas({
        apiBase: config.apiBase,
        tableId: config.tableId,
        managementCredential: config.managementCredential,
      })
  summary.consultadas = rows.length
  const eligible = rows.filter((row) => isReminderEligible(row, input?.now))
  summary.elegibles = eligible.length

  if (!config.webhookUrl && !input?.postWebhook) {
    summary.omitidasSinWebhook = eligible.length
    logInfo('helpdesk recordatorios: webhook no configurado; solo diagnóstico', {
      consultadas: summary.consultadas,
      elegibles: summary.elegibles,
    })
    return summary
  }

  for (const row of eligible) {
    try {
      if (input?.postWebhook) {
        await input.postWebhook(row)
      } else {
        const body = reminderWebhookBody(row)
        if (!body) {
          throw new Error('fila elegible sin email, nombre, area o link')
        }
        const response = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(config.outboundApiKey ? { 'X-Api-Key': config.outboundApiKey } : {}),
          },
          body: JSON.stringify(body),
        })
        if (!response.ok) throw new Error(`webhook respondió ${response.status}`)
      }
      summary.enviadas++
    } catch (err) {
      summary.errores++
      logError(`helpdesk recordatorio falló para fila ${String(row.id ?? '?')}`, err)
    }
  }

  logInfo('helpdesk recordatorios finalizado', { ...summary })
  return summary
}
