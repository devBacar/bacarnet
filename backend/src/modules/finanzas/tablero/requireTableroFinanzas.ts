import type { NextFunction, Request, Response } from 'express'
import { canViewBoard } from '../../boards/boardAccess.js'
import { isSuperAdminUser } from '../../auth/middleware.js'
import { logError } from '../../../lib/log.js'
import { getFinanzasBoardFolderId } from './boardFinanzasConfig.js'

/**
 * Acceso al tablero de Finanzas con el mismo esquema que el resto de los tableros: super admin siempre;
 * el resto, si tiene acceso a la carpeta del tablero (botón "Acceso" en Tableros).
 * No pide view_finanzas: se puede ver el tablero sin usar el módulo.
 */
export async function requireTableroFinanzas(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }
  if (isSuperAdminUser(user)) {
    next()
    return
  }
  const boardFolderId = getFinanzasBoardFolderId()
  if (!boardFolderId) {
    res.status(503).json({ error: 'Tablero de Finanzas no configurado' })
    return
  }
  try {
    if (!(await canViewBoard(user, boardFolderId))) {
      res.status(403).json({ error: 'No tenés acceso al tablero de Finanzas. Pedíselo a Sistemas.' })
      return
    }
    next()
  } catch (err) {
    logError('[finanzas/tablero] no se pudo verificar el acceso al tablero', err)
    res.status(500).json({ error: 'No se pudo verificar el acceso' })
  }
}
