import { Router } from 'express'
import { logError } from '../../../../lib/log.js'
import { requireWorkspaceUser } from '../../../auth/middleware.js'
import { dateKeyInArgentina } from '../../agenda/domain/vencimiento.alert.js'
import { esMes, mesDeFecha, ultimoMesCompleto } from '../domain/fechas.js'
import type { MonedaTablero } from '../domain/calcular.js'
import { requireTableroFinanzas } from '../requireTableroFinanzas.js'
import { obtenerTableroFinanzas } from '../services/tablero.service.js'

export const finanzasTableroRouter = Router()

finanzasTableroRouter.use(requireWorkspaceUser)

finanzasTableroRouter.get('/', requireTableroFinanzas, async (req, res) => {
  const hoy = dateKeyInArgentina(new Date())
  const mesQuery = typeof req.query.mes === 'string' ? req.query.mes.trim() : ''
  const mes = mesQuery || ultimoMesCompleto(hoy)
  if (!esMes(mes)) {
    res.status(400).json({ error: 'El mes tiene que ser AAAA-MM.' })
    return
  }
  if (mes > mesDeFecha(hoy)) {
    res.status(400).json({ error: 'Ese mes todavía no llegó.' })
    return
  }

  const monedaQuery = typeof req.query.moneda === 'string' ? req.query.moneda.trim().toUpperCase() : 'ARS'
  if (monedaQuery !== 'ARS' && monedaQuery !== 'USD') {
    res.status(400).json({ error: 'La moneda tiene que ser pesos o dólares.' })
    return
  }
  const moneda: MonedaTablero = monedaQuery

  try {
    const tablero = await obtenerTableroFinanzas({ mes, moneda })
    res.json(tablero)
  } catch (err) {
    logError('[finanzas/tablero] no se pudo armar el tablero', err)
    res.status(500).json({ error: 'No se pudo armar el tablero de Finanzas' })
  }
})
