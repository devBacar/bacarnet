import { Router } from 'express'
import { requireRrhh, requireWorkspaceUser } from '../../auth/middleware.js'

export const rrhhRouter = Router()

rrhhRouter.use(requireWorkspaceUser)

/** PR 1: verifica que la API de RRHH responde y que el usuario tiene acceso al módulo. */
rrhhRouter.get('/estado', requireRrhh('ver'), (_req, res) => {
  res.json({ ok: true, modulo: 'rrhh' })
})
