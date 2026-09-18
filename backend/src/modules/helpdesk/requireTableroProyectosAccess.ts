import type { NextFunction, Request, Response } from 'express'
import { canViewBoard } from '../boards/boardAccess.js'
import { getHelpdeskBoardProyectosFolderId } from './boardProyectosConfig.js'

export async function requireTableroProyectosAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const boardFolderId = getHelpdeskBoardProyectosFolderId()
  if (!boardFolderId) {
    res.status(503).json({ error: 'Tablero Desarrollo · Proyectos no configurado' })
    return
  }

  if (!(await canViewBoard(user, boardFolderId))) {
    res.status(403).json({ error: 'No tenés permiso para ver este tablero' })
    return
  }

  next()
}
