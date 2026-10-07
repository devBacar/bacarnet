import type { NextFunction, Request, Response } from 'express'
import { canViewBoard } from '../boards/boardAccess.js'
import { isSuperAdminUser } from '../auth/middleware.js'
import { logError } from '../../lib/log.js'
import { getRrhhBoardFolderId } from './boardRrhhConfig.js'

export type NivelTableroRrhh = 'ver' | 'detalle'

/**
 * Acceso al tablero de RRHH con el mismo esquema que el resto de los tableros: super admin siempre;
 * el resto, si tiene acceso a la carpeta del tablero (botón "Acceso" en Tableros).
 * 'detalle' (nombres, legajos y sueldos) pide además el permiso rrhh_detalle del usuario.
 */
export function requireTableroRrhh(nivel: NivelTableroRrhh) {
  return async function requireTableroRrhhMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    const user = req.authedUser
    if (!user) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }
    if (isSuperAdminUser(user)) {
      next()
      return
    }
    const boardFolderId = getRrhhBoardFolderId()
    if (!boardFolderId) {
      res.status(503).json({ error: 'Tablero de RRHH no configurado' })
      return
    }
    try {
      if (!(await canViewBoard(user, boardFolderId))) {
        res.status(403).json({ error: 'No tenés acceso al tablero de RRHH. Pedíselo a Sistemas.' })
        return
      }
      if (nivel === 'detalle' && user.permissions.rrhh_detalle !== true) {
        res.status(403).json({ error: 'No tenés permiso para ver el detalle por persona de RRHH. Pedíselo a quien administra los usuarios.' })
        return
      }
      next()
    } catch (err) {
      logError('[rrhh] no se pudo verificar el acceso al tablero', err)
      res.status(500).json({ error: 'No se pudo verificar el acceso' })
    }
  }
}
