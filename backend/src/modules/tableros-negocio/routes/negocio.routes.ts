import { Router } from 'express'
import { logError } from '../../../lib/log.js'
import { requireWorkspaceUser } from '../../auth/middleware.js'
import { requireTableroNegocio } from '../requireTableroNegocio.js'
import { DatosNegocioError, leerDatosNegocio } from '../services/leer-datos.js'

export const tablerosNegocioRouter = Router()

tablerosNegocioRouter.use(requireWorkspaceUser)

tablerosNegocioRouter.get('/datos', requireTableroNegocio, async (_req, res) => {
  try {
    res.json(await leerDatosNegocio())
  } catch (err) {
    if (err instanceof DatosNegocioError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    logError('[tableros-negocio] no se pudieron leer los datos', err)
    res.status(502).json({ error: 'No se pudieron leer los datos del tablero' })
  }
})
