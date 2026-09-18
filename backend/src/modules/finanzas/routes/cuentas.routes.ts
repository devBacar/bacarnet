import { Router } from 'express'
import { requireViewFinanzas, requireWorkspaceUser } from '../../auth/middleware.js'
import { listCuentasForApi } from '../services/cuentas.service.js'

export const finanzasCuentasRouter = Router()

finanzasCuentasRouter.get('/', requireWorkspaceUser, requireViewFinanzas, async (_req, res) => {
  try {
    const data = await listCuentasForApi()
    res.json(data)
  } catch (err) {
    console.error('[finanzas/cuentas] list', err)
    res.status(500).json({ error: 'No se pudieron cargar las cuentas' })
  }
})
