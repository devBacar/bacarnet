import { Router } from 'express'
import { logError } from '../../../../lib/log.js'
import { requireWorkspaceUser } from '../../../auth/middleware.js'
import { dateKeyInArgentina } from '../../agenda/domain/vencimiento.alert.js'
import { esMes, mesDeFecha, ultimoMesCompleto } from '../../tablero/domain/fechas.js'
import { requireTableroCombustible } from '../requireTableroCombustible.js'
import { obtenerTableroCombustible } from '../services/combustible-tablero.service.js'
import { PRIMER_MES_CON_DATOS } from '../services/combustible-tablero.repository.js'

export const finanzasCombustibleTableroRouter = Router()

finanzasCombustibleTableroRouter.use(requireWorkspaceUser)

finanzasCombustibleTableroRouter.get('/', requireTableroCombustible, async (req, res) => {
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
  if (mes < PRIMER_MES_CON_DATOS) {
    res.status(400).json({ error: `No hay datos de combustible antes de ${PRIMER_MES_CON_DATOS}.` })
    return
  }
  try {
    const tablero = await obtenerTableroCombustible({ mes })
    res.json(tablero)
  } catch (err) {
    logError('[finanzas/combustible-tablero] no se pudo armar el tablero', err)
    res.status(500).json({ error: 'No se pudo armar el tablero de Combustible' })
  }
})
