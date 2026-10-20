import type { NextFunction, Request, Response } from 'express'
import { canViewBoard } from '../boards/boardAccess.js'
import { isSuperAdminUser } from '../auth/middleware.js'
import { logError } from '../../lib/log.js'
import { getNegocioBoardFolderId } from './boardNegocioConfig.js'

/**
 * Acceso al tablero "Finanzas – Negocio" con el mismo esquema que el resto de los tableros: super admin siempre;
 * el resto, si tiene acceso a la carpeta del tablero (botón "Acceso" en Tableros).
 */
export async function requireTableroNegocio(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }
  if (isSuperAdminUser(user)) {
    next()
    return
  }
  const boardFolderId = getNegocioBoardFolderId()
  if (!boardFolderId) {
    res.status(503).json({ error: 'Tablero de Negocio no configurado' })
    return
  }
  try {
    if (!(await canViewBoard(user, boardFolderId))) {
      res.status(403).json({ error: 'No tenés acceso al tablero de Negocio. Pedíselo a Sistemas.' })
      return
    }
    next()
  } catch (err) {
    logError('[tableros-negocio] no se pudo verificar el acceso al tablero', err)
    res.status(500).json({ error: 'No se pudo verificar el acceso' })
  }
}
