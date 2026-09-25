import { Router } from 'express'
import { requireFinanzasCajaModule, requireWorkspaceUser } from '../../../auth/middleware.js'
import { parseMultipartUpload } from '../../../drive/parseMultipartUpload.js'
import {
  aprobarCierre,
  assertCajasModuleAccess,
  cerrarCaja,
  changeCajaResponsable,
  comprarUsdDesdePrincipal,
  createCajaForLider,
  fondearCajaChica,
  listCajasForUser,
  listCierres,
  listCierresPendientes,
  listMovimientos,
  listResponsablesForLider,
  registerMovimiento,
  renameCaja,
  softDeleteCaja,
} from '../services/caja.service.js'

export const finanzasCajasRouter = Router()

finanzasCajasRouter.use(requireWorkspaceUser, requireFinanzasCajaModule)

finanzasCajasRouter.get('/acceso', async (req, res) => {
  const user = req.authedUser!
  const ok = await assertCajasModuleAccess(user)
  res.json({ acceso: ok })
})

finanzasCajasRouter.get('/', async (req, res) => {
  try {
    const cajas = await listCajasForUser(req.authedUser!)
    res.json({ cajas })
  } catch (err) {
    console.error('[finanzas/cajas] list', err)
    res.status(500).json({ error: 'No se pudieron listar las cajas' })
  }
})

finanzasCajasRouter.get('/cierres-pendientes', async (req, res) => {
  try {
    const cierres = await listCierresPendientes(req.authedUser!)
    res.json({ cierres })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudieron listar cierres pendientes'
    res.status(message.includes('líder') ? 403 : 400).json({ error: message })
  }
})

finanzasCajasRouter.get('/responsables', async (req, res) => {
  try {
    const responsables = await listResponsablesForLider(req.authedUser!)
    res.json({ responsables })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudieron listar responsables'
    res.status(message.includes('líder') ? 403 : 400).json({ error: message })
  }
})

finanzasCajasRouter.post('/', async (req, res) => {
  try {
    const caja = await createCajaForLider(req.authedUser!, req.body as Record<string, unknown>)
    res.status(201).json({ caja })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo crear la caja'
    res.status(400).json({ error: message })
  }
})

finanzasCajasRouter.delete('/:id', async (req, res) => {
  try {
    const caja = await softDeleteCaja(req.authedUser!, req.params.id)
    res.json({ caja })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo eliminar la caja'
    const status = message.includes('líder') ? 403 : 400
    res.status(status).json({ error: message })
  }
})

finanzasCajasRouter.patch('/:id', async (req, res) => {
  try {
    const caja = await renameCaja(req.authedUser!, req.params.id, req.body as Record<string, unknown>)
    res.json({ caja })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo editar la caja'
    res.status(message.includes('líder') ? 403 : 400).json({ error: message })
  }
})

finanzasCajasRouter.post('/:principalId/fondear', async (req, res) => {
  try {
    const result = await fondearCajaChica(
      req.authedUser!,
      req.params.principalId,
      req.body as Record<string, unknown>,
    )
    res.status(201).json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo fondear'
    res.status(400).json({ error: message })
  }
})

finanzasCajasRouter.post('/:principalId/comprar-usd', async (req, res) => {
  try {
    let body: Record<string, unknown> = {}
    let comprobante: { fileName: string; mimeType: string; buffer: Buffer } | null = null
    const contentType = req.headers['content-type'] ?? ''
    if (contentType.includes('multipart/form-data')) {
      const parsed = await parseMultipartUpload(req)
      body = parsed.fields
      if (parsed.file) {
        comprobante = {
          fileName: parsed.file.originalname,
          mimeType: parsed.file.mimetype,
          buffer: parsed.file.buffer,
        }
      }
    } else {
      body = req.body as Record<string, unknown>
    }
    const result = await comprarUsdDesdePrincipal({
      user: req.authedUser!,
      cajaArsId: req.params.principalId,
      body,
      comprobante,
    })
    res.status(201).json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo registrar la compra de USD'
    res.status(message.includes('Solo el líder') ? 403 : 400).json({ error: message })
  }
})

finanzasCajasRouter.post('/:id/responsable', async (req, res) => {
  try {
    const caja = await changeCajaResponsable(
      req.authedUser!,
      req.params.id,
      req.body as Record<string, unknown>,
    )
    res.json({ caja })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo cambiar el responsable'
    res.status(400).json({ error: message })
  }
})

finanzasCajasRouter.get('/:id/movimientos', async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>
    const result = await listMovimientos(req.authedUser!, req.params.id, {
      desde: typeof query.desde === 'string' ? query.desde : undefined,
      hasta: typeof query.hasta === 'string' ? query.hasta : undefined,
      tipo: typeof query.tipo === 'string' ? query.tipo : undefined,
      q: typeof query.q === 'string' ? query.q : undefined,
    })
    res.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudieron listar movimientos'
    res.status(message.includes('acceso') ? 403 : 400).json({ error: message })
  }
})

finanzasCajasRouter.post('/:id/movimientos', async (req, res) => {
  try {
    let body: Record<string, unknown> = {}
    let comprobante: { fileName: string; mimeType: string; buffer: Buffer } | null = null

    const contentType = req.headers['content-type'] ?? ''
    if (contentType.includes('multipart/form-data')) {
      const parsed = await parseMultipartUpload(req)
      body = parsed.fields
      if (parsed.file) {
        comprobante = {
          fileName: parsed.file.originalname,
          mimeType: parsed.file.mimetype,
          buffer: parsed.file.buffer,
        }
      }
    } else {
      body = req.body as Record<string, unknown>
    }

    const movimiento = await registerMovimiento({
      user: req.authedUser!,
      cajaId: req.params.id,
      body,
      comprobante,
    })
    res.status(201).json({ movimiento })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo registrar el movimiento'
    res.status(400).json({ error: message })
  }
})

finanzasCajasRouter.get('/:id/cierres', async (req, res) => {
  try {
    const cierres = await listCierres(req.authedUser!, req.params.id)
    res.json({ cierres })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudieron listar cierres'
    res.status(400).json({ error: message })
  }
})

finanzasCajasRouter.post('/:id/cerrar', async (req, res) => {
  try {
    const cierre = await cerrarCaja(req.authedUser!, req.params.id, req.body as Record<string, unknown>)
    res.status(201).json({ cierre })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo cerrar la caja'
    res.status(400).json({ error: message })
  }
})

finanzasCajasRouter.post('/:id/cierres/:cid/aprobar', async (req, res) => {
  try {
    const cierre = await aprobarCierre(req.authedUser!, req.params.id, req.params.cid)
    res.json({ cierre })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo aprobar'
    res.status(400).json({ error: message })
  }
})
