import { Router, type Request, type Response } from 'express'
import { logError } from '../../../../lib/log.js'
import { requireWorkspaceUser } from '../../../auth/middleware.js'
import { dateKeyInArgentina } from '../../agenda/domain/vencimiento.alert.js'
import { esMes, mesDeFecha, sumarMeses, ultimoMesCompleto } from '../../tablero/domain/fechas.js'
import { requireTableroVentas } from '../requireTableroVentas.js'
import { obtenerTableroVentas } from '../services/ventas-tablero.service.js'
import { cargarHistorialCliente } from '../services/ventas-tablero.repository.js'

export const finanzasVentasTableroRouter = Router()

finanzasVentasTableroRouter.use(requireWorkspaceUser)

const MESES_TENDENCIA = 6

/** Valida mes (AAAA-MM, no futuro) y moneda (ARS/USD) de la querystring. null si hay error (ya respondido). */
function leerMesYMoneda(req: Request, res: Response): { mes: string; moneda: 'ARS' | 'USD' } | null {
  const hoy = dateKeyInArgentina(new Date())
  const mesQuery = typeof req.query.mes === 'string' ? req.query.mes.trim() : ''
  const mes = mesQuery || ultimoMesCompleto(hoy)
  if (!esMes(mes)) {
    res.status(400).json({ error: 'El mes tiene que ser AAAA-MM.' })
    return null
  }
  if (mes > mesDeFecha(hoy)) {
    res.status(400).json({ error: 'Ese mes todavía no llegó.' })
    return null
  }
  const monedaQuery = typeof req.query.moneda === 'string' ? req.query.moneda.trim().toUpperCase() : 'ARS'
  if (monedaQuery !== 'ARS' && monedaQuery !== 'USD') {
    res.status(400).json({ error: 'La moneda tiene que ser pesos o dólares.' })
    return null
  }
  return { mes, moneda: monedaQuery }
}

finanzasVentasTableroRouter.get('/', requireTableroVentas, async (req, res) => {
  const parametros = leerMesYMoneda(req, res)
  if (!parametros) return
  try {
    const tablero = await obtenerTableroVentas(parametros)
    res.json(tablero)
  } catch (err) {
    logError('[finanzas/ventas-tablero] no se pudo armar el tablero', err)
    res.status(500).json({ error: 'No se pudo armar el tablero de Ventas' })
  }
})

finanzasVentasTableroRouter.get('/cliente-historial', requireTableroVentas, async (req, res) => {
  const parametros = leerMesYMoneda(req, res)
  if (!parametros) return
  const vientriId = Number(req.query.vientriId)
  if (!Number.isFinite(vientriId)) {
    res.status(400).json({ error: 'Falta el cliente (vientriId).' })
    return
  }
  const meses: string[] = []
  for (let i = MESES_TENDENCIA - 1; i >= 0; i--) meses.push(sumarMeses(parametros.mes, -i))
  try {
    const tendencia = await cargarHistorialCliente(vientriId, meses, parametros.moneda)
    res.json({ vientriId, tendencia })
  } catch (err) {
    logError('[finanzas/ventas-tablero] no se pudo armar el historial del cliente', err)
    res.status(500).json({ error: 'No se pudo armar el historial del cliente' })
  }
})
