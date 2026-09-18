import type { AuthedUser } from '../auth/middleware.js'
import { isActiveHelpdeskTeamMemberByEmail } from './repository.js'
import {
  canPostMisProyectoBitacoraComment,
  canViewMisProyectoTicket,
} from './ticketCollaboratorAccess.js'
import type { HelpdeskTicket } from './types.js'

export async function canAccessHelpdeskBitacora(
  user: AuthedUser,
  ticket: HelpdeskTicket,
): Promise<'team' | 'requester' | null> {
  if (await isActiveHelpdeskTeamMemberByEmail(user.email)) {
    return 'team'
  }
  if (canViewMisProyectoTicket(user, ticket)) {
    return 'requester'
  }
  return null
}

export function canPostHelpdeskBitacoraAsRequesterSide(
  user: AuthedUser,
  ticket: HelpdeskTicket,
): boolean {
  return canPostMisProyectoBitacoraComment(user, ticket)
}

export function bitacoraVisibleForTicket(ticket: HelpdeskTicket): boolean {
  return ticket.estadoIdx >= 3 && ticket.estadoIdx <= 5
}
