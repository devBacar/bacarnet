import type { AuthedUser } from '../auth/middleware.js'
import type { HelpdeskColaboradorSolicitanteRol, HelpdeskTicket } from './types.js'

export type MisProyectoAccesoRol = 'propio' | 'lector' | 'editor'

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isTicketRequester(user: Pick<AuthedUser, 'uid' | 'email'>, ticket: HelpdeskTicket): boolean {
  const email = normalizedEmail(user.email)
  if (ticket.requesterUid && ticket.requesterUid === user.uid) return true
  if (normalizedEmail(ticket.requesterEmail) === email) return true
  return false
}

function findColaboradorSolicitante(
  user: Pick<AuthedUser, 'uid' | 'email'>,
  ticket: HelpdeskTicket,
): { rol: HelpdeskColaboradorSolicitanteRol } | null {
  const list = ticket.colaboradoresSolicitante ?? []
  if (list.length === 0) return null
  const email = normalizedEmail(user.email)
  for (const row of list) {
    if (row.uid && row.uid === user.uid) return { rol: row.rol }
    if (normalizedEmail(row.email) === email) return { rol: row.rol }
  }
  return null
}

/** Rol con el que el usuario ve el ticket en «Mis proyectos». */
export function misProyectoAccesoRol(
  user: Pick<AuthedUser, 'uid' | 'email'>,
  ticket: HelpdeskTicket,
): MisProyectoAccesoRol | null {
  if (isTicketRequester(user, ticket)) return 'propio'
  const colab = findColaboradorSolicitante(user, ticket)
  if (!colab) return null
  return colab.rol
}

export function canViewMisProyectoTicket(
  user: Pick<AuthedUser, 'uid' | 'email'>,
  ticket: HelpdeskTicket,
): boolean {
  return misProyectoAccesoRol(user, ticket) !== null
}

export function canPostMisProyectoBitacoraComment(
  user: Pick<AuthedUser, 'uid' | 'email'>,
  ticket: HelpdeskTicket,
): boolean {
  const rol = misProyectoAccesoRol(user, ticket)
  return rol === 'propio' || rol === 'editor'
}

export function syncColaboradorIndexFields(
  colaboradores: HelpdeskTicket['colaboradoresSolicitante'],
): { colaboradorUids: string[]; colaboradorEmails: string[] } {
  const uids = new Set<string>()
  const emails = new Set<string>()
  for (const row of colaboradores ?? []) {
    const em = normalizedEmail(row.email)
    if (em) emails.add(em)
    if (row.uid?.trim()) uids.add(row.uid.trim())
  }
  return {
    colaboradorUids: [...uids],
    colaboradorEmails: [...emails],
  }
}
