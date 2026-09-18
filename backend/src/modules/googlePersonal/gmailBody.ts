type GmailHeader = { name?: string | null; value?: string | null }

type GmailPart = {
  mimeType?: string | null
  body?: { data?: string | null; size?: number | null } | null
  parts?: GmailPart[] | null
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/')
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(normalized + pad, 'base64').toString('utf8')
}

function collectBodies(part: GmailPart | undefined, out: { text: string[]; html: string[] }): void {
  if (!part) return
  const mime = part.mimeType?.toLowerCase() ?? ''
  const data = part.body?.data
  if (data) {
    if (mime === 'text/plain') out.text.push(decodeBase64Url(data))
    else if (mime === 'text/html') out.html.push(decodeBase64Url(data))
  }
  for (const child of part.parts ?? []) {
    collectBodies(child, out)
  }
}

/** Quita scripts, iframes y handlers inline antes de enviar HTML al cliente. */
export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/\bon\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
}

export function extractMessageBodies(payload: GmailPart | undefined): {
  bodyText: string
  bodyHtml: string | null
} {
  const collected = { text: [] as string[], html: [] as string[] }
  collectBodies(payload, collected)
  const bodyText = collected.text.join('\n\n').trim()
  const rawHtml = collected.html.join('\n').trim()
  if (bodyText) {
    return { bodyText, bodyHtml: rawHtml ? sanitizeEmailHtml(rawHtml) : null }
  }
  if (rawHtml) {
    const stripped = sanitizeEmailHtml(rawHtml)
    const plain = stripped
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim()
    return { bodyText: plain || '(Sin contenido de texto)', bodyHtml: stripped }
  }
  return { bodyText: '(Sin contenido de texto)', bodyHtml: null }
}

export function getHeader(
  headers: GmailHeader[] | undefined,
  name: string,
): string {
  const header = headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())
  return header?.value?.trim() ?? ''
}
