import type { NextFunction, Request, Response } from 'express'
import { isActiveHelpdeskTeamMemberByEmail } from './repository.js'

const FORBIDDEN_MESSAGE = 'No tenés acceso al panel de Desarrollo de Sistemas'

/** Requiere req.authedUser (usar después de requireWorkspaceUser). */
export async function requireHelpdeskTeamMember(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const email = req.authedUser?.email?.trim().toLowerCase()
  if (!email) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const isMember = await isActiveHelpdeskTeamMemberByEmail(email)
  if (!isMember) {
    res.status(403).json({ error: FORBIDDEN_MESSAGE })
    return
  }

  next()
}
