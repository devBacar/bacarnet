import { Router } from 'express'
import { logError } from '../../../lib/log.js'
import { requireRrhh, requireSuperAdmin, requireWorkspaceUser } from '../../auth/middleware.js'

export const rrhhRouter = Router()

rrhhRouter.use(requireWorkspaceUser)

/** Verifica que la API de RRHH responde y que el usuario tiene acceso al módulo. */
rrhhRouter.get('/estado', requireRrhh('ver'), (_req, res) => {
  res.json({ ok: true, modulo: 'rrhh' })
})

/** Últimas corridas de la ingesta del backup de Salario (solo super admin). */
rrhhRouter.get('/ingestas', requireSuperAdmin, async (_req, res) => {
  try {
    const { listarIngestas } = await import('../services/rrhh.repository.js')
    res.json({ ingestas: await listarIngestas() })
  } catch (err) {
    logError('[rrhh] no se pudieron leer las ingestas', err)
    res.status(500).json({ error: 'No se pudieron leer las ingestas' })
  }
})

/**
 * Procesa ya el último backup de Salario (solo super admin).
 * Body opcional: { "forzar": true } para reprocesar un archivo que ya se procesó.
 */
rrhhRouter.post('/ingestas/ejecutar', requireSuperAdmin, async (req, res) => {
  try {
    const { ejecutarIngestaReal } = await import('../services/ingestaRrhh.js')
    const resultado = await ejecutarIngestaReal({
      origen: 'manual',
      actorUid: req.authedUser?.uid ?? 'desconocido',
      forzar: req.body?.forzar === true,
    })
    res.status(resultado.estado === 'error' ? 500 : 200).json(resultado)
  } catch (err) {
    logError('[rrhh] falló la ingesta manual', err)
    res.status(500).json({ error: 'No se pudo procesar el backup de Salario' })
  }
})
