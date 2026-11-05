import { Router, type Request, type Response } from 'express'
import { logError } from '../../../../lib/log.js'
import { requireWorkspaceUser } from '../../../auth/middleware.js'
import { dateKeyInArgentina } from '../../agenda/domain/vencimiento.alert.js'
import { requireTableroCobros } from '../requireTableroCobros.js'
import { obtenerDetalleCliente, obtenerTableroCobros } from '../services/cobros-tablero.service.js'

export const finanzasCobrosTableroRouter = Router()

finanzasCobrosTableroRouter.use(requireWorkspaceUser)

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
/** Por default, "cobrado en el período" mira los últimos 30 días. */
const DIAS_PERIODO_DEFAULT = 30

function addIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map((part) => Number(part))
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Valida desde/hasta (AAAA-MM-DD, desde <= hasta) y moneda (ARS/USD) de la querystring. null si hay error. */
function leerParametros(req: Request, res: Response): { desde: string; hasta: string; moneda: 'ARS' | 'USD' } | null {
  const hoy = dateKeyInArgentina(new Date())
  const hastaQuery = typeof req.query.hasta === 'string' ? req.query.hasta.trim() : ''
  const desdeQuery = typeof req.query.desde === 'string' ? req.query.desde.trim() : ''
  const hasta = hastaQuery || hoy
  const desde = desdeQuery || addIsoDays(hasta, -DIAS_PERIODO_DEFAULT)
  if (!ISO_DATE.test(desde) || !ISO_DATE.test(hasta)) {
    res.status(400).json({ error: 'desde y hasta tienen que tener formato AAAA-MM-DD' })
    return null
  }
  if (desde > hasta) {
    res.status(400).json({ error: 'desde no puede ser posterior a hasta' })
    return null
  }
  const monedaQuery = typeof req.query.moneda === 'string' ? req.query.moneda.trim().toUpperCase() : 'ARS'
  if (monedaQuery !== 'ARS' && monedaQuery !== 'USD') {
    res.status(400).json({ error: 'La moneda tiene que ser pesos o dólares' })
    return null
  }
  return { desde, hasta, moneda: monedaQuery }
}

finanzasCobrosTableroRouter.get('/', requireTableroCobros, async (req, res) => {
  const parametros = leerParametros(req, res)
  if (!parametros) return
  try {
    const tablero = await obtenerTableroCobros(parametros)
    res.json(tablero)
  } catch (err) {
    logError('[finanzas/cobros-tablero] no se pudo armar el tablero', err)
    res.status(500).json({ error: 'No se pudo armar el tablero de Cobros' })
  }
})

finanzasCobrosTableroRouter.get('/cliente/:vientriId', requireTableroCobros, async (req, res) => {
  const parametros = leerParametros(req, res)
  if (!parametros) return
  const vientriId = Number(req.params.vientriId)
  if (!Number.isFinite(vientriId)) {
    res.status(400).json({ error: 'Cliente inválido' })
    return
  }
  try {
    const detalle = await obtenerDetalleCliente({ ...parametros, vientriId })
    res.json(detalle)
  } catch (err) {
    logError('[finanzas/cobros-tablero] no se pudo armar el detalle del cliente', err)
    res.status(500).json({ error: 'No se pudo armar el detalle del cliente' })
  }
})
