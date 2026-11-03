import { Router } from 'express'
import { logError } from '../../../../lib/log.js'
import { requireWorkspaceUser } from '../../../auth/middleware.js'
import { dateKeyInArgentina } from '../../agenda/domain/vencimiento.alert.js'
import { esMes, mesDeFecha, ultimoMesCompleto } from '../../tablero/domain/fechas.js'
import { requireTableroVentas } from '../requireTableroVentas.js'
import { obtenerTableroVentas } from '../services/ventas-tablero.service.js'

export const finanzasVentasTableroRouter = Router()

finanzasVentasTableroRouter.use(requireWorkspaceUser)

finanzasVentasTableroRouter.get('/', requireTableroVentas, async (req, res) => {
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

  try {
    const tablero = await obtenerTableroVentas({ mes, moneda: monedaQuery })
    res.json(tablero)
  } catch (err) {
    logError('[finanzas/ventas-tablero] no se pudo armar el tablero', err)
    res.status(500).json({ error: 'No se pudo armar el tablero de Ventas' })
  }
})
