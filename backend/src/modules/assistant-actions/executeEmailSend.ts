import { getGmail } from '../../lib/google/workspaceGoogleClients.js'
import type { EmailActionPayload } from './types.js'
import { markdownToEmailHtml } from './markdownToEmailHtml.js'

function buildRawEmail(input: {
  from: string
  to: string[]
  cc: string[]
  subject: string
  bodyHtml: string
}): string {
  const lines = [
    `To: ${input.to.join(', ')}`,
    ...(input.cc.length > 0 ? [`Cc: ${input.cc.join(', ')}`] : []),
    `From: ${input.from}`,
    `Subject: ${input.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    input.bodyHtml,
  ]
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url')
}

export async function executeEmailSend(input: {
  impersonateAs: string
  payload: EmailActionPayload
}): Promise<{ messageId: string; threadId: string | null | undefined }> {
  const gmail = await getGmail(input.impersonateAs)
  const bodyHtml = markdownToEmailHtml(input.payload.body)
  const raw = buildRawEmail({
    from: input.impersonateAs,
    to: input.payload.to,
    cc: input.payload.cc,
    subject: input.payload.subject,
    bodyHtml,
  })

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  })

  return {
    messageId: res.data.id ?? '',
    threadId: res.data.threadId,
  }
}
