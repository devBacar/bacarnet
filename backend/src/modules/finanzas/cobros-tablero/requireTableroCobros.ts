import type { NextFunction, Request, Response } from 'express'
import { canViewBoard } from '../../boards/boardAccess.js'
import { isSuperAdminUser } from '../../auth/middleware.js'
import { logError } from '../../../lib/log.js'
import { getCobrosBoardFolderId } from './boardCobrosConfig.js'

/**
 * Acceso al tablero de Cobros con el mismo esquema que el resto de los tableros: super admin siempre;
 * el resto, si tiene acceso a la carpeta del tablero (botón "Acceso" en Tableros). No pide ningún
 * permiso de módulo: se puede ver el tablero sin tener acceso a Finanzas ni a Vientri.
 */
export async function requireTableroCobros(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }
  if (isSuperAdminUser(user)) {
    next()
    return
  }
  const boardFolderId = getCobrosBoardFolderId()
  if (!boardFolderId) {
    res.status(503).json({ error: 'Tablero de Cobros no configurado' })
    return
  }
  try {
    if (!(await canViewBoard(user, boardFolderId))) {
      res.status(403).json({ error: 'No tenés acceso al tablero de Cobros. Pedíselo a Sistemas.' })
      return
    }
    next()
  } catch (err) {
    logError('[finanzas/cobros-tablero] no se pudo verificar el acceso al tablero', err)
    res.status(500).json({ error: 'No se pudo verificar el acceso' })
  }
}
