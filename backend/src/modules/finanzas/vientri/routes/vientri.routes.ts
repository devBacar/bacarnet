import { Router } from 'express'
import { requireFinanzasPermiso, requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import { hayImportacionEnCurso, leerEstado, leerLimpieza, listarPorCampos, VIENTRI_CHEQUES, VIENTRI_PENDIENTES } from '../services/vientri.repository.js'
import { iniciarTraerVientriDesdeDrive } from '../services/traer-desde-drive.js'

/**
 * Montado en /api/finanzas/vientri. Solo lectura: los datos se corrigen en Vientri.
 * GET /estado       fecha de los datos y resumen de la última importación
 * GET /cheques      ?direccion=recibido|emitido&estado=...&revisar=1&q=&page=
 * GET /pendientes   ?lado=pagar|cobrar|revisar&q=&page=
 * GET /limpieza     cheques viejos que en Vientri siguen abiertos (para Administración)
 * POST /traer-ahora dispara en segundo plano traer la última copia de Vientri (si hay una nueva).
 *                    Responde al toque; /estado.importando dice si todavía está corriendo. Pide finanzas_cheques.
 */
export const finanzasVientriRouter = Router()
finanzasVientriRouter.use(requireWorkspaceUser, requireViewFinanzas)

const POR_PAGINA = 50
const one = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined)

const DIRECCIONES = new Set(['recibido', 'emitido'])
const ESTADOS = new Set(['en_cartera', 'depositado', 'vendido', 'rechazado', 'entregado', 'pendiente_debito', 'debitado', 'anulado', 'otro'])
const LADOS = new Set(['pagar', 'cobrar', 'revisar'])

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function textoBuscable(d: Record<string, unknown>): string {
  const partes: unknown[] = [d.numero, d.comprobante, d.bancoNombre, d.destinatario, d.montoCentavos, d.pendienteCentavos]
  for (const k of ['librador', 'entregadoA', 'entregadoPor', 'persona']) {
    const p = d[k] as { nombre?: unknown; cuit?: unknown } | null | undefined
    if (p) partes.push(p.nombre, p.cuit)
  }
  return normalizar(partes.filter((x) => x !== null && x !== undefined).map(String).join(' '))
}

function paginar(items: Array<Record<string, unknown>>, page: number, campoImporte: string) {
  const total = items.length
  const totalCentavos = items.reduce((s, d) => s + (Number(d[campoImporte]) || 0), 0)
  const pages = Math.max(1, Math.ceil(total / POR_PAGINA))
  const p = Math.min(Math.max(1, page), pages)
  const limpio = items.slice((p - 1) * POR_PAGINA, p * POR_PAGINA).map((d) => {
    const { huella: _h, importacionId: _i, actualizadoAt: _a, ...resto } = d
    return resto
  })
  return { total, totalCentavos, page: p, pages, items: limpio }
}

finanzasVientriRouter.get('/estado', async (_req, res) => {
  try {
    const [estado, importando] = await Promise.all([leerEstado(), hayImportacionEnCurso()])
    res.json({ estado, importando })
  } catch (err) {
    console.error('[finanzas/vientri] estado', err)
    res.status(500).json({ error: 'No se pudo leer el estado de Vientri' })
  }
})

finanzasVientriRouter.get('/cheques', async (req, res) => {
  try {
    const direccion = one(req.query.direccion)
    const estado = one(req.query.estado)
    const q = one(req.query.q)
    if (direccion && !DIRECCIONES.has(direccion)) return void res.status(400).json({ error: 'direccion inválida' })
    if (estado && !ESTADOS.has(estado)) return void res.status(400).json({ error: 'estado inválido' })
    const filtros: Array<[string, string | boolean]> = []
    if (direccion) filtros.push(['direccion', direccion])
    if (estado) filtros.push(['estado', estado])
    if (one(req.query.revisar) === '1') filtros.push(['conRevisar', true])
    let items = await listarPorCampos(VIENTRI_CHEQUES, filtros)
    if (!estado) items = items.filter((d) => d.estado !== 'anulado')
    if (q) {
      const nq = normalizar(q)
      items = items.filter((d) => textoBuscable(d).includes(nq))
    }
    const asc = estado === 'en_cartera' || estado === 'pendiente_debito'
    items.sort((a, b) => {
      const fa = String(a.fechaVencimiento ?? '')
      const fb = String(b.fechaVencimiento ?? '')
      return asc ? fa.localeCompare(fb) : fb.localeCompare(fa)
    })
    res.json(paginar(items, Number(one(req.query.page) ?? 1), 'montoCentavos'))
  } catch (err) {
    console.error('[finanzas/vientri] cheques', err)
    res.status(500).json({ error: 'No se pudieron listar los cheques de Vientri' })
  }
})

finanzasVientriRouter.get('/pendientes', async (req, res) => {
  try {
    const lado = one(req.query.lado) ?? 'pagar'
    if (!LADOS.has(lado)) return void res.status(400).json({ error: 'lado inválido' })
    let items = await listarPorCampos(VIENTRI_PENDIENTES, [['lado', lado]])
    const q = one(req.query.q)
    if (q) {
      const nq = normalizar(q)
      items = items.filter((d) => textoBuscable(d).includes(nq))
    }
    items.sort((a, b) => String(a.fechaVencimiento ?? '9999').localeCompare(String(b.fechaVencimiento ?? '9999')))
    res.json(paginar(items, Number(one(req.query.page) ?? 1), 'pendienteCentavos'))
  } catch (err) {
    console.error('[finanzas/vientri] pendientes', err)
    res.status(500).json({ error: 'No se pudieron listar los pendientes de Vientri' })
  }
})

finanzasVientriRouter.post('/traer-ahora', requireFinanzasPermiso('finanzas_cheques'), async (req, res) => {
  try {
    const r = await iniciarTraerVientriDesdeDrive({ actor: req.authedUser?.uid ?? 'desconocido' })
    const { estado, mensaje } = r
    const fechaDatos = 'fechaDatos' in r ? r.fechaDatos : null
    res.json({ estado, mensaje, fechaDatos })
  } catch (err) {
    console.error('[finanzas/vientri] traer-ahora', err)
    res.status(500).json({ error: 'No se pudieron traer los datos de Vientri' })
  }
})

finanzasVientriRouter.get('/limpieza', async (_req, res) => {
  try {
    res.json(await leerLimpieza())
  } catch (err) {
    console.error('[finanzas/vientri] limpieza', err)
    res.status(500).json({ error: 'No se pudo leer el listado de limpieza' })
  }
})
