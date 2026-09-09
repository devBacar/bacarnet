import {
  assertCorporateEmailList,
  assertNonEmptyString,
} from './validateCorporateEmails.js'
import { createPendingEmailAction, pendingActionToToolResponse } from './pendingActionStore.js'
import type { EmailActionPayload } from './types.js'

const MAX_SUBJECT_LEN = 500
const MAX_BODY_LEN = 10_000

export async function prepareEmailDraftTool(input: {
  userId: string
  userEmail: string
  impersonateAs: string
  args: Record<string, unknown>
}): Promise<Record<string, unknown>> {
  try {
    const to = assertCorporateEmailList(input.args.to, 'Destinatario (Para)', {
      required: true,
      max: 10,
    })
    const cc = assertCorporateEmailList(input.args.cc, 'Copia (CC)', { max: 10 })
    const subject = assertNonEmptyString(input.args.subject, 'Asunto', MAX_SUBJECT_LEN)
    const body = assertNonEmptyString(input.args.body, 'Cuerpo', MAX_BODY_LEN)

    const payload: EmailActionPayload = { to, cc, subject, body }
    const pending = await createPendingEmailAction({
      userId: input.userId,
      userEmail: input.userEmail,
      impersonateAs: input.impersonateAs,
      payload,
    })

    return pendingActionToToolResponse(pending)
  } catch (err) {
    return {
      error: 'EMAIL_DRAFT_INVALID',
      message: err instanceof Error ? err.message : 'No se pudo preparar el borrador de correo.',
    }
  }
}
