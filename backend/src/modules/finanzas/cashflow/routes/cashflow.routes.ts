import { Router } from 'express'
import { requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import { CashflowError, getCashflowDiario } from '../services/cashflow.service.js'

export const finanzasCashflowRouter = Router()

finanzasCashflowRouter.get('/', requireWorkspaceUser, requireViewFinanzas, async (req, res) => {
  const fecha = typeof req.query.fecha === 'string' ? req.query.fecha : undefined
  const moneda = typeof req.query.moneda === 'string' ? req.query.moneda : undefined
  try {
    const cashflow = await getCashflowDiario({ fecha, moneda })
    res.json(cashflow)
  } catch (err) {
    if (err instanceof CashflowError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    console.error('[finanzas/cashflow]', err)
    res.status(500).json({ error: 'No se pudo calcular el cashflow' })
  }
})
