import { Router } from 'express'
import { requireViewFinanzas, requireWorkspaceUser } from '../../auth/middleware.js'
import { resetManualUsdAccountsNeverLoaded } from '../services/cuentas.repository.js'
import {
  listCuentasForApi,
  setManualSaldoForCuenta,
  syncCuentasFromProvider,
} from '../services/cuentas.service.js'

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

/** Limpia saldos mock en USD manuales (saldo 0, sin auditoría). Misma base que el listado. */
finanzasCuentasRouter.post(
  '/manual-usd/reiniciar-sin-carga',
  requireWorkspaceUser,
  requireViewFinanzas,
  async (_req, res) => {
    try {
      await resetManualUsdAccountsNeverLoaded()
      const data = await listCuentasForApi()
      res.json(data)
    } catch (err) {
      console.error('[finanzas/cuentas] reiniciar-usd-manual', err)
      res.status(500).json({ error: 'No se pudieron reiniciar las cuentas USD manuales' })
    }
  },
)

finanzasCuentasRouter.patch(
  '/:id/saldo-manual',
  requireWorkspaceUser,
  requireViewFinanzas,
  async (req, res) => {
    const actorUid = req.authedUser?.uid
    const actorEmail = req.authedUser?.email?.trim()
    if (!actorUid || !actorEmail) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }
    const body = req.body as { saldoActualCentavos?: unknown }
    const saldoActualCentavos = body.saldoActualCentavos
    if (typeof saldoActualCentavos !== 'number') {
      res.status(400).json({ error: 'saldoActualCentavos es obligatorio (número en centavos)' })
      return
    }
    try {
      const cuenta = await setManualSaldoForCuenta({
        cuentaId: req.params.id,
        saldoActualCentavos,
        actorUid,
        actorEmail,
      })
      res.json({ cuenta })
    } catch (err) {
      console.error('[finanzas/cuentas] saldo-manual', err)
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el saldo'
      const status = message.includes('no encontrada') ? 404 : 400
      res.status(status).json({ error: message })
    }
  },
)

finanzasCuentasRouter.post('/sync', requireWorkspaceUser, requireViewFinanzas, async (req, res) => {
  const actorUid = req.authedUser?.uid
  if (!actorUid) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }
  try {
    const result = await syncCuentasFromProvider({ actorUid })
    res.json(result)
  } catch (err) {
    console.error('[finanzas/cuentas] sync', err)
    const message = err instanceof Error ? err.message : 'No se pudo sincronizar con el proveedor bancario'
    res.status(502).json({ error: message })
  }
})
