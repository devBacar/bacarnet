import { Router } from 'express'
import { requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import { ExtractoBancoError, ExtractoConsultaError } from '../domain/extracto.errors.js'
import { consultarExtracto, excelDeExtracto } from '../services/extractos.service.js'

export const finanzasExtractosRouter = Router()

finanzasExtractosRouter.use(requireWorkspaceUser, requireViewFinanzas)

function parametros(query: Record<string, unknown>): { cuentaId: string; desde: string; hasta: string } {
  const uno = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
  return {
    cuentaId: uno(query.cuentaId),
    desde: uno(query.desde),
    hasta: uno(query.hasta),
  }
}

function responderError(res: { status: (code: number) => { json: (body: unknown) => void } }, err: unknown): void {
  if (err instanceof ExtractoConsultaError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  if (err instanceof ExtractoBancoError) {
    console.error('[finanzas/extractos]', err.code, err.detalle, err.message)
    res.status(err.status >= 500 ? 502 : 400).json({ error: err.message })
    return
  }
  console.error('[finanzas/extractos]', err)
  res.status(502).json({ error: 'No se pudo bajar el extracto del banco. Probá de nuevo en un rato.' })
}

finanzasExtractosRouter.get('/excel', async (req, res) => {
  try {
    const { buffer, filename } = await excelDeExtracto(parametros(req.query as Record<string, unknown>))
    const ascii = filename.replace(/[^\x20-\x7E]+/g, '')
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    )
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition')
    res.setHeader('Content-Length', String(buffer.length))
    res.send(buffer)
  } catch (err) {
    responderError(res, err)
  }
})

finanzasExtractosRouter.get('/', async (req, res) => {
  try {
    const consulta = await consultarExtracto(parametros(req.query as Record<string, unknown>))
    res.json(consulta)
  } catch (err) {
    responderError(res, err)
  }
})
