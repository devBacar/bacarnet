import type { gmail_v1 } from 'googleapis'
import { getGmailReadonly } from '../../lib/google/workspaceGoogleClients.js'
import type { AssistantUsageMeter } from '../rag/assistantUsageMeter.js'
import { callVertexGemini } from '../rag/vertexGemini.js'
import { todayInTimeZone } from './calendarDateTime.js'

const MAX_LIST = 20
const MAX_BODY_CHARS = 12_000

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized, 'base64').toString('utf8')
}

function extractPlainText(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }
  for (const part of payload.parts ?? []) {
    const nested = extractPlainText(part)
    if (nested.trim()) return nested
  }
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }
  return ''
}

function headerValue(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string {
  const found = headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())
  return found?.value?.trim() ?? ''
}

function formatMessageSummary(message: gmail_v1.Schema$Message, includeBody = false): Record<string, unknown> {
  const headers = message.payload?.headers
  const subject = headerValue(headers, 'Subject') || '(Sin asunto)'
  const from = headerValue(headers, 'From')
  const date = headerValue(headers, 'Date')
  const snippet = message.snippet?.trim() ?? ''
  const body = includeBody ? extractPlainText(message.payload).slice(0, MAX_BODY_CHARS) : undefined

  return {
    messageId: message.id ?? '',
    threadId: message.threadId ?? '',
    subject,
    from,
    date,
    snippet,
    ...(includeBody ? { body } : {}),
  }
}

async function fetchMessage(gmail: gmail_v1.Gmail, messageId: string, format: 'metadata' | 'full') {
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format,
    metadataHeaders: format === 'metadata' ? ['From', 'To', 'Subject', 'Date'] : undefined,
  })
  return res.data
}

export async function listInboxTodayTool(input: {
  impersonateAs: string
  args: Record<string, unknown>
}): Promise<Record<string, unknown>> {
  try {
    const gmail = await getGmailReadonly(input.impersonateAs)
    const today = todayInTimeZone()
    const [year, month, day] = today.split('-')
    const query = `in:inbox after:${year}/${month}/${day}`

    const list = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: MAX_LIST,
    })

    const ids = (list.data.messages ?? []).map((item) => item.id).filter(Boolean) as string[]
    const messages: Record<string, unknown>[] = []

    for (const id of ids.slice(0, MAX_LIST)) {
      const message = await fetchMessage(gmail, id, 'metadata')
      messages.push(formatMessageSummary(message))
    }

    return {
      mailboxOwner: input.impersonateAs,
      query,
      messageCount: messages.length,
      messages,
      note: 'Bandeja de entrada del usuario autenticado (solo lectura).',
    }
  } catch (err) {
    return {
      error: 'GMAIL_LIST_FAILED',
      message: err instanceof Error ? err.message : 'No se pudo leer la bandeja de entrada.',
    }
  }
}

export async function searchEmailsTool(input: {
  impersonateAs: string
  args: Record<string, unknown>
}): Promise<Record<string, unknown>> {
  try {
    const from = typeof input.args.from === 'string' ? input.args.from.trim() : ''
    const subject = typeof input.args.subject === 'string' ? input.args.subject.trim() : ''
    const queryRaw = typeof input.args.query === 'string' ? input.args.query.trim() : ''

    const parts: string[] = ['in:inbox']
    if (from) parts.push(`from:${from}`)
    if (subject) parts.push(`subject:${subject}`)
    if (queryRaw) parts.push(queryRaw)
    const query = parts.join(' ')

    const gmail = await getGmailReadonly(input.impersonateAs)
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: MAX_LIST,
    })

    const ids = (list.data.messages ?? []).map((item) => item.id).filter(Boolean) as string[]
    const messages: Record<string, unknown>[] = []
    for (const id of ids.slice(0, MAX_LIST)) {
      const message = await fetchMessage(gmail, id, 'metadata')
      messages.push(formatMessageSummary(message))
    }

    return {
      mailboxOwner: input.impersonateAs,
      query,
      messageCount: messages.length,
      messages,
    }
  } catch (err) {
    return {
      error: 'GMAIL_SEARCH_FAILED',
      message: err instanceof Error ? err.message : 'No se pudo buscar en Gmail.',
    }
  }
}

export async function summarizeEmailTool(input: {
  impersonateAs: string
  args: Record<string, unknown>
  usageMeter?: AssistantUsageMeter
}): Promise<Record<string, unknown>> {
  try {
    const messageId = typeof input.args.messageId === 'string' ? input.args.messageId.trim() : ''
    const subjectHint = typeof input.args.subject === 'string' ? input.args.subject.trim() : ''

    const gmail = await getGmailReadonly(input.impersonateAs)
    let targetId = messageId

    if (!targetId && subjectHint) {
      const list = await gmail.users.messages.list({
        userId: 'me',
        q: `in:inbox subject:${subjectHint}`,
        maxResults: 5,
      })
      targetId = list.data.messages?.[0]?.id ?? ''
    }

    if (!targetId) {
      return {
        error: 'INVALID_ARGS',
        message: 'Indicá messageId o subject del correo a resumir.',
      }
    }

    const message = await fetchMessage(gmail, targetId, 'full')
    const formatted = formatMessageSummary(message, true)
    const body =
      typeof formatted.body === 'string' && formatted.body.trim()
        ? formatted.body
        : String(formatted.snippet ?? '')

    if (!body.trim()) {
      return {
        error: 'NO_BODY',
        message: 'El correo no tiene contenido legible para resumir.',
      }
    }

    const generated = await callVertexGemini({
      usageMeter: input.usageMeter,
      systemInstruction:
        'Resumí correos en español de forma concisa. Solo usá el contenido provisto.',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text:
                `De: ${formatted.from}\nAsunto: ${formatted.subject}\n\n` +
                `Contenido:\n${body.slice(0, MAX_BODY_CHARS)}`,
            },
          ],
        },
      ],
      temperature: 0.2,
      maxOutputTokens: 512,
    })

    return {
      ...formatted,
      summary: generated.text.trim(),
    }
  } catch (err) {
    return {
      error: 'GMAIL_SUMMARIZE_FAILED',
      message: err instanceof Error ? err.message : 'No se pudo resumir el correo.',
    }
  }
}
