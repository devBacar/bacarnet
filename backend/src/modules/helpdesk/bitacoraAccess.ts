import type { AuthedUser } from '../auth/middleware.js'
import { isActiveHelpdeskTeamMemberByEmail } from './repository.js'
import type { HelpdeskTicket } from './types.js'

export async function canAccessHelpdeskBitacora(
  user: AuthedUser,
  ticket: HelpdeskTicket,
): Promise<'team' | 'requester' | null> {
  if (await isActiveHelpdeskTeamMemberByEmail(user.email)) {
    return 'team'
  }
  const email = user.email.trim().toLowerCase()
  if (ticket.requesterUid === user.uid) {
    return 'requester'
  }
  if (ticket.requesterEmail.trim().toLowerCase() === email) {
    return 'requester'
  }
  return null
}

export function bitacoraVisibleForTicket(ticket: HelpdeskTicket): boolean {
  return ticket.estadoIdx >= 3 && ticket.estadoIdx <= 5
}
