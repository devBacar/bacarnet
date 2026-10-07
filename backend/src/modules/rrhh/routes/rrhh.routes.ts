import { Router } from 'express'
import { logError } from '../../../lib/log.js'
import { requireSuperAdmin, requireWorkspaceUser } from '../../auth/middleware.js'
import { requireTableroRrhh } from '../requireTableroRrhh.js'

export const rrhhRouter = Router()

rrhhRouter.use(requireWorkspaceUser)

/** Verifica que la API de RRHH responde y que el usuario tiene acceso al módulo. */
rrhhRouter.get('/estado', requireTableroRrhh('ver'), (_req, res) => {
  res.json({ ok: true, modulo: 'rrhh' })
})

/** Informe mensual para el perfil Directorio: solo agregados por área (sin nombres ni legajos). */
rrhhRouter.get('/informe', requireTableroRrhh('ver'), async (_req, res) => {
  try {
    const { leerInformeAgregado } = await import('../services/rrhh.repository.js')
    const informe = await leerInformeAgregado()
    if (!informe) {
      res.status(404).json({ error: 'Todavía no se procesó ningún backup de Salario.' })
      return
    }
    res.json(informe)
  } catch (err) {
    logError('[rrhh] no se pudo leer el informe', err)
    res.status(500).json({ error: 'No se pudo leer el informe de RRHH' })
  }
})

/** Personas de un mes con sus importes (para la lista de Costos): solo perfil RRHH. */
rrhhRouter.get('/informe/personas/:mes', requireTableroRrhh('detalle'), async (req, res) => {
  const mes = String(req.params.mes ?? '')
  if (!/^\d{6}$/.test(mes)) {
    res.status(400).json({ error: 'Mes inválido (AAAAMM).' })
    return
  }
  try {
    const { leerCostosPersonas } = await import('../services/rrhh.repository.js')
    const datos = await leerCostosPersonas(mes)
    if (!datos) {
      res.status(404).json({ error: 'No hay datos de ese mes.' })
      return
    }
    res.json(datos)
  } catch (err) {
    logError('[rrhh] no se pudieron leer las personas del mes', err)
    res.status(500).json({ error: 'No se pudieron leer las personas del mes' })
  }
})

/** Detalle por persona (límite legal de horas extra): solo perfil RRHH. */
rrhhRouter.get('/informe/detalle', requireTableroRrhh('detalle'), async (_req, res) => {
  try {
    const { leerInformeDetalle } = await import('../services/rrhh.repository.js')
    const detalle = await leerInformeDetalle()
    if (!detalle) {
      res.status(404).json({ error: 'Todavía no se procesó ningún backup de Salario.' })
      return
    }
    res.json(detalle)
  } catch (err) {
    logError('[rrhh] no se pudo leer el detalle del informe', err)
    res.status(500).json({ error: 'No se pudo leer el detalle de RRHH' })
  }
})

/**
 * RRHH confirma o saca a una persona de las horas pactadas.
 * Body: { "cambio": "confirmar" | "descartar" | "automatico" }. Se aplica en la próxima ingesta.
 */
rrhhRouter.post('/pactadas/:legajo', requireTableroRrhh('detalle'), async (req, res) => {
  const legajo = Number(req.params.legajo)
  const cambio = req.body?.cambio
  if (!Number.isInteger(legajo) || legajo <= 0 || !['confirmar', 'descartar', 'automatico'].includes(cambio)) {
    res.status(400).json({ error: 'Legajo o cambio inválido' })
    return
  }
  try {
    const { guardarCambioPactada } = await import('../services/rrhh.repository.js')
    const config = await guardarCambioPactada(legajo, cambio, req.authedUser?.uid ?? 'desconocido')
    res.json({ ok: true, config })
  } catch (err) {
    logError('[rrhh] no se pudo guardar el cambio de horas pactadas', err)
    res.status(500).json({ error: 'No se pudo guardar el cambio' })
  }
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
 * Procesa ya el último backup de Salario (solo super admin): corre dentro de la function `api`, que atiende a toda
 * la intranet, así que es una acción de Sistemas, a mano. El resto ve los datos de la lectura programada (15:30 y 22:30).
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
