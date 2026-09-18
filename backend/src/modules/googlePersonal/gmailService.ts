import { google } from 'googleapis'
import { GoogleReconnectRequiredError, isInvalidGrantError } from './errors.js'
import { extractMessageBodies, getHeader } from './gmailBody.js'
import { deleteGooglePersonalIntegration } from './store.js'

const GMAIL_INBOX_QUERY =
  'is:unread in:inbox -in:spam -category:promotions -category:social (category:primary OR is:important)'

export interface WidgetGmailMessage {
  id: string
  from: string
  subject: string
}

function parseSender(from: string): string {
  const trimmed = from.trim()
  if (!trimmed) return 'Remitente desconocido'

  const nameWithEmail = trimmed.match(/^("?)(.+?)\1\s*<[^>]+>$/)
  if (nameWithEmail) {
    return nameWithEmail[2].replace(/^"|"$/g, '').trim() || trimmed
  }

  if (trimmed.includes('@')) {
    return trimmed.split('@')[0]
  }

  return trimmed
}

export interface WidgetGmailMessageDetail {
  id: string
  from: string
  subject: string
  date: string | null
  bodyText: string
  bodyHtml: string | null
  gmailWebUrl: string
}

export async function fetchWidgetGmailMessages(
  uid: string,
  auth: unknown,
): Promise<WidgetGmailMessage[]> {
  const gmail = google.gmail({ version: 'v1', auth: auth as never })

  try {
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: GMAIL_INBOX_QUERY,
      maxResults: 10,
    })

    const refs = list.data.messages ?? []
    if (refs.length === 0) return []

    const details = await Promise.all(
      refs.map(async (message) => {
        if (!message.id) return null
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject'],
        })
        const fromRaw = getHeader(detail.data.payload?.headers, 'From')
        const subjectRaw = getHeader(detail.data.payload?.headers, 'Subject')
        return {
          id: message.id,
          from: parseSender(fromRaw),
          subject: subjectRaw || '(Sin asunto)',
        }
      }),
    )

    return details.filter((item): item is WidgetGmailMessage => item !== null)
  } catch (err) {
    if (isInvalidGrantError(err)) {
      await deleteGooglePersonalIntegration(uid)
      throw new GoogleReconnectRequiredError()
    }
    throw err
  }
}

export async function fetchWidgetGmailMessageDetail(
  uid: string,
  auth: unknown,
  messageId: string,
): Promise<WidgetGmailMessageDetail | null> {
  const gmail = google.gmail({ version: 'v1', auth: auth as never })

  try {
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    })

    const fromRaw = getHeader(detail.data.payload?.headers, 'From')
    const subjectRaw = getHeader(detail.data.payload?.headers, 'Subject')
    const dateRaw = getHeader(detail.data.payload?.headers, 'Date')
    const { bodyText, bodyHtml } = extractMessageBodies(detail.data.payload ?? undefined)

    let date: string | null = null
    if (dateRaw) {
      const parsed = new Date(dateRaw)
      date = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
    } else if (detail.data.internalDate) {
      date = new Date(Number(detail.data.internalDate)).toISOString()
    }

    return {
      id: messageId,
      from: fromRaw || 'Remitente desconocido',
      subject: subjectRaw || '(Sin asunto)',
      date,
      bodyText,
      bodyHtml,
      gmailWebUrl: `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(messageId)}`,
    }
  } catch (err) {
    if (isInvalidGrantError(err)) {
      await deleteGooglePersonalIntegration(uid)
      throw new GoogleReconnectRequiredError()
    }
    throw err
  }
}
