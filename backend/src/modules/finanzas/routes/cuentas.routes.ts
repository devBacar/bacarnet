import { Router } from 'express'
import { requireViewFinanzas, requireWorkspaceUser } from '../../auth/middleware.js'
import { isFinanzasCajaLider } from '../cajachica/services/caja.access.js'
import { resetManualUsdAccountsNeverLoaded } from '../services/cuentas.repository.js'
import {
  capturePosicionCierre,
  listCuentasForApi,
  listPosicionCierresUltimos30Dias,
  setDescubiertoForCuenta,
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

finanzasCuentasRouter.get(
  '/historial',
  requireWorkspaceUser,
  requireViewFinanzas,
  async (_req, res) => {
    try {
      const cierres = await listPosicionCierresUltimos30Dias()
      res.json({ cierres, retencionDias: 30, horaCierre: '15:00' })
    } catch (err) {
      console.error('[finanzas/cuentas] historial', err)
      res.status(500).json({ error: 'No se pudo cargar el historial de posiciones' })
    }
  },
)

/** Captura manual idempotente para pruebas del emulador y recuperación operativa. */
finanzasCuentasRouter.post(
  '/historial/capturar',
  requireWorkspaceUser,
  requireViewFinanzas,
  async (req, res) => {
    const actorUid = req.authedUser?.uid
    if (!actorUid) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }
    try {
      const body = req.body as { sincronizar?: unknown }
      const cierre = await capturePosicionCierre({
        actorUid,
        syncBeforeCapture: body.sincronizar === true,
      })
      res.status(201).json({ cierre })
    } catch (err) {
      console.error('[finanzas/cuentas] capturar historial', err)
      const message = err instanceof Error ? err.message : 'No se pudo capturar la posición'
      res.status(400).json({ error: message })
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

/** Acuerdo de descubierto por cuenta corriente: Interbanking no lo informa, se carga a mano. */
finanzasCuentasRouter.patch(
  '/:id/descubierto',
  requireWorkspaceUser,
  requireViewFinanzas,
  async (req, res) => {
    const user = req.authedUser
    const actorEmail = user?.email?.trim()
    if (!user || !actorEmail) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }
    if (!isFinanzasCajaLider(user)) {
      res
        .status(403)
        .json({ error: 'Solo el líder de Finanzas o un super admin pueden cambiar el descubierto' })
      return
    }
    try {
      const cuenta = await setDescubiertoForCuenta({
        cuentaId: req.params.id,
        body: (req.body ?? {}) as { descubiertoCentavos?: unknown; vigenteDesde?: unknown },
        actorEmail,
      })
      res.json({ cuenta })
    } catch (err) {
      console.error('[finanzas/cuentas] descubierto', err)
      const message = err instanceof Error ? err.message : 'No se pudo guardar el descubierto'
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
